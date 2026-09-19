import { useCallback, useEffect, useRef, useState } from 'react'
import { askQuestion, listDocuments, type Doc, type Source, type Unverified } from './api'
import { Answer } from './components/Answer'
import { DocumentRail } from './components/DocumentRail'
import { Margin } from './components/Margin'
import { UploadZone } from './components/UploadZone'

type Turn = {
  question: string
  answer: string
  sources: Source[]
  unverified: Unverified[]
  streaming: boolean
  error?: string
}

export default function App() {
  const [docs, setDocs] = useState<Doc[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [turns, setTurns] = useState<Turn[]>([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const thread = useRef<HTMLDivElement>(null)

  const refresh = useCallback(() => { listDocuments().then(setDocs) }, [])

  useEffect(() => { refresh() }, [refresh])

  // Poll only while something is actually indexing.
  const working = docs.some((d) => d.status === 'pending' || d.status === 'processing')
  useEffect(() => {
    if (!working) return
    const t = setInterval(refresh, 1500)
    return () => clearInterval(t)
  }, [working, refresh])

  useEffect(() => {
    thread.current?.scrollTo({ top: thread.current.scrollHeight })
  }, [turns])

  const ready = docs.filter((d) => d.status === 'ready')
  const scoped = [...selected].filter((id) => ready.some((d) => d.id === id))
  const canAsk = ready.length > 0 && draft.trim().length > 0 && !busy

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  async function ask() {
    if (!canAsk) return
    const question = draft.trim()
    setDraft('')
    setBusy(true)
    setTurns((t) => [...t, { question, answer: '', sources: [], unverified: [], streaming: true }])

    const patch = (fn: (t: Turn) => Turn) =>
      setTurns((all) => all.map((t, i) => (i === all.length - 1 ? fn(t) : t)))

    await askQuestion(question, scoped.length ? scoped : null, {
      onSources: (s) => patch((t) => ({ ...t, sources: s })),
      onToken: (tok) => patch((t) => ({ ...t, answer: t.answer + tok })),
      onDone: (u) => patch((t) => ({ ...t, unverified: u, streaming: false })),
      onError: (m) => patch((t) => ({ ...t, error: m, streaming: false })),
    })
    setBusy(false)
  }

  const scopeLabel =
    ready.length === 0
      ? 'Nothing to search yet'
      : scoped.length === 0
        ? `Searching all ${ready.length} document${ready.length === 1 ? '' : 's'}`
        : `Searching ${scoped.length} of ${ready.length} documents`

  return (
    <div className="shell">
      <div className="rail">
        <div className="brand">
          <h1>PaperTrail</h1>
          <p>Answers that show where they came from</p>
        </div>
        <div className="docs">
          <DocumentRail docs={docs} selected={selected} onToggle={toggle} onRefresh={refresh} />
        </div>
        <div className="upload">
          <UploadZone onUploaded={refresh} />
        </div>
      </div>

      <div className="reader">
        <div className="scope">
          <b>{scopeLabel}</b>
          {scoped.length > 0 && (
            <button className="link" onClick={() => setSelected(new Set())}>
              Search everything instead
            </button>
          )}
          {ready.length > 1 && scoped.length === 0 && <span>Pick documents on the left to narrow it</span>}
        </div>

        <div className="thread" ref={thread}>
          {turns.length === 0 ? (
            <div className="blank">
              <h2>Ask a document something</h2>
              <p>
                Every answer is written only from passages PaperTrail retrieved, and each one is
                listed beside the text. If the answer cites something that is not there, it is
                marked as unsupported rather than hidden.
              </p>
            </div>
          ) : (
            turns.map((t, i) => (
              <article className="exchange" key={i}>
                <h2 className="q">{t.question}</h2>
                <div className="body">
                  {t.error ? (
                    <p className="answer" style={{ color: 'var(--oxide)' }}>{t.error}</p>
                  ) : (
                    <Answer
                      text={t.answer}
                      sources={t.sources}
                      streaming={t.streaming}
                    />
                  )}
                  <Margin sources={t.sources} unverified={t.unverified} done={!t.streaming} />
                </div>
              </article>
            ))
          )}
        </div>

        <div className="ask">
          <div className="ask-inner">
            <textarea
              rows={1}
              value={draft}
              placeholder={ready.length ? 'Ask a question' : 'Add a PDF first'}
              disabled={ready.length === 0}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask() }
              }}
            />
            <button className="send" onClick={ask} disabled={!canAsk}>
              {busy ? 'Answering' : 'Ask'}
            </button>
          </div>
          {working && <p className="ask-note">Indexing in progress. Answers only draw on passages already processed.</p>}
        </div>
      </div>
    </div>
  )
}
