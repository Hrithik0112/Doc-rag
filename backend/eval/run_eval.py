"""Measure retrieval and answer quality, and prove hybrid beat vector-only.

  python -m backend.eval.run_eval            # index the corpus if needed, then score
  python -m backend.eval.run_eval --retrieval-only   # skip the LLM, no quota spent
"""

import argparse
import asyncio
import json
import pathlib
import sys
import time

from .. import citations, gemini, ingest, retrieval, stats
from ..config import CHAT_MODEL, EMBED_MODEL
from ..db import pool

HERE = pathlib.Path(__file__).parent
CORPUS = HERE / "corpus"
QUESTIONS = json.loads((HERE / "questions.json").read_text())

GRADE_PROMPT = """You are grading one answer from a document question-answering system.

Question: {q}
Reference answer: {ref}
System answer: {got}

Does the system answer convey the same factual content as the reference? Ignore
wording, formatting, citation markers and extra detail. Reply with exactly one
word: CORRECT, PARTIAL, or WRONG."""


async def ensure_corpus() -> dict[str, str]:
    """Index any corpus PDF not already present. Safe to re-run."""
    p = await pool()
    async with p.acquire() as conn:
        have = {r["filename"]: str(r["id"]) for r in
                await conn.fetch("SELECT id, filename FROM documents WHERE status='ready'")}

    for pdf in sorted(CORPUS.glob("*.pdf")):
        if pdf.name in have:
            continue
        print(f"indexing {pdf.name} ...", flush=True)
        doc_id = await ingest.create_document(pdf.name, pdf.read_bytes())
        await ingest.embed_pending(doc_id)
        async with p.acquire() as conn:
            row = await conn.fetchrow("SELECT status, error FROM documents WHERE id=$1", doc_id)
        if row["status"] != "ready":
            sys.exit(f"could not index {pdf.name}: {row['error']}")
        have[pdf.name] = doc_id
    return have


async def score(use_keyword: bool, grade: bool, docs: dict[str, str]):
    hit = graded = correct = partial = clean = 0
    misses = []

    for q in QUESTIONS:
        hits = await retrieval.search(q["question"], None, retrieval.TOP_K, use_keyword)
        got_pages = {(h["filename"], h["page_num"]) for h in hits}
        gold = {(q["file"], p) for p in q["expected_pages"]}

        if got_pages & gold:
            hit += 1
        else:
            misses.append((q["question"], sorted(p for _, p in gold),
                           sorted(p for f, p in got_pages if f == q["file"])))

        if not grade:
            continue

        answer = "".join([t async for t in gemini.stream_answer(
            retrieval.build_prompt(q["question"], hits, multi_doc=True))])
        verdict = (await gemini.complete(GRADE_PROMPT.format(
            q=q["question"], ref=q["expected_answer"], got=answer))).strip().upper()
        graded += 1
        correct += verdict.startswith("CORRECT")
        partial += verdict.startswith("PARTIAL")
        clean += not citations.verify(answer, hits)

    return {"n": len(QUESTIONS), "hit": hit, "graded": graded, "correct": correct,
            "partial": partial, "clean": clean, "misses": misses}


def pct(a, b):
    return f"{a}/{b} ({100 * a / b:.0f}%)" if b else "n/a"


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--retrieval-only", action="store_true",
                    help="skip generation and grading; spends far less quota")
    args = ap.parse_args()

    docs = await ensure_corpus()
    print(f"corpus: {', '.join(sorted(docs))}\nquestions: {len(QUESTIONS)}\n")

    started = time.monotonic()
    base = await score(use_keyword=False, grade=False, docs=docs)
    full = await score(use_keyword=True, grade=not args.retrieval_only, docs=docs)
    elapsed = int(time.monotonic() - started)

    # persist so the dashboard can show quality as a trend, not a one-off number
    await stats.save_eval_run(
        embed_model=EMBED_MODEL, chat_model=CHAT_MODEL, n_questions=full["n"],
        recall_hybrid=full["hit"], recall_vector=base["hit"], n_graded=full["graded"],
        n_correct=full["correct"], n_partial=full["partial"],
        n_citation_clean=full["clean"], duration_s=elapsed,
    )

    k = retrieval.TOP_K
    print(f"Retrieval recall@{k}")
    print(f"  vector only    {pct(base['hit'], base['n'])}")
    print(f"  hybrid         {pct(full['hit'], full['n'])}")
    print(f"  delta          {full['hit'] - base['hit']:+d} questions\n")

    if full["graded"]:
        print("Answer quality (hybrid retrieval, graded by Gemini)")
        print(f"  correct        {pct(full['correct'], full['graded'])}")
        print(f"  partial        {pct(full['partial'], full['graded'])}")
        print(f"  wrong          {pct(full['graded'] - full['correct'] - full['partial'], full['graded'])}")
        print(f"  every citation traced to a retrieved passage   {pct(full['clean'], full['graded'])}\n")

    if full["misses"]:
        print("Retrieval misses (hybrid)")
        for q, gold, got in full["misses"]:
            print(f"  {q[:64]:<64} gold p{gold} got p{got}")


if __name__ == "__main__":
    asyncio.run(main())
