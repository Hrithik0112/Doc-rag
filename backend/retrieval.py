"""Hybrid retrieval: vector search + Postgres full-text, fused with Reciprocal
Rank Fusion. Vector search alone misses exact strings (dates, figures, names);
keyword search alone misses paraphrase. RRF needs no score normalization between
the two incomparable scales, and no tuning."""

import asyncio

from . import gemini
from .db import pool

RRF_K = 60       # standard RRF constant
CANDIDATES = 30  # per arm, before fusion
TOP_K = 5

_SQL = """
WITH vec AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY embedding <=> $1) AS rank
  FROM chunks
  WHERE embedding IS NOT NULL
    AND ($2::uuid[] IS NULL OR document_id = ANY($2))
  ORDER BY embedding <=> $1
  LIMIT $4
),
kw AS (
  SELECT c.id, ROW_NUMBER() OVER (ORDER BY ts_rank_cd(c.tsv, q) DESC) AS rank
  FROM chunks c, plainto_tsquery('english', $3) q
  WHERE c.tsv @@ q
    AND ($2::uuid[] IS NULL OR c.document_id = ANY($2))
  ORDER BY ts_rank_cd(c.tsv, q) DESC
  LIMIT $4
)
SELECT c.id, c.content, c.page_num, c.document_id, d.filename,
       COALESCE(1.0/($6 + vec.rank), 0) + COALESCE(1.0/($6 + kw.rank), 0) AS score,
       vec.rank AS vec_rank, kw.rank AS kw_rank
FROM chunks c
JOIN documents d ON d.id = c.document_id
LEFT JOIN vec ON vec.id = c.id
LEFT JOIN kw  ON kw.id  = c.id
WHERE vec.id IS NOT NULL OR kw.id IS NOT NULL
ORDER BY score DESC
LIMIT $5
"""


async def search(question: str, doc_ids: list[str] | None = None, top_k: int = TOP_K,
                 use_keyword: bool = True, usage: dict | None = None) -> list[dict]:
    """doc_ids=None searches the whole corpus. use_keyword=False gives the
    vector-only baseline the eval harness compares against."""
    qvec = (await gemini.embed([question], gemini.QUERY, usage))[0]
    p = await pool()
    async with p.acquire() as conn:
        rows = await conn.fetch(
            _SQL, qvec, doc_ids, question if use_keyword else "",
            CANDIDATES, top_k, RRF_K,
        )
    return [dict(r) for r in rows]


def build_prompt(question: str, hits: list[dict], multi_doc: bool) -> str:
    """Citation label must include the filename when searching many documents,
    or page numbers from different PDFs collide and a citation means nothing."""
    blocks = []
    for h in hits:
        label = f"{h['filename']}, Page {h['page_num']}" if multi_doc else f"Page {h['page_num']}"
        blocks.append(f"[{label}]\n{h['content']}")
    context = "\n\n---\n\n".join(blocks)
    example = "[report.pdf, Page 3]" if multi_doc else "[Page 3]"
    return f"""Answer the question using ONLY the context below.
If the context does not contain the answer, say so plainly and stop.
Cite the source after every claim, in square brackets, exactly as it is labelled
in the context. For example: {example}
Do not cite anything that does not appear in the context.
Write plain prose in full sentences. Do not use markdown, bullets or headings.

Context:
{context}

Question: {question}"""


async def _self_check():
    """Inserts a doc with a rare exact string, then proves keyword search finds
    it. This is the check that catches a vector-only or broken-fusion regression."""
    import uuid
    p = await pool()
    rare = "Zorblatt QX-7741 quarterly variance"
    texts = [
        f"The {rare} was recorded in the audit appendix.",
        "Cats are small domesticated carnivorous mammals kept as pets.",
        "Photosynthesis converts light energy into chemical energy in plants.",
        "The board approved the annual operating budget without amendment.",
    ]
    vecs = await gemini.embed(texts, gemini.DOCUMENT)
    async with p.acquire() as conn, conn.transaction():
        doc_id = await conn.fetchval(
            "INSERT INTO documents (filename,status,n_pages,n_chunks,n_embedded) "
            "VALUES ('__selfcheck.pdf','ready',1,$1,$1) RETURNING id", len(texts))
        await conn.executemany(
            "INSERT INTO chunks (document_id,chunk_idx,page_num,content,embedding) "
            "VALUES ($1,$2,$3,$4,$5)",
            [(doc_id, i, i + 1, t, v) for i, (t, v) in enumerate(zip(texts, vecs))])
    try:
        ids = [str(doc_id)]
        hits = await search(f"what is {rare}?", ids, top_k=2)
        assert hits[0]["content"] == texts[0], f"exact-string retrieval failed: {hits[0]}"
        assert hits[0]["kw_rank"] == 1, "keyword arm did not fire"
        assert hits[0]["vec_rank"] is not None, "vector arm did not fire"

        para = await search("which animals do people keep in their homes?", ids, top_k=2)
        assert para[0]["content"] == texts[1], f"paraphrase retrieval failed: {para[0]}"
        assert para[0]["kw_rank"] is None, "expected a vector-only win here"

        prompt = build_prompt("q?", hits, multi_doc=False)
        assert "[Page 1]" in prompt and "ONLY the context" in prompt
        print(f"ok  hybrid: exact-string via keyword (rank {hits[0]['kw_rank']}), "
              f"paraphrase via vector, fusion score {hits[0]['score']:.4f}")
    finally:
        async with p.acquire() as conn:
            await conn.execute("DELETE FROM documents WHERE id=$1", doc_id)


if __name__ == "__main__":
    asyncio.run(_self_check())
