import { useCallback, useEffect, useRef, useState } from 'react'
import { askQuestion, listDocuments, type Doc, type Source, type Unverified } from '../api'
import { Answer } from '../components/Answer'
import { DocumentRail } from '../components/DocumentRail'
import { Margin } from '../components/Margin'
import { UploadZone } from '../components/UploadZone'

type Turn = {
  question: string
  answer: string
  sources: Source[]
  unverified: Unverified[]
  streaming: boolean
  error?: string
}

export function Chat() {
  const [docs, setDocs] = useState<Doc[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [turns, setTurns] = useState<Turn[]>([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const thread = useRef<HTMLDivElement>(null)

  const refresh = useCallback(() => { listDocuments().then(setDocs) }, [])
  useEffect(() => { refresh() }, [refresh])

  // poll only while something is indexing
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
      if (next.has(id)) next.delete(id)
      else next.add(id)
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
    <div className="grid h-full min-h-0 w-full grid-cols-[19rem_1fr] max-lg:grid-cols-1 max-lg:grid-rows-[auto_1fr]">
      <div className="flex min-h-0 flex-col border-r border-hair/70 bg-panel/60 backdrop-blur-xl max-lg:max-h-[40vh] max-lg:border-b max-lg:border-r-0">
        <div className="flex-1 overflow-y-auto p-3">
          <DocumentRail docs={docs} selected={selected} onToggle={toggle} onRefresh={refresh} />
        </div>
        <UploadZone onUploaded={refresh} />
      </div>

      <div className="flex min-h-0 min-w-0 flex-col">
        <div className="flex items-baseline gap-3 border-b border-hair/70 px-8 py-3.5 text-[13px] text-faint backdrop-blur-xl max-lg:px-5">
          <span className="size-1.5 rounded-full bg-glow shadow-[0_0_8px_var(--accent)]" aria-hidden />
          <b className="font-medium text-text">{scopeLabel}</b>
          {scoped.length > 0 && (
            <button className="text-dim underline underline-offset-2 hover:text-glow"
                    onClick={() => setSelected(new Set())}>
              Search everything instead
            </button>
          )}
          {ready.length > 1 && scoped.length === 0 && <span>Pick documents on the left to narrow it</span>}
        </div>

        <div ref={thread} className="min-h-0 flex-1 overflow-y-auto px-8 pb-4 pt-10 max-lg:px-5">
          {turns.length === 0 ? (
            <div className="mx-auto my-20 max-w-lg text-center">
              <div className="mx-auto mb-6 h-px w-24 bg-gradient-to-r from-transparent via-glow to-transparent" />
              <h2 className="mb-3 font-serif text-3xl font-normal tracking-tight text-text glow-text">
                Ask a document something
              </h2>
              <p className="leading-relaxed text-dim">
                Every answer is written only from passages PaperTrail retrieved, and each one is
                listed beside the text. If the answer cites something that is not there, it is
                marked as unsupported rather than hidden.
              </p>
            </div>
          ) : (
            turns.map((t, i) => (
              <article key={i} className="mx-auto mb-12 max-w-4xl">
                <h2 className="mb-6 max-w-xl border-b border-hair pb-3.5 font-serif text-xl font-medium leading-snug tracking-tight text-text">
                  {t.question}
                </h2>
                <div className="grid grid-cols-[minmax(0,40rem)_17rem] gap-10 max-lg:grid-cols-1 max-lg:gap-6">
                  {t.error ? (
                    <p className="rounded-md border border-critical/30 bg-critical/[0.07] p-4 font-serif text-[17px] leading-relaxed text-critical">
                      {t.error}
                    </p>
                  ) : (
                    <Answer text={t.answer} sources={t.sources} streaming={t.streaming} />
                  )}
                  <Margin sources={t.sources} unverified={t.unverified} done={!t.streaming} />
                </div>
              </article>
            ))
          )}
        </div>

        <div className="border-t border-hair/70 bg-panel/70 px-8 pb-5 pt-4 backdrop-blur-xl max-lg:px-5">
          <div className="mx-auto flex max-w-4xl items-end gap-3">
            <textarea
              rows={1}
              value={draft}
              placeholder={ready.length ? 'Ask a question' : 'Add a PDF first'}
              disabled={ready.length === 0}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask() }
              }}
              className="max-h-36 min-h-[2.75rem] flex-1 resize-none rounded-md border border-hair bg-raised/70 px-3.5 py-2.5 text-[15px] leading-normal text-text placeholder:text-faint focus:border-glow/60 focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--accent)_14%,transparent)] focus:outline-none"
            />
            <button
              onClick={ask}
              disabled={!canAsk}
              className="press rounded-md bg-glow px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-[0_0_26px_-6px_var(--accent)] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:bg-raised disabled:text-faint disabled:shadow-none"
            >
              {busy ? 'Answering' : 'Ask'}
            </button>
          </div>
          {working && (
            <p className="mx-auto mt-2 max-w-4xl text-xs text-faint">
              Indexing in progress. Answers only draw on passages already processed.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
