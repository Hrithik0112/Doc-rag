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
