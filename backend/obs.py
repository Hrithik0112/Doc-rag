"""Logging, spans, metrics and the error taxonomy.

One module so a signal is emitted once and lands everywhere: the structured
log, the OpenTelemetry span, the Prometheus counter, and the row the dashboard
reads. Anything that reports a failure in only one of those is a blind spot."""

import json
import logging
import os
import sys
import time
import uuid
from contextlib import contextmanager
from contextvars import ContextVar

from opentelemetry import trace
from prometheus_client import Counter, Gauge, Histogram

# ── error taxonomy ───────────────────────────────────────────────────────
# Free-text error strings cannot be counted, alerted on, or compared across
# releases. Every failure path maps to one of these.
QUOTA_DAY = "quota_daily"        # terminal until the cap resets
QUOTA_MINUTE = "quota_per_minute"  # retryable, carries a retryDelay
UPSTREAM = "upstream"            # 5xx or transport failure from the model API
TIMEOUT = "timeout"
NO_TEXT = "no_extractable_text"  # scanned PDF, needs OCR we do not have
BAD_INPUT = "bad_input"
DB = "database"
UNKNOWN = "unknown"

ERROR_KINDS = (QUOTA_DAY, QUOTA_MINUTE, UPSTREAM, TIMEOUT, NO_TEXT, BAD_INPUT, DB, UNKNOWN)


def classify(exc: BaseException) -> str:
    """Map an exception to one taxonomy bucket. Order matters: the quota checks
    must run before the generic 429/5xx checks."""
    s = str(exc)
    low = s.lower()
    if "429" in s or "resource_exhausted" in low:
        return QUOTA_DAY if "perday" in low.replace("_", "") else QUOTA_MINUTE
    if "timeout" in low or "timed out" in low:
        return TIMEOUT
    if any(c in s for c in ("500", "502", "503", "504")) or "unavailable" in low:
        return UPSTREAM
    if "no extractable text" in low:
        return NO_TEXT
    if isinstance(exc, (ValueError, TypeError)):
        return BAD_INPUT
    if exc.__class__.__module__.startswith("asyncpg"):
        return DB
    return UNKNOWN


# ── request correlation ──────────────────────────────────────────────────
# Without this a dashboard row and a log line cannot be tied together, which
# is the difference between "a query failed" and "this query failed, here is
# everything that happened inside it".
request_id: ContextVar[str] = ContextVar("request_id", default="-")


def new_request_id() -> str:
    rid = uuid.uuid4().hex[:12]
    request_id.set(rid)
    return rid


# ── structured logging ───────────────────────────────────────────────────
class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        out = {
            "ts": time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime(record.created)),
            "level": record.levelname.lower(),
            "logger": record.name,
            "msg": record.getMessage(),
            "request_id": request_id.get(),
        }
        span = trace.get_current_span().get_span_context()
        if span.is_valid:
            out["trace_id"] = format(span.trace_id, "032x")
        if record.exc_info:
            out["error_kind"] = classify(record.exc_info[1])
            out["error"] = str(record.exc_info[1])[:500]
        out.update(getattr(record, "extra_fields", {}) or {})
        return json.dumps(out, default=str)


def setup_logging() -> None:
    handler = logging.StreamHandler(sys.stdout)
    # JSON for machines, plain text when a person is watching a terminal
    handler.setFormatter(
        JsonFormatter() if os.environ.get("LOG_FORMAT", "json") == "json"
        else logging.Formatter("%(levelname)-8s %(name)s  %(message)s")
    )
    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(os.environ.get("LOG_LEVEL", "INFO").upper())
    logging.getLogger("uvicorn.access").handlers = []


def log(name: str = "papertrail") -> logging.Logger:
    return logging.getLogger(name)


def event(logger: logging.Logger, level: int, msg: str, **fields) -> None:
    logger.log(level, msg, extra={"extra_fields": fields})


# ── metrics ──────────────────────────────────────────────────────────────
QUERIES = Counter("papertrail_queries_total", "Questions answered", ["status"])
QUERY_SECONDS = Histogram(
    "papertrail_query_seconds", "End-to-end question latency", ["stage"],
    buckets=(0.05, 0.1, 0.25, 0.5, 1, 2, 4, 8, 16, 32),
)
TOKENS = Counter("papertrail_tokens_total", "Model tokens", ["kind"])
COST = Counter("papertrail_estimated_cost_usd_total",
               "Cost these tokens WOULD incur on the paid tier; the free tier bills nothing")
GEMINI_CALLS = Counter("papertrail_gemini_calls_total", "Gemini calls", ["op", "outcome"])
RETRIES = Counter("papertrail_gemini_retries_total", "Gemini retries", ["op", "error_kind"])
THROTTLE_SECONDS = Counter("papertrail_throttle_seconds_total",
                           "Seconds spent waiting on our own rate limiter", ["op"])
CITATIONS = Counter("papertrail_citations_total", "Citations emitted", ["verified"])
INGEST_SECONDS = Histogram("papertrail_ingest_seconds", "Ingestion stage duration", ["stage"])
QUOTA_EXHAUSTED = Gauge("papertrail_quota_exhausted",
                        "1 while a daily cap is known to be hit", ["model"])

tracer = trace.get_tracer("papertrail")


@contextmanager
def span(name: str, **attrs):
    """Time a stage once, into the trace, the histogram, and a dict the caller
    can persist. Splitting a duration across three call sites is how they drift."""
    took: dict[str, float] = {}
    start = time.monotonic()
    with tracer.start_as_current_span(name) as sp:
        for k, v in attrs.items():
            sp.set_attribute(k, v)
        try:
            yield took
        finally:
            took["ms"] = int((time.monotonic() - start) * 1000)
            sp.set_attribute("duration_ms", took["ms"])


# ── cost ─────────────────────────────────────────────────────────────────
# Paid-tier list prices, USD per million tokens. We run on the free tier, so
# actual spend is zero: this is "what this traffic would cost", and every
# surface that shows it must say so.
PRICE_PER_M = {"prompt": 0.30, "completion": 2.50, "embed": 0.20}


def estimate_cost(prompt: int = 0, completion: int = 0, embed: int = 0) -> float:
    return (
        prompt / 1e6 * PRICE_PER_M["prompt"]
        + completion / 1e6 * PRICE_PER_M["completion"]
        + embed / 1e6 * PRICE_PER_M["embed"]
    )


def _self_check():
    class Fake(Exception):
        pass

    assert classify(Fake("429 RESOURCE_EXHAUSTED quotaId: GenerateRequestsPerDayPerProject")) == QUOTA_DAY
    assert classify(Fake("429 RESOURCE_EXHAUSTED RequestsPerMinutePerProject retryDelay 38s")) == QUOTA_MINUTE
    assert classify(Fake("503 UNAVAILABLE")) == UPSTREAM
    assert classify(Fake("deadline timed out")) == TIMEOUT
    assert classify(ValueError("No extractable text.")) == NO_TEXT, "message beats type"
    assert classify(ValueError("nope")) == BAD_INPUT
    assert classify(Fake("who knows")) == UNKNOWN
    assert all(classify(Fake(m)) in ERROR_KINDS for m in ("x", "429", "500"))

    # 1M prompt + 1M completion + 1M embed at list price
    assert abs(estimate_cost(1_000_000, 1_000_000, 1_000_000) - 3.00) < 1e-9
    assert estimate_cost() == 0.0

    with span("t") as took:
        pass
    assert "ms" in took and took["ms"] >= 0

    rid = new_request_id()
    assert len(rid) == 12 and request_id.get() == rid

    rec = logging.LogRecord("n", logging.ERROR, "p", 1, "boom", None,
                            (Fake, Fake("503 UNAVAILABLE"), None))
    parsed = json.loads(JsonFormatter().format(rec))
    assert parsed["error_kind"] == UPSTREAM and parsed["request_id"] == rid
    print(f"ok  obs: {len(ERROR_KINDS)} error kinds, cost + span + json log with request_id")


if __name__ == "__main__":
    _self_check()
