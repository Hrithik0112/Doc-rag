"""Parse -> chunk -> insert (embedding NULL) -> embed in batches.

Chunks are written to the DB BEFORE any API call. That single ordering choice is
what makes ingestion resumable: a chunk with a NULL embedding is unfinished work,
so a quota failure mid-document costs nothing and never redoes work.
"""

import asyncio
import re
import time

import pymupdf
import tiktoken

from . import gemini
from .db import pool

_enc = tiktoken.get_encoding("cl100k_base")

CHUNK_TOKENS = 500
OVERLAP = 50
EMBED_BATCH = 64


# PDFs hyphenate across line breaks, so "tokens" is extracted as "to-\nkens".
# Left alone it breaks keyword search on exactly the technical terms people ask
# about, and splits the word for the embedder too.
_HYPHEN = re.compile(r"(\w)-\n(\w)")


def extract_pages(pdf_bytes: bytes) -> list[str]:
    with pymupdf.open(stream=pdf_bytes, filetype="pdf") as doc:
        return [_HYPHEN.sub(r"\1\2", p.get_text()) for p in doc]


def chunk_pages(pages: list[str]) -> list[tuple[int, str]]:
    """Page-scoped chunks. A chunk never straddles two pages, which is the whole
    reason a [Page N] citation can be trusted."""
    out: list[tuple[int, str]] = []
    step = CHUNK_TOKENS - OVERLAP
    for page_num, text in enumerate(pages, start=1):
        text = text.strip()
        if not text:
            continue
        toks = _enc.encode(text)
        for i in range(0, len(toks), step):
            piece = _enc.decode(toks[i : i + CHUNK_TOKENS]).strip()
            if piece:
                out.append((page_num, piece))
            if i + CHUNK_TOKENS >= len(toks):
                break
    return out


async def create_document(filename: str, pdf_bytes: bytes) -> str:
    pages = extract_pages(pdf_bytes)
    chunks = chunk_pages(pages)
    if not chunks:
        raise ValueError("No extractable text. Scanned PDFs need OCR, which is not built.")

    p = await pool()
    async with p.acquire() as conn, conn.transaction():
        doc_id = await conn.fetchval(
            "INSERT INTO documents (filename, status, n_pages, n_chunks) "
            "VALUES ($1,'pending',$2,$3) RETURNING id",
            filename, len(pages), len(chunks),
        )
        await conn.executemany(
            "INSERT INTO chunks (document_id, chunk_idx, page_num, content) "
            "VALUES ($1,$2,$3,$4)",
            [(doc_id, i, pg, txt) for i, (pg, txt) in enumerate(chunks)],
        )
    return str(doc_id)


async def embed_pending(doc_id: str):
    """Embed every chunk of a document that has no embedding yet. Safe to call
    repeatedly; each call picks up exactly where the last one stopped."""
    p = await pool()
    async with p.acquire() as conn:
        await conn.execute(
            "UPDATE documents SET status='processing', error=NULL WHERE id=$1", doc_id
        )
    usage: dict = {}
    started = time.monotonic()
    try:
        while True:
            async with p.acquire() as conn:
                rows = await conn.fetch(
                    "SELECT id, content FROM chunks "
                    "WHERE document_id=$1 AND embedding IS NULL "
                    "ORDER BY chunk_idx LIMIT $2",
                    doc_id, EMBED_BATCH,
                )
            if not rows:
                break

            vectors = await gemini.embed(
                [r["content"] for r in rows], gemini.DOCUMENT, usage
            )

            async with p.acquire() as conn, conn.transaction():
                await conn.executemany(
                    "UPDATE chunks SET embedding=$2 WHERE id=$1",
                    [(r["id"], v) for r, v in zip(rows, vectors)],
                )
                await conn.execute(
                    "UPDATE documents SET n_embedded = ("
                    "  SELECT count(*) FROM chunks "
                    "  WHERE document_id=$1 AND embedding IS NOT NULL), "
                    "  embed_tokens_est = embed_tokens_est + $2, "
                    "  indexed_ms = indexed_ms + $3 "
                    "WHERE id=$1",
                    doc_id,
                    usage.pop("embed_tokens_est", 0),
                    int((time.monotonic() - started) * 1000),
                )
                started = time.monotonic()

        async with p.acquire() as conn:
            await conn.execute("UPDATE documents SET status='ready' WHERE id=$1", doc_id)

    except Exception as e:
        kind = "quota" if isinstance(e, gemini.QuotaExceeded) else "error"
        async with p.acquire() as conn:
            await conn.execute(
                "UPDATE documents SET status='failed', error=$2 WHERE id=$1",
                doc_id, f"{kind}: {e}"[:2000],
            )


def _self_check():
    # distinct words so overlap is actually observable in the decoded text
    long_page = " ".join(f"w{i}" for i in range(2000))
    cs = chunk_pages([long_page, "", "beta gamma"])
    assert cs, "produced no chunks"
    assert {pg for pg, _ in cs} == {1, 3}, "empty page 2 should be skipped"
    assert sum(1 for pg, _ in cs if pg == 1) > 1, "long page should split"
    assert all(len(_enc.encode(t)) <= CHUNK_TOKENS for _, t in cs), "chunk over budget"

    # the tail of one chunk must reappear inside the next one, so a sentence
    # straddling a chunk boundary survives intact in at least one chunk
    p1 = [t for pg, t in cs if pg == 1]
    tail = p1[0].split()[-5:]
    assert set(tail) <= set(p1[1].split()), f"overlap lost: {tail} not in next chunk"

    # no words dropped between chunks (the failure overlap is meant to prevent)
    seen = []
    for t in p1:
        for w in t.split():
            if not seen or seen[-1] != w:
                seen.append(w)
    assert "w1999" in seen and "w0" in seen, "lost content at the edges"
    print(f"ok  chunker: {len(cs)} chunks, pages {sorted({pg for pg, _ in cs})}, overlap intact")


if __name__ == "__main__":
    _self_check()
