import time
from collections import deque

from fastapi import HTTPException, Request

# ponytail: in-process, per-worker. Swap for Redis if you run multiple workers.
#
# The previous version was a defaultdict that only ever grew: one deque per
# (route, client) that was trimmed internally but never removed, so every
# distinct address left a permanent entry. Fine on a laptop, unbounded once
# it faces the internet.
_hits: dict[tuple[str, str], deque] = {}
_last_sweep = 0.0

SWEEP_EVERY = 60.0   # seconds between sweeps; a sweep is O(keys)
MAX_KEYS = 10_000    # hard ceiling so a flood of unique addresses cannot grow it


def _sweep(now: float, seconds: int) -> None:
    """Drop keys with nothing left inside their window. Amortised: runs at most
    once a minute, and the ceiling below bounds the worst case regardless."""
    global _last_sweep
    _last_sweep = now
    for key in [k for k, q in _hits.items() if not q or now - q[-1] > seconds]:
        del _hits[key]


def limit(name: str, times: int, seconds: int):
    async def dep(request: Request):
        now = time.monotonic()
        if now - _last_sweep > SWEEP_EVERY:
            _sweep(now, seconds)

        key = (name, request.client.host if request.client else "?")
        q = _hits.get(key)
        if q is None:
            if len(_hits) >= MAX_KEYS:
                # Shedding beats unbounded growth: a full table means an address
                # flood, and this endpoint is not worth an OOM.
                _sweep(now, seconds)
                if len(_hits) >= MAX_KEYS:
                    raise HTTPException(429, "Rate limiter saturated; try again shortly.")
            q = _hits[key] = deque()

        while q and now - q[0] > seconds:
            q.popleft()
        if len(q) >= times:
            raise HTTPException(429, f"Rate limit: {times} per {seconds}s on {name}.")
        q.append(now)

    return dep


def _self_check():
    class Client:
        def __init__(self, host): self.host = host

    class Req:
        def __init__(self, host): self.client = Client(host)

    import asyncio

    global _last_sweep
    _hits.clear()
    _last_sweep = 0.0
    dep = limit("t", times=2, seconds=1)

    # the window itself still works
    asyncio.run(dep(Req("a")))
    asyncio.run(dep(Req("a")))
    try:
        asyncio.run(dep(Req("a")))
        raise AssertionError("third call inside the window should have been refused")
    except HTTPException as e:
        assert e.status_code == 429

    # one key per distinct address, as before
    for i in range(500):
        asyncio.run(dep(Req(f"addr-{i}")))
    assert len(_hits) == 501, len(_hits)

    # ...but they do not survive their window. This is the whole fix: the old
    # version stayed at 501 forever.
    _last_sweep = 0.0
    time.sleep(1.1)
    asyncio.run(dep(Req("fresh")))
    assert len(_hits) == 1, f"stale keys were not reclaimed: {len(_hits)} left"
    print("ok  ratelimit: window enforced, and 501 idle keys reclaimed down to 1")


if __name__ == "__main__":
    _self_check()
