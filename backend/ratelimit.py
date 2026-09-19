import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request

# ponytail: in-process, per-worker. Swap for Redis if you run multiple workers.
_hits: dict[tuple[str, str], deque] = defaultdict(deque)


def limit(name: str, times: int, seconds: int):
    async def dep(request: Request):
        key = (name, request.client.host if request.client else "?")
        now = time.monotonic()
        q = _hits[key]
        while q and now - q[0] > seconds:
            q.popleft()
        if len(q) >= times:
            raise HTTPException(429, f"Rate limit: {times} per {seconds}s on {name}.")
        q.append(now)
    return dep
