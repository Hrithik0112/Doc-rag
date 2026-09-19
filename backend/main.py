import logging
import os
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from prometheus_client import CONTENT_TYPE_LATEST, generate_latest

from . import obs
from .config import CHAT_MODEL, EMBED_MODEL
from .db import close, pool
from .routes import router

_log = obs.log("papertrail.http")


def _tracing(app: FastAPI) -> None:
    """OTLP export is opt-in. Without a collector the SDK would retry a dead
    endpoint on every span, so absent OTEL_EXPORTER_OTLP_ENDPOINT we skip it
    entirely and the in-process spans still drive the histograms."""
    endpoint = os.environ.get("OTEL_EXPORTER_OTLP_ENDPOINT")
    if not endpoint:
        obs.event(_log, logging.INFO, "tracing export disabled",
                  hint="set OTEL_EXPORTER_OTLP_ENDPOINT to enable")
        return
    from opentelemetry import trace
    from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
    from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
    from opentelemetry.sdk.resources import Resource
    from opentelemetry.sdk.trace import TracerProvider
    from opentelemetry.sdk.trace.export import BatchSpanProcessor

    provider = TracerProvider(resource=Resource.create({"service.name": "papertrail"}))
    provider.add_span_processor(BatchSpanProcessor(OTLPSpanExporter()))
    trace.set_tracer_provider(provider)
    FastAPIInstrumentor.instrument_app(app)
    obs.event(_log, logging.INFO, "tracing export enabled", endpoint=endpoint)


@asynccontextmanager
async def lifespan(app: FastAPI):
    obs.setup_logging()
    _tracing(app)
    await pool()
    obs.event(_log, logging.INFO, "ready", embed_model=EMBED_MODEL, chat_model=CHAT_MODEL)
    yield
    await close()


app = FastAPI(title="PaperTrail", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"], allow_headers=["*"],
)


@app.middleware("http")
async def correlate(request: Request, call_next):
    """Every response carries the id its logs are tagged with, so a row in the
    dashboard can be traced back to what actually happened."""
    rid = obs.new_request_id()
    start = time.monotonic()
    try:
        response = await call_next(request)
    except Exception as e:
        obs.event(_log, logging.ERROR, "unhandled request error",
                  path=request.url.path, error_kind=obs.classify(e), error=str(e)[:300])
        raise
    took = int((time.monotonic() - start) * 1000)
    response.headers["X-Request-Id"] = rid
    if request.url.path not in ("/api/health", "/metrics"):
        obs.event(_log, logging.INFO, "request",
                  method=request.method, path=request.url.path,
                  status=response.status_code, ms=took)
    return response


app.include_router(router, prefix="/api")


@app.get("/metrics")
async def metrics():
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)


@app.get("/api/health")
async def health(response: Response):
    """Checks the dependency rather than reporting that the process is alive.
    A health check that cannot fail tells you nothing."""
    checks: dict[str, dict] = {}

    start = time.monotonic()
    try:
        p = await pool()
        async with p.acquire() as conn:
            chunks = await conn.fetchval("SELECT count(*) FROM chunks")
            pending = await conn.fetchval(
                "SELECT count(*) FROM chunks WHERE embedding IS NULL")
        checks["database"] = {"ok": True, "ms": int((time.monotonic() - start) * 1000),
                              "chunks": chunks, "awaiting_embedding": pending}
    except Exception as e:  # noqa: BLE001
        checks["database"] = {"ok": False, "error_kind": obs.classify(e),
                              "error": str(e)[:200]}

    exhausted = [
        m for m in (EMBED_MODEL, CHAT_MODEL)
        if obs.QUOTA_EXHAUSTED.labels(model=m)._value.get() >= 1
    ]
    checks["gemini_quota"] = {"ok": not exhausted, "exhausted": exhausted}

    ok = all(c["ok"] for c in checks.values())
    response.status_code = 200 if ok else 503
    return {"ok": ok, "checks": checks}
