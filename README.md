# PaperTrail

Ask questions about your PDFs and get answers that show where they came from.

Every answer is written only from passages retrieved out of your documents, each
passage is listed beside the text, and any citation the model produces that does
not match a retrieved passage is flagged rather than hidden.

## What is actually interesting here

Most "chat with your PDF" projects stop at: embed, search by vector, ask the model.
Four decisions separate this from that.

**Hybrid retrieval.** Vector search finds paraphrase but misses exact strings, which
is a problem when people ask about dates, figures and model names. PaperTrail runs a
pgvector cosine search and a Postgres full-text search in one query and fuses them
with Reciprocal Rank Fusion. RRF needs no tuning and no score normalization between
two incomparable scales. Measured effect is in `backend/eval/`.

**Citations are verified, not trusted.** After the answer streams, every `[Page N]`
it emitted is checked against the passages actually retrieved. Unmatched citations
come back in the response and render in red beside the answer. Across documents the
label includes the filename, because page 7 of one paper is not page 7 of another.

**Ingestion is resumable by construction.** Chunks are written to Postgres with a
NULL embedding *before* any API call. A chunk without an embedding is unfinished
work, so hitting the free-tier daily cap halfway through a document costs nothing:
`POST /documents/{id}/resume` continues from the exact passage it stopped on.

**No vector index, on purpose.** Exact search over tens of thousands of chunks takes
milliseconds and is 100% accurate. An approximate index would also fight the
`document_id` filter and silently lose recall. `backend/add_index.sql` has the HNSW
statement for when there is enough data to need it.

## The instrumentation screen

`#instrumentation` reads a query log written on every answered question. Everything on
it comes from real traffic: grounding rate, token spend, latency percentiles, which
retrieval arm actually found each passage, the fusion-score distribution, failures, and
stored eval runs.

Two things it is deliberately honest about:

- **Embedding tokens are estimates.** The embed endpoint returns no usage metadata, so
  that number comes from a local tokenizer and is labelled `est.` everywhere it appears.
  Generation tokens are reported by the API and are exact.
- **The grounding rate is not decorative.** If the model cites a page that was not
  retrieved, the headline figure drops and turns red rather than rounding up to 100%.

The log stores question text, retrieved page numbers and scores, but never passage
contents. It has no retention policy, which is fine for a local single-user app and
would need one before this ran for anyone else.

## Interface

Dark, with an ambient grain field behind the work and glass panels over it. Two screens,
`#ask` and `#instrumentation`, reached from a magnetic dock.

Motion is rationed. The one mechanical moment is the lead figure on the dashboard, which
flips like a departure board; everything else stays still so that movement keeps its
meaning. `prefers-reduced-motion` is respected throughout.

Several pieces come from the [Componentry](https://componentry.dev) registry, wired in as
a shadcn registry in `frontend/components.json`:

| Component | Used for |
|---|---|
| `split-flap-display` | the grounding rate, the number that matters most |
| `github-calendar` | daily question activity |
| `magnetic-dock` | navigation |
| `grain-gradient` | the ambient field |
| `kinetic-text-reveal` | the wordmark |

`github-calendar` is adapted. It shipped fetching a GitHub username from a third-party
API; this app has its own activity to show and should not be making external calls, so it
takes the days directly and buckets them locally. Its window grows from twelve weeks
toward a year as history accumulates, because a full-year grid with one active day is
mostly dead space and padding it with invented history would be worse.

To pull more components:

```bash
cd frontend && npx shadcn@latest add @componentry/<name>
```

`.mcp.json` registers the shadcn MCP server pointed at `frontend/`, so a future session can
browse and add from the registry directly. MCP servers load at session start, so it takes
effect on the next one.

## Running it

Requires Docker, Python 3.11+, Node 20+, and a Gemini API key from
https://aistudio.google.com/apikey (free, no credit card).

```bash
cp .env.example .env          # then paste your key into GEMINI_API_KEY
docker compose up -d          # Postgres with pgvector on port 5433

python3 -m venv .venv
./.venv/bin/pip install -r requirements.txt
./.venv/bin/uvicorn backend.main:app --reload --port 8000

cd frontend && npm install && npm run dev      # http://localhost:5173
```

Two screens: `#ask` to question documents, `#instrumentation` for the dashboard.

The schema is applied automatically on first boot.

### Free-tier quotas, which are the main thing that will bite you

Gemini's free limits are **per model** and vary by more than an order of magnitude.
`gemini-3.5-flash` allows only 20 generate requests *per day*; the `-lite` models
allow far more, which is why `CHAT_MODEL` defaults to `gemini-3.5-flash-lite`.

The two 429s mean different things and the code treats them differently: a
per-minute 429 carries a `retryDelay` and is simply waited out, while a per-day 429
is terminal and checkpoints the document for later resume. Conflating them makes the
whole free tier look broken.

`-lite` is also a weaker reader. It will occasionally misread a table that the
retrieval step found correctly. If you have a paid key, set `CHAT_MODEL` to a full
Flash model and re-run the eval to see the difference.

## Checks

Each module carries one runnable check. No test framework.

```bash
./.venv/bin/python -m backend.gemini      # 768 dims, L2-normalized, quota classifier, usage
./.venv/bin/python -m backend.ingest      # chunk sizing, page scoping, overlap
./.venv/bin/python -m backend.citations   # citation parsing and verification
./.venv/bin/python -m backend.retrieval   # proves hybrid: exact string AND paraphrase
./.venv/bin/python -m backend.stats       # arm buckets partition hits, no text copied
```

`backend.retrieval` is the one that matters: it inserts a passage containing a rare
exact string and asserts both that keyword search retrieves it and that a paraphrased
question retrieves a different passage by meaning. It fails if either arm of the
hybrid, or the fusion, regresses.

The embedding normalization assert is the other one worth keeping. `gemini-embedding-001`
does not normalize when `output_dimensionality` is not 3072, and unnormalized vectors
make cosine ranking quietly wrong rather than obviously broken.

## Evaluation

20 questions across two papers. Gold page labels are derived by locating anchor text
in the PDFs, not written from memory.

```bash
./.venv/bin/python -m backend.eval.run_eval                  # full
./.venv/bin/python -m backend.eval.run_eval --retrieval-only # no generation quota spent
```

Latest run, `gemini-embedding-001` at 768 dimensions and `gemini-3.5-flash-lite`:

```
Retrieval recall@5
  vector only    19/20 (95%)
  hybrid         20/20 (100%)
  delta          +1 questions

Answer quality (hybrid retrieval, graded by Gemini)
  correct        20/20 (100%)
  citations traced to a retrieved passage   20/20 (100%)
```

The hybrid delta is one question, not a landslide. These are mostly
paraphrase-friendly questions about two well-written papers; the gap widens on
documents full of identifiers, part numbers and dates.

## Colour

There are two validated palettes in this repo's history, and the dark one is not a
brightened copy of the light one. Dark mode was stepped separately and re-validated,
because the intuitive version failed: the "obviously brighter" candidate put blue and
violet at delta-E 0.2 for protanopes, which is to say the same colour.

The shipped dark set is three hues, `#00ab84 #6180e8 #c07f14`, checked at every pair
against the panel surface for lightness band, chroma floor, colour-vision separation and
contrast. Three, not four, because three is the most ever shown at once. Do not swap one
without re-validating the whole set.

Status colours are reserved and always ship with a text label, never colour alone.

## Cost of the redesign

The bundle went from 72kB gzipped to 253kB. `recharts` and `framer-motion` account for
almost all of it. That is a real trade for the motion and the charts; if it ever matters,
the dashboard is the natural code-split boundary since the chat screen needs neither
library.

## What the dashboard has already shown

Nine seeded questions in, the keyword arm had contributed **zero** unique passages:
every hit came either from vector search alone or from both arms agreeing. That is
consistent with the eval's modest +1 delta, and it is exactly the kind of thing that
stays invisible without instrumentation. It does not mean the keyword arm is dead code,
`backend.retrieval` proves it fires on exact strings, it means these two papers rarely
need it.

The grounding rate also stopped being 100%. Asked "What optimizer was used and what were
the beta values?", the model cited `attention.pdf, Page 13` when only page 7 of that
document had been retrieved. The margin struck the citation through and the headline
figure dropped to 88.9%. That is the feature working, not failing.

## Not built

Authentication, multi-user isolation, a background worker, a reranker, query
rewriting, conversation memory across turns, and OCR for scanned PDFs. `ponytail:`
comments in the source mark the deliberate ceilings and what replaces them.
