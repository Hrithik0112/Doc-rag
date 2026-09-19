import json
import time

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from . import citations, gemini, ingest, retrieval, stats
from .db import pool
from .ratelimit import limit

router = APIRouter()

MAX_UPLOAD_MB = 25


@router.post("/upload", status_code=202, dependencies=[Depends(limit("upload", 10, 60))])
async def upload(bg: BackgroundTasks, file: UploadFile = File(...)):
    if not (file.filename or "").lower().endswith(".pdf"):
        raise HTTPException(400, "Only PDF files are supported.")
    data = await file.read()
    if len(data) > MAX_UPLOAD_MB * 1024 * 1024:
        raise HTTPException(413, f"File exceeds {MAX_UPLOAD_MB}MB.")
    try:
        doc_id = await ingest.create_document(file.filename, data)
    except ValueError as e:
        raise HTTPException(422, str(e))
    bg.add_task(ingest.embed_pending, doc_id)
    return {"doc_id": doc_id, "status": "pending"}


@router.get("/documents")
async def list_documents():
    p = await pool()
    async with p.acquire() as conn:
        rows = await conn.fetch(
            "SELECT id, filename, status, error, n_pages, n_chunks, n_embedded, created_at "
            "FROM documents ORDER BY created_at DESC")
    return [dict(r) for r in rows]


@router.get("/documents/{doc_id}")
async def get_document(doc_id: str):
    p = await pool()
    async with p.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT id, filename, status, error, n_pages, n_chunks, n_embedded, created_at "
            "FROM documents WHERE id=$1", doc_id)
    if not row:
        raise HTTPException(404, "No such document.")
    return dict(row)


@router.post("/documents/{doc_id}/resume")
async def resume(doc_id: str, bg: BackgroundTasks):
    """Pick up a document that stopped partway, typically on a free-tier quota
    cap. Already-embedded chunks are never redone."""
    doc = await get_document(doc_id)
    if doc["status"] == "processing":
        raise HTTPException(409, "Already processing.")
    bg.add_task(ingest.embed_pending, doc_id)
    return {"doc_id": doc_id, "resumed_from": doc["n_embedded"], "of": doc["n_chunks"]}


@router.delete("/documents/{doc_id}", status_code=204)
async def delete_document(doc_id: str):
    p = await pool()
    async with p.acquire() as conn:
        r = await conn.execute("DELETE FROM documents WHERE id=$1", doc_id)
    if r.endswith(" 0"):
        raise HTTPException(404, "No such document.")


class Query(BaseModel):
    question: str
    doc_ids: list[str] | None = None   # None = search the whole corpus
    top_k: int = retrieval.TOP_K


@router.post("/query", dependencies=[Depends(limit("query", 20, 60))])
async def query(q: Query):
    if not q.question.strip():
        raise HTTPException(400, "Question is empty.")

    usage: dict = {}
    t0 = time.monotonic()
    try:
        hits = await retrieval.search(q.question, q.doc_ids, min(q.top_k, 20), usage=usage)
    except gemini.QuotaExceeded as e:
        await stats.log_query(question=q.question, scope_doc_ids=q.doc_ids,
                              status="quota", error=str(e), **usage)
        raise HTTPException(429, f"Gemini quota exceeded while embedding the question: {e}")
    retrieval_ms = int((time.monotonic() - t0) * 1000)

    async def stream():
        def sse(event, data):
            return f"event: {event}\ndata: {json.dumps(data, default=str)}\n\n"

        summary = stats.summarize_hits(hits)

        if not hits:
            yield sse("sources", [])
            yield sse("token", "I have no indexed passages to answer from. "
                                "Upload a document, or wait for processing to finish.")
            yield sse("done", {"unverified_citations": []})
            await stats.log_query(question=q.question, scope_doc_ids=q.doc_ids,
                                  status="no_hits", retrieval_ms=retrieval_ms,
                                  **summary, **usage)
            return

        multi = len({h["document_id"] for h in hits}) > 1 or q.doc_ids is None
        # sources first so citation cards render while the answer is still typing
        yield sse("sources", [
            {"page": h["page_num"], "filename": h["filename"],
             "document_id": str(h["document_id"]), "excerpt": h["content"],
             "score": float(h["score"]),
             "matched": [k for k in ("vector", "keyword")
                         if h["vec_rank" if k == "vector" else "kw_rank"] is not None]}
            for h in hits])

        parts = []
        g0 = time.monotonic()
        try:
            async for tok in gemini.stream_answer(
                retrieval.build_prompt(q.question, hits, multi), usage
            ):
                parts.append(tok)
                yield sse("token", tok)
        except gemini.QuotaExceeded as e:
            yield sse("error", f"Gemini free-tier quota exceeded: {e}")
            await stats.log_query(question=q.question, scope_doc_ids=q.doc_ids,
                                  status="quota", error=str(e),
                                  retrieval_ms=retrieval_ms,
                                  generation_ms=int((time.monotonic() - g0) * 1000),
                                  **summary, **usage)
            return
        except Exception as e:  # noqa: BLE001 -- the stream is already open
            yield sse("error", f"Generation failed: {e}")
            await stats.log_query(question=q.question, scope_doc_ids=q.doc_ids,
                                  status="error", error=str(e),
                                  retrieval_ms=retrieval_ms,
                                  generation_ms=int((time.monotonic() - g0) * 1000),
                                  **summary, **usage)
            return

        answer = "".join(parts)
        unverified = citations.verify(answer, hits)
        yield sse("done", {"unverified_citations": unverified})

        await stats.log_query(
            question=q.question, scope_doc_ids=q.doc_ids, status="ok",
            retrieval_ms=retrieval_ms,
            generation_ms=int((time.monotonic() - g0) * 1000),
            n_citations=len(citations.parse(answer)), n_unverified=len(unverified),
            **summary, **usage,
        )

    return StreamingResponse(stream(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


# ── dashboard ────────────────────────────────────────────────────────────

@router.get("/stats/overview")
async def stats_overview():
    return await stats.overview()


@router.get("/stats/timeseries")
async def stats_timeseries(days: int = 14):
    # the activity grid asks for a year; generate_series zero-fills the gaps
    return await stats.timeseries(max(1, min(days, 400)))


@router.get("/stats/queries")
async def stats_queries(limit: int = 25):
    return await stats.recent_queries(limit)


@router.get("/stats/scores")
async def stats_scores():
    return await stats.score_buckets()


@router.get("/stats/evals")
async def stats_evals():
    return await stats.eval_runs()
