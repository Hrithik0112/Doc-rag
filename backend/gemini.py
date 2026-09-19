"""The only module that talks to Gemini. Embeddings + streaming generation."""

import asyncio
import math
import logging
import re
import time

import tiktoken

from google import genai
from google.genai import types

from . import obs
from .config import CHAT_MODEL, EMBED_DIM, EMBED_MODEL, GEMINI_API_KEY

_log = obs.log("papertrail.gemini")

DOCUMENT = "RETRIEVAL_DOCUMENT"
QUERY = "RETRIEVAL_QUERY"

# The embed endpoint returns no usage metadata, so embedding cost can only be
# estimated locally. cl100k is not Gemini's tokenizer, so this is within maybe
# 10-15% -- everything downstream carries "_est" in the name to keep that visible.
_est_enc = tiktoken.get_encoding("cl100k_base")


def estimate_tokens(texts: list[str]) -> int:
    return sum(len(_est_enc.encode(t)) for t in texts)

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


async def _throttle(kind: str, usage: dict | None = None):
    """Time spent here is self-inflicted, not the API being slow. It has to be
    separable from upstream latency or every tuning decision is a guess."""
    wait = _MIN_INTERVAL[kind] - (time.monotonic() - _last_call[kind])
    if wait > 0:
        await asyncio.sleep(wait)
        obs.THROTTLE_SECONDS.labels(op=kind).inc(wait)
        if usage is not None:
            usage["throttle_ms"] = usage.get("throttle_ms", 0) + int(wait * 1000)
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


async def _backoff(e: Exception, attempt: int, attempts: int, op: str,
                   usage: dict | None = None) -> None:
    """Raise if there is no point retrying, otherwise sleep the right amount."""
    terminal, retry_after = _classify(e)
    kind = obs.classify(e)
    obs.RETRIES.labels(op=op, error_kind=kind).inc()
    if usage is not None:
        usage["retries"] = usage.get("retries", 0) + 1
    obs.event(_log, logging.WARNING, "gemini call failed",
              op=op, attempt=attempt + 1, of=attempts, error_kind=kind,
              terminal=terminal, retry_after_s=retry_after, error=str(e)[:300])
    if terminal:
        obs.QUOTA_EXHAUSTED.labels(model=CHAT_MODEL if op == "generate" else EMBED_MODEL).set(1)
        raise QuotaExceeded(str(e)) from e
    if attempt == attempts - 1:
        if retry_after:
            raise QuotaExceeded(str(e)) from e
        raise e
    await asyncio.sleep(retry_after or 2**attempt)


async def embed(
    texts: list[str], task_type: str, usage: dict | None = None
) -> list[list[float]]:
    """Embed texts. Raises QuotaExceeded on 429 so the caller can checkpoint.

    If `usage` is given, accumulates "embed_tokens_est" and "embed_calls" into it."""
    est = estimate_tokens(texts)
    obs.TOKENS.labels(kind="embed_estimated").inc(est)
    obs.COST.inc(obs.estimate_cost(embed=est))
    if usage is not None:
        usage["embed_tokens_est"] = usage.get("embed_tokens_est", 0) + est
    out: list[list[float]] = []
    for batch in _batches(texts):
        async with _gate:
            for attempt in range(5):
                await _throttle("embed", usage)
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
                    await _backoff(e, attempt, 5, "embed", usage)
        obs.GEMINI_CALLS.labels(op="embed", outcome="ok").inc()
        # a success proves the cap is no longer hit; a gauge only ever set to 1
        # reads as permanently exhausted once the quota resets
        obs.QUOTA_EXHAUSTED.labels(model=EMBED_MODEL).set(0)
        if usage is not None:
            usage["embed_calls"] = usage.get("embed_calls", 0) + 1
        out += [_l2_normalize(list(e.values)) for e in r.embeddings]
    return out


async def stream_answer(prompt: str, usage: dict | None = None):
    """Yield answer text chunks as they arrive.

    Retries only before the first token. Once text has reached the caller a retry
    would duplicate it, so a mid-stream failure is raised instead of hidden.

    If `usage` is given, fills in real token counts. The streaming API reports
    usage on trailing chunks, so read every chunk and keep the last one seen."""
    for attempt in range(5):
        started = False
        try:
            async with _gate:
                await _throttle("generate", usage)
                stream = await client().aio.models.generate_content_stream(
                    model=CHAT_MODEL, contents=prompt
                )
                obs.GEMINI_CALLS.labels(op="generate", outcome="ok").inc()
                obs.QUOTA_EXHAUSTED.labels(model=CHAT_MODEL).set(0)
                async for part in stream:
                    if usage is not None and part.usage_metadata:
                        _record(usage, part.usage_metadata)
                    if part.text:
                        started = True
                        yield part.text
            return
        except Exception as e:
            if started:
                raise
            await _backoff(e, attempt, 5, "generate", usage)


def _record(usage: dict, meta) -> None:
    """Token counts here are reported by the API, not estimated."""
    usage["prompt_tokens"] = meta.prompt_token_count or 0
    usage["completion_tokens"] = meta.candidates_token_count or 0
    obs.TOKENS.labels(kind="prompt").inc(usage["prompt_tokens"])
    obs.TOKENS.labels(kind="completion").inc(usage["completion_tokens"])
    obs.COST.inc(obs.estimate_cost(prompt=usage["prompt_tokens"],
                                   completion=usage["completion_tokens"]))


async def complete(prompt: str, usage: dict | None = None) -> str:
    """Non-streaming generation. Used by the eval grader."""
    for attempt in range(5):
        err = None
        async with _gate:
            await _throttle("generate", usage)
            try:
                r = await client().aio.models.generate_content(
                    model=CHAT_MODEL, contents=prompt
                )
                obs.GEMINI_CALLS.labels(op="generate", outcome="ok").inc()
                obs.QUOTA_EXHAUSTED.labels(model=CHAT_MODEL).set(0)
                if usage is not None and r.usage_metadata:
                    _record(usage, r.usage_metadata)
                return r.text or ""
            except Exception as e:
                err = e
        await _backoff(err, attempt, 5, "generate", usage)
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

    u: dict = {}
    got = "".join([c async for c in stream_answer("Reply with exactly: PONG", u)])
    assert "PONG" in got.upper(), f"generation broken: {got!r}"
    assert u.get("prompt_tokens", 0) > 0 and u.get("completion_tokens", 0) > 0, (
        f"streaming usage not captured: {u}"
    )
    eu: dict = {}
    await embed(["token accounting"], DOCUMENT, eu)
    assert eu["embed_tokens_est"] > 0 and eu["embed_calls"] == 1, f"embed usage: {eu}"
    print(f"ok  usage: generation {u['prompt_tokens']}+{u['completion_tokens']} reported, "
          f"embedding {eu['embed_tokens_est']} estimated")

    # a gauge that only ever goes to 1 reports exhaustion forever
    obs.QUOTA_EXHAUSTED.labels(model=CHAT_MODEL).set(1)
    await complete("say ok")
    stuck = obs.QUOTA_EXHAUSTED.labels(model=CHAT_MODEL)._value.get()
    assert stuck == 0, f"quota gauge did not clear after a success: {stuck}"
    print("ok  quota gauge clears on a successful call")
    print(f"ok  dim={EMBED_DIM} normalized  related={near:.3f} > unrelated={far:.3f}")
    print(f"ok  streaming: {got.strip()!r}")


if __name__ == "__main__":
    asyncio.run(_self_check())
