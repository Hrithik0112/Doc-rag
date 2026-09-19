-- Run this ONLY when exact search measurably slows down (tens of thousands of chunks).
-- Until then exact scan is fast and 100% accurate. HNSW is approximate.
CREATE INDEX CONCURRENTLY IF NOT EXISTS chunks_hnsw_idx
  ON chunks USING hnsw (embedding vector_cosine_ops);

-- Corpus queries filter by document_id, which loses recall against a plain ANN scan.
-- pgvector 0.8+ fixes this; set it per-session in db.py once this index exists.
--   SET hnsw.iterative_scan = 'relaxed_order';
