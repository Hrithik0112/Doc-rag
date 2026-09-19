"""Writes the query log and reads the aggregates the dashboard renders.

Everything here is derived from real traffic. Nothing is synthesized, and the
one estimated number (embedding tokens) keeps "_est" in its name all the way to
the UI, because the embed endpoint reports no usage."""

import json

from .config import CHAT_MODEL, EMBED_MODEL
from .db import pool


async def log_query(**f) -> None:
    """Never let bookkeeping break an answer the user already received."""
    try:
        p = await pool()
        async with p.acquire() as conn:
            await conn.execute(
                """INSERT INTO queries (
                     question, scope_doc_ids, status, error, n_hits, top_score, hits,
                     n_vector_only, n_keyword_only, n_both_arms,
                     n_citations, n_unverified,
                     prompt_tokens, completion_tokens, embed_tokens_est,
                     retrieval_ms, generation_ms)
                   VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)""",
                f["question"][:4000], f.get("scope_doc_ids"), f.get("status", "ok"),
                (f.get("error") or None) and str(f["error"])[:2000],
                f.get("n_hits", 0), f.get("top_score"), json.dumps(f.get("hits", [])),
                f.get("n_vector_only", 0), f.get("n_keyword_only", 0), f.get("n_both_arms", 0),
                f.get("n_citations", 0), f.get("n_unverified", 0),
                f.get("prompt_tokens", 0), f.get("completion_tokens", 0),
                f.get("embed_tokens_est", 0),
                f.get("retrieval_ms", 0), f.get("generation_ms", 0),
            )
    except Exception:  # noqa: BLE001 -- logging must never surface to the caller
        pass


def _arm_counts(hits: list[dict]) -> dict:
    v = sum(1 for h in hits if h["vec_rank"] is not None and h["kw_rank"] is None)
    k = sum(1 for h in hits if h["kw_rank"] is not None and h["vec_rank"] is None)
    return {"n_vector_only": v, "n_keyword_only": k, "n_both_arms": len(hits) - v - k}


def summarize_hits(hits: list[dict]) -> dict:
    """Store enough to explain a result later without keeping whole passages."""
    return {
        "n_hits": len(hits),
        "top_score": float(hits[0]["score"]) if hits else None,
        "hits": [
            {"page": h["page_num"], "filename": h["filename"],
             "score": round(float(h["score"]), 5),
             "arms": [a for a in ("vector", "keyword")
                      if h["vec_rank" if a == "vector" else "kw_rank"] is not None]}
            for h in hits
        ],
        **_arm_counts(hits),
    }


# ── dashboard reads ──────────────────────────────────────────────────────

_OVERVIEW = """
SELECT
  (SELECT count(*) FROM documents)                                  AS documents,
  (SELECT count(*) FROM documents WHERE status='ready')             AS documents_ready,
  (SELECT count(*) FROM documents WHERE status='failed')            AS documents_failed,
  (SELECT count(*) FROM documents
     WHERE status IN ('pending','processing'))                      AS documents_working,
  (SELECT coalesce(sum(n_pages),0)  FROM documents)                 AS pages,
  (SELECT count(*) FROM chunks)                                     AS chunks,
  (SELECT count(*) FROM chunks WHERE embedding IS NULL)             AS chunks_unembedded,
  (SELECT coalesce(sum(embed_tokens_est),0) FROM documents)         AS ingest_tokens_est,
  (SELECT count(*) FROM queries)                                    AS queries,
  (SELECT count(*) FROM queries WHERE status='ok')                  AS queries_ok,
  (SELECT count(*) FROM queries WHERE status='quota')               AS queries_quota,
  (SELECT count(*) FROM queries WHERE status='error')               AS queries_error,
  (SELECT count(*) FROM queries WHERE status='no_hits')             AS queries_no_hits,
  (SELECT count(*) FROM queries WHERE status='ok' AND n_citations>0) AS queries_cited,
  (SELECT count(*) FROM queries
     WHERE status='ok' AND n_citations>0 AND n_unverified=0)        AS queries_clean,
  (SELECT coalesce(sum(n_unverified),0) FROM queries)               AS unverified_citations,
  (SELECT coalesce(sum(n_citations),0)  FROM queries)               AS total_citations,
  (SELECT coalesce(sum(prompt_tokens),0)     FROM queries)          AS prompt_tokens,
  (SELECT coalesce(sum(completion_tokens),0) FROM queries)          AS completion_tokens,
  (SELECT coalesce(sum(embed_tokens_est),0)  FROM queries)          AS query_embed_tokens_est,
  (SELECT percentile_disc(0.5) WITHIN GROUP (ORDER BY retrieval_ms)
     FROM queries WHERE status='ok')                                AS retrieval_ms_p50,
  (SELECT percentile_disc(0.95) WITHIN GROUP (ORDER BY retrieval_ms)
     FROM queries WHERE status='ok')                                AS retrieval_ms_p95,
  (SELECT percentile_disc(0.5) WITHIN GROUP (ORDER BY generation_ms)
     FROM queries WHERE status='ok')                                AS generation_ms_p50,
  (SELECT percentile_disc(0.95) WITHIN GROUP (ORDER BY generation_ms)
     FROM queries WHERE status='ok')                                AS generation_ms_p95,
  (SELECT coalesce(sum(n_vector_only),0)  FROM queries)             AS hits_vector_only,
  (SELECT coalesce(sum(n_keyword_only),0) FROM queries)             AS hits_keyword_only,
  (SELECT coalesce(sum(n_both_arms),0)    FROM queries)             AS hits_both_arms
"""


async def overview() -> dict:
    p = await pool()
    async with p.acquire() as conn:
        row = await conn.fetchrow(_OVERVIEW)
    d = dict(row)
    d["embed_model"] = EMBED_MODEL
    d["chat_model"] = CHAT_MODEL
    return d


async def timeseries(days: int = 14) -> list[dict]:
    """Zero-filled so the chart shows quiet days instead of skipping them."""
    p = await pool()
    async with p.acquire() as conn:
        rows = await conn.fetch(
            """SELECT d::date AS day,
                      coalesce(q.n, 0)          AS queries,
                      coalesce(q.failed, 0)     AS failed,
                      coalesce(q.tokens, 0)     AS tokens,
                      coalesce(q.unverified, 0) AS unverified
               FROM generate_series(
                      (now() - make_interval(days => $1::int))::date,
                      now()::date, '1 day') d
               LEFT JOIN (
                 SELECT created_at::date AS day,
                        count(*) AS n,
                        count(*) FILTER (WHERE status <> 'ok') AS failed,
                        sum(prompt_tokens + completion_tokens) AS tokens,
                        sum(n_unverified) AS unverified
                 FROM queries GROUP BY 1
               ) q ON q.day = d::date
               ORDER BY day""",
            days,
        )
    return [dict(r) for r in rows]


async def recent_queries(limit: int = 25) -> list[dict]:
    p = await pool()
    async with p.acquire() as conn:
        rows = await conn.fetch(
            """SELECT id, question, status, error, n_hits, top_score, hits,
                      n_citations, n_unverified,
                      prompt_tokens, completion_tokens, embed_tokens_est,
                      retrieval_ms, generation_ms, created_at,
                      scope_doc_ids IS NULL AS corpus_wide
               FROM queries ORDER BY created_at DESC LIMIT $1""",
            min(limit, 200),
        )
    return [{**dict(r), "hits": json.loads(r["hits"])} for r in rows]


async def score_buckets() -> list[dict]:
    """Fusion-score distribution of top hits. A pile-up in the lowest bucket
    means retrieval is scraping, which shows up here before answers go wrong."""
    p = await pool()
    async with p.acquire() as conn:
        rows = await conn.fetch(
            """SELECT width_bucket(top_score, 0, 0.04, 8) AS bucket, count(*) AS n
               FROM queries WHERE status='ok' AND top_score IS NOT NULL
               GROUP BY 1 ORDER BY 1"""
        )
    by = {r["bucket"]: r["n"] for r in rows}
    return [{"bucket": i, "floor": round((i - 1) * 0.005, 4),
             "ceiling": round(i * 0.005, 4), "n": by.get(i, 0)} for i in range(1, 10)]


async def eval_runs(limit: int = 20) -> list[dict]:
    p = await pool()
    async with p.acquire() as conn:
        rows = await conn.fetch(
            "SELECT * FROM eval_runs ORDER BY created_at DESC LIMIT $1", min(limit, 100)
        )
    return [dict(r) for r in rows]


async def save_eval_run(**f) -> None:
    p = await pool()
    async with p.acquire() as conn:
        await conn.execute(
            """INSERT INTO eval_runs (embed_model, chat_model, n_questions,
                 recall_hybrid, recall_vector, n_graded, n_correct, n_partial,
                 n_citation_clean, duration_s)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)""",
            f["embed_model"], f["chat_model"], f["n_questions"],
            f["recall_hybrid"], f["recall_vector"], f.get("n_graded", 0),
            f.get("n_correct", 0), f.get("n_partial", 0),
            f.get("n_citation_clean", 0), f.get("duration_s", 0),
        )


def _self_check():
    hits = [
        {"page_num": 3, "filename": "a.pdf", "score": 0.031, "vec_rank": 1, "kw_rank": 1},
        {"page_num": 7, "filename": "a.pdf", "score": 0.016, "vec_rank": 2, "kw_rank": None},
        {"page_num": 2, "filename": "b.pdf", "score": 0.015, "vec_rank": None, "kw_rank": 1},
    ]
    s = summarize_hits(hits)
    assert s["n_hits"] == 3
    assert s["top_score"] == 0.031, s["top_score"]
    # the three arm buckets must partition the hits exactly, or the dashboard's
    # "which arm found it" meter silently double-counts or loses passages
    assert s["n_both_arms"] == 1 and s["n_vector_only"] == 1 and s["n_keyword_only"] == 1
    assert s["n_both_arms"] + s["n_vector_only"] + s["n_keyword_only"] == s["n_hits"]
    assert s["hits"][0]["arms"] == ["vector", "keyword"]
    assert s["hits"][2]["arms"] == ["keyword"]
    assert "content" not in s["hits"][0], "passage text must not be copied into the log"

    empty = summarize_hits([])
    assert empty["n_hits"] == 0 and empty["top_score"] is None and empty["hits"] == []
    print("ok  stats: arm buckets partition hits, no passage text duplicated")


if __name__ == "__main__":
    _self_check()
