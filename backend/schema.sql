CREATE EXTENSION IF NOT EXISTS vector;

DO $$ BEGIN
  CREATE TYPE doc_status AS ENUM ('pending','processing','ready','failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS documents (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filename    TEXT NOT NULL,
  status      doc_status NOT NULL DEFAULT 'pending',
  error       TEXT,
  n_pages     INT DEFAULT 0,
  n_chunks    INT DEFAULT 0,
  n_embedded  INT DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chunks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  chunk_idx   INT NOT NULL,
  content     TEXT NOT NULL,
  page_num    INT NOT NULL,
  embedding   vector(768),
  tsv         tsvector GENERATED ALWAYS AS (to_tsvector('english', content)) STORED,
  UNIQUE (document_id, chunk_idx)
);

CREATE INDEX IF NOT EXISTS chunks_doc_idx  ON chunks (document_id, chunk_idx);
CREATE INDEX IF NOT EXISTS chunks_tsv_idx  ON chunks USING GIN (tsv);
-- partial index: the ingest resume loop only ever scans un-embedded rows
CREATE INDEX IF NOT EXISTS chunks_todo_idx ON chunks (document_id) WHERE embedding IS NULL;

-- ── instrumentation ──────────────────────────────────────────────────────
-- Every answered question, so the dashboard measures real behaviour rather
-- than guessing. Written once per /query, after the answer finishes.

DO $$ BEGIN
  CREATE TYPE query_status AS ENUM ('ok','no_hits','quota','error');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS queries (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question       TEXT NOT NULL,
  scope_doc_ids  UUID[],                 -- NULL means the whole corpus
  status         query_status NOT NULL DEFAULT 'ok',
  error          TEXT,

  -- retrieval
  n_hits         INT NOT NULL DEFAULT 0,
  top_score      REAL,
  hits           JSONB NOT NULL DEFAULT '[]',   -- page, filename, score, arms
  n_vector_only  INT NOT NULL DEFAULT 0,
  n_keyword_only INT NOT NULL DEFAULT 0,
  n_both_arms    INT NOT NULL DEFAULT 0,

  -- grounding
  n_citations    INT NOT NULL DEFAULT 0,
  n_unverified   INT NOT NULL DEFAULT 0,

  -- cost. generation counts are reported by the API; embedding counts are NOT
  -- (the embed endpoint returns no usage metadata), so that one is a local
  -- tokenizer estimate and is named so nobody reads it as measured.
  prompt_tokens      INT NOT NULL DEFAULT 0,
  completion_tokens  INT NOT NULL DEFAULT 0,
  embed_tokens_est   INT NOT NULL DEFAULT 0,

  -- latency
  retrieval_ms   INT NOT NULL DEFAULT 0,
  generation_ms  INT NOT NULL DEFAULT 0,

  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS queries_created_idx ON queries (created_at DESC);
CREATE INDEX IF NOT EXISTS queries_status_idx  ON queries (status);

-- Eval results persisted so quality is a trend, not a number someone once saw
-- scroll past in a terminal.
CREATE TABLE IF NOT EXISTS eval_runs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  embed_model     TEXT NOT NULL,
  chat_model      TEXT NOT NULL,
  n_questions     INT  NOT NULL,
  recall_hybrid   INT  NOT NULL,
  recall_vector   INT  NOT NULL,
  n_graded        INT  NOT NULL DEFAULT 0,
  n_correct       INT  NOT NULL DEFAULT 0,
  n_partial       INT  NOT NULL DEFAULT 0,
  n_citation_clean INT NOT NULL DEFAULT 0,
  duration_s      INT  NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS eval_runs_created_idx ON eval_runs (created_at DESC);

ALTER TABLE documents ADD COLUMN IF NOT EXISTS embed_tokens_est INT NOT NULL DEFAULT 0;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS indexed_ms       INT NOT NULL DEFAULT 0;

-- ── observability ────────────────────────────────────────────────────────
-- Free-text error strings cannot be counted or alerted on. Every failure maps
-- to one bucket; see backend/obs.py for the taxonomy and its self-check.
DO $$ BEGIN
  CREATE TYPE error_kind AS ENUM (
    'quota_daily','quota_per_minute','upstream','timeout',
    'no_extractable_text','bad_input','database','unknown');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE queries ADD COLUMN IF NOT EXISTS request_id  TEXT;
ALTER TABLE queries ADD COLUMN IF NOT EXISTS trace_id    TEXT;
ALTER TABLE queries ADD COLUMN IF NOT EXISTS error_kind  error_kind;
-- retrieval_ms bundled the embed round trip with the SQL; these split it
ALTER TABLE queries ADD COLUMN IF NOT EXISTS embed_ms    INT NOT NULL DEFAULT 0;
ALTER TABLE queries ADD COLUMN IF NOT EXISTS search_ms   INT NOT NULL DEFAULT 0;
ALTER TABLE queries ADD COLUMN IF NOT EXISTS verify_ms   INT NOT NULL DEFAULT 0;
ALTER TABLE queries ADD COLUMN IF NOT EXISTS retries     INT NOT NULL DEFAULT 0;
ALTER TABLE queries ADD COLUMN IF NOT EXISTS throttle_ms INT NOT NULL DEFAULT 0;
-- what this WOULD cost on the paid tier; the free tier bills nothing
ALTER TABLE queries ADD COLUMN IF NOT EXISTS est_cost_usd NUMERIC(12,8) NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS queries_error_kind_idx ON queries (error_kind)
  WHERE error_kind IS NOT NULL;

ALTER TABLE documents ADD COLUMN IF NOT EXISTS error_kind   error_kind;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS parse_ms     INT NOT NULL DEFAULT 0;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS chunk_ms     INT NOT NULL DEFAULT 0;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS embed_retries INT NOT NULL DEFAULT 0;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS throttle_ms  INT NOT NULL DEFAULT 0;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS est_cost_usd NUMERIC(12,8) NOT NULL DEFAULT 0;
