"""The only module that talks to Gemini. Embeddings + streaming generation."""

import asyncio
import math
import re
import time

from google import genai
from google.genai import types

from .config import CHAT_MODEL, EMBED_DIM, EMBED_MODEL, GEMINI_API_KEY

DOCUMENT = "RETRIEVAL_DOCUMENT"
QUERY = "RETRIEVAL_QUERY"

# Free-tier quota guard. One call at a time, spaced to stay under the per-minute
# cap. Generation is the tighter of the two (15/min on the lite models), so it
# gets a wider spacing than embedding.
_MIN_INTERVAL = {"embed": 1.0, "generate": 4.2}
_gate = asyncio.Semaphore(1)
_last_call = {"embed": 0.0, "generate": 0.0}

_client = genai.Client(api_key=GEMINI_API_KEY) if GEMINI_API_KEY else None


def client() -> genai.Client:
    if _client is None:
        raise RuntimeError("GEMINI_API_KEY is not set. Copy .env.example to .env.")
    return _client


class QuotaExceeded(Exception):
    """Free-tier quota hit. Ingestion should stop and stay resumable."""


def _l2_normalize(v: list[float]) -> list[float]:
    # REQUIRED. gemini-embedding-001 does not normalize when output_dimensionality
    # != 3072, and pgvector's cosine operator assumes nothing. Skip this and
    # retrieval degrades silently -- plausible results, wrong ranking.
    norm = math.sqrt(sum(x * x for x in v))
    return [x / norm for x in v] if norm else v


def _batches(texts: list[str], max_items: int = 64, max_chars: int = 80_000):
    """Batch by item count AND size. The model caps at 8192 input tokens; chars
    are a crude but safe proxy (~4 chars/token) and cost nothing to compute."""
    batch: list[str] = []
    size = 0
    for t in texts:
        if batch and (len(batch) >= max_items or size + len(t) > max_chars):
            yield batch
            batch, size = [], 0
        batch.append(t)
        size += len(t)
    if batch:
        yield batch


async def _throttle(kind: str):
    wait = _MIN_INTERVAL[kind] - (time.monotonic() - _last_call[kind])
    if wait > 0:
        await asyncio.sleep(wait)
    _last_call[kind] = time.monotonic()


def _classify(e: Exception) -> tuple[bool, float]:
    """(terminal, retry_after). A 429 is only terminal when it is the PER-DAY
    cap; a per-minute 429 carries a retryDelay and just needs waiting out.
    Getting this wrong is why the whole free tier looks broken."""
    s = str(e)
    if "429" not in s and "RESOURCE_EXHAUSTED" not in s:
        return False, 0.0
    if re.search(r"PerDay|RequestsPerDay", s, re.I):
        return True, 0.0
    m = re.search(r"retryDelay['\"]?:\s*['\"]?(\d+(?:\.\d+)?)s", s)
    return False, float(m.group(1)) + 1 if m else 30.0


async def _backoff(e: Exception, attempt: int, attempts: int) -> None:
    """Raise if there is no point retrying, otherwise sleep the right amount."""
    terminal, retry_after = _classify(e)
    if terminal:
        raise QuotaExceeded(str(e)) from e
    if attempt == attempts - 1:
        if retry_after:
            raise QuotaExceeded(str(e)) from e
        raise e
    await asyncio.sleep(retry_after or 2**attempt)


async def embed(texts: list[str], task_type: str) -> list[list[float]]:
    """Embed texts. Raises QuotaExceeded on 429 so the caller can checkpoint."""
    out: list[list[float]] = []
    for batch in _batches(texts):
        async with _gate:
            for attempt in range(5):
                await _throttle("embed")
                try:
                    r = await client().aio.models.embed_content(
                        model=EMBED_MODEL,
                        contents=batch,
                        config=types.EmbedContentConfig(
                            task_type=task_type, output_dimensionality=EMBED_DIM
                        ),
                    )
                    break
                except Exception as e:
                    await _backoff(e, attempt, 5)
        out += [_l2_normalize(list(e.values)) for e in r.embeddings]
    return out


async def stream_answer(prompt: str):
    """Yield answer text chunks as they arrive.

    Retries only before the first token. Once text has reached the caller a retry
    would duplicate it, so a mid-stream failure is raised instead of hidden."""
    for attempt in range(5):
        started = False
        try:
            async with _gate:
                await _throttle("generate")
                stream = await client().aio.models.generate_content_stream(
                    model=CHAT_MODEL, contents=prompt
                )
                async for part in stream:
                    if part.text:
                        started = True
                        yield part.text
            return
        except Exception as e:
            if started:
                raise
            await _backoff(e, attempt, 5)


async def complete(prompt: str) -> str:
    """Non-streaming generation. Used by the eval grader."""
    for attempt in range(5):
        err = None
        async with _gate:
            await _throttle("generate")
            try:
                r = await client().aio.models.generate_content(
                    model=CHAT_MODEL, contents=prompt
                )
                return r.text or ""
            except Exception as e:
                err = e
        await _backoff(err, attempt, 5)
    return ""


async def _self_check():
    def cos(a, b):
        return sum(x * y for x, y in zip(a, b))

    # A per-day 429 must stop ingestion; a per-minute 429 must only pause it.
    day = Exception("429 RESOURCE_EXHAUSTED quotaId: GenerateRequestsPerDayPerProjectPerModel-FreeTier")
    minute = Exception("429 RESOURCE_EXHAUSTED quotaId: RequestsPerMinutePerProjectPerModel-FreeTier, 'retryDelay': '38s'")
    assert _classify(day) == (True, 0.0), "per-day quota must be terminal"
    assert _classify(minute) == (False, 39.0), "per-minute quota must be retried"
    assert _classify(Exception("503 UNAVAILABLE")) == (False, 0.0), "5xx must be retried"
    print("ok  quota classifier: per-day stops, per-minute waits 39s, 503 retries")

    v = await embed(
        ["a cat sat on the mat", "a kitten rested on the rug", "quarterly tax filings"],
        DOCUMENT,
    )
    assert all(len(x) == EMBED_DIM for x in v), f"expected dim {EMBED_DIM}"
    for x in v:
        assert abs(math.sqrt(sum(i * i for i in x)) - 1.0) < 1e-6, "not L2 normalized"
    near, far = cos(v[0], v[1]), cos(v[0], v[2])
    assert near > far, f"semantics broken: related={near:.3f} unrelated={far:.3f}"

    q = (await embed(["where did the cat sit?"], QUERY))[0]
    assert cos(q, v[0]) > cos(q, v[2]), "asymmetric query embedding broken"

    got = "".join([c async for c in stream_answer("Reply with exactly: PONG")])
    assert "PONG" in got.upper(), f"generation broken: {got!r}"
    print(f"ok  dim={EMBED_DIM} normalized  related={near:.3f} > unrelated={far:.3f}")
    print(f"ok  streaming: {got.strip()!r}")


if __name__ == "__main__":
    asyncio.run(_self_check())
