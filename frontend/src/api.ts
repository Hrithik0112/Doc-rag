export type Doc = {
  id: string
  filename: string
  status: 'pending' | 'processing' | 'ready' | 'failed'
  error: string | null
  n_pages: number
  n_chunks: number
  n_embedded: number
}

export type Source = {
  page: number
  filename: string
  document_id: string
  excerpt: string
  score: number
  matched: ('vector' | 'keyword')[]
}

export type Unverified = { filename: string | null; page: number }

export const listDocuments = (): Promise<Doc[]> =>
  fetch('/api/documents').then((r) => r.json())

export const deleteDocument = (id: string) =>
  fetch(`/api/documents/${id}`, { method: 'DELETE' })

export const resumeDocument = (id: string) =>
  fetch(`/api/documents/${id}/resume`, { method: 'POST' })

export async function uploadDocument(file: File) {
  const body = new FormData()
  body.append('file', file)
  const r = await fetch('/api/upload', { method: 'POST', body })
  if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as any).detail ?? 'Upload failed')
  return r.json()
}

type Handlers = {
  onSources: (s: Source[]) => void
  onToken: (t: string) => void
  onDone: (u: Unverified[]) => void
  onError: (m: string) => void
}

/** POST + ReadableStream rather than EventSource, since EventSource is GET-only. */
export async function askQuestion(
  question: string,
  docIds: string[] | null,
  h: Handlers,
  signal?: AbortSignal,
) {
  const res = await fetch('/api/query', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question, doc_ids: docIds }),
    signal,
  })
  if (!res.ok || !res.body) {
    const d = await res.json().catch(() => ({}))
    return h.onError((d as any).detail ?? `Request failed (${res.status})`)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })

    let split
    while ((split = buf.indexOf('\n\n')) !== -1) {
      const frame = buf.slice(0, split)
      buf = buf.slice(split + 2)
      const event = /^event: (.*)$/m.exec(frame)?.[1]
      const raw = /^data: (.*)$/m.exec(frame)?.[1]
      if (!event || raw === undefined) continue
      const data = JSON.parse(raw)
      if (event === 'sources') h.onSources(data)
      else if (event === 'token') h.onToken(data)
      else if (event === 'done') h.onDone(data.unverified_citations)
      else if (event === 'error') h.onError(data)
    }
  }
}

// ── dashboard ──────────────────────────────────────────────────────────────

export type Overview = {
  documents: number; documents_ready: number; documents_failed: number
  documents_working: number; pages: number; chunks: number; chunks_unembedded: number
  ingest_tokens_est: number
  queries: number; queries_ok: number; queries_quota: number; queries_error: number
  queries_no_hits: number; queries_cited: number; queries_clean: number
  unverified_citations: number; total_citations: number
  prompt_tokens: number; completion_tokens: number; query_embed_tokens_est: number
  retrieval_ms_p50: number | null; retrieval_ms_p95: number | null
  generation_ms_p50: number | null; generation_ms_p95: number | null
  hits_vector_only: number; hits_keyword_only: number; hits_both_arms: number
  query_cost_usd: number; ingest_cost_usd: number
  retries: number; throttle_ms: number
  embed_ms_p50: number | null; search_ms_p50: number | null; n_staged: number
  embed_model: string; chat_model: string
}

export type ErrorKind = {
  kind: string
  queries: number
  documents: number
}

export type DayPoint = {
  day: string; queries: number; failed: number; tokens: number; unverified: number
}

export type ScoreBucket = { bucket: number; floor: number; ceiling: number; n: number }

export type QueryRow = {
  id: string; question: string; status: 'ok' | 'no_hits' | 'quota' | 'error'
  error: string | null; n_hits: number; top_score: number | null
  hits: { page: number; filename: string; score: number; arms: string[] }[]
  n_citations: number; n_unverified: number
  prompt_tokens: number; completion_tokens: number; embed_tokens_est: number
  retrieval_ms: number; generation_ms: number; created_at: string
  corpus_wide: boolean
  request_id: string | null; error_kind: string | null
  embed_ms: number; search_ms: number; verify_ms: number
  retries: number; throttle_ms: number; est_cost_usd: number
}

export type EvalRun = {
  id: string; embed_model: string; chat_model: string; n_questions: number
  recall_hybrid: number; recall_vector: number; n_graded: number
  n_correct: number; n_partial: number; n_citation_clean: number
  duration_s: number; created_at: string
}

const get = <T,>(path: string): Promise<T> =>
  fetch(`/api${path}`).then((r) => {
    if (!r.ok) throw new Error(`${path} failed (${r.status})`)
    return r.json()
  })

export const getOverview = () => get<Overview>('/stats/overview')
export const getTimeseries = (days = 14) => get<DayPoint[]>(`/stats/timeseries?days=${days}`)
export const getScoreBuckets = () => get<ScoreBucket[]>('/stats/scores')
export const getRecentQueries = (limit = 25) => get<QueryRow[]>(`/stats/queries?limit=${limit}`)
export const getEvalRuns = () => get<EvalRun[]>('/stats/evals')
export const getErrorKinds = () => get<ErrorKind[]>('/stats/errors')
