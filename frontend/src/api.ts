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
