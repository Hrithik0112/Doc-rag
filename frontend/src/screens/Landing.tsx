import { useEffect, useState } from 'react'
import { KineticTextReveal } from '@/components/ui/kinetic-text-reveal'
import { getOverview, getRecentQueries, type Overview, type QueryRow } from '../api'
import { compact } from '../lib/format'

/** A worked example, used only when the instance has answered nothing yet. It is
 *  labelled as an example on screen, because a landing page for a tool about
 *  provenance should not pass invented output off as a real answer. */
const SAMPLE = {
  question: 'What optimizer was used, and with what beta values?',
  answer:
    'The Adam optimizer was used, with beta 1 = 0.9, beta 2 = 0.98 and epsilon = 1e-9 [1]. ' +
    'The learning rate was varied over training according to a warmup schedule [2].',
  sources: [
    { n: 1, where: 'attention.pdf, page 7', text: '5.3 Optimizer. We used the Adam optimizer with β1 = 0.9, β2 = 0.98 and ϵ = 10−9.' },
    { n: 2, where: 'attention.pdf, page 7', text: 'We varied the learning rate over the course of training, according to the formula…' },
  ],
}

export function Landing() {
  const [stats, setStats] = useState<Overview | null>(null)
  const [latest, setLatest] = useState<QueryRow | null>(null)
  const [open, setOpen] = useState<number | null>(1)

  useEffect(() => {
    getOverview().then(setStats).catch(() => {})
    getRecentQueries(1)
      .then((q) => setLatest(q[0]?.status === 'ok' && q[0].hits.length ? q[0] : null))
      .catch(() => {})
  }, [])

  // Prefer something this instance actually answered over the scripted example.
  const real = latest
    ? {
        question: latest.question,
        sources: latest.hits.slice(0, 3).map((h, i) => ({
          n: i + 1,
          where: `${h.filename}, page ${h.page}`,
          // The query log stores scores and page numbers but never passage
          // text, so this shows what was actually recorded rather than
          // pretending to quote something.
          text: `Fusion score ${h.score.toFixed(4)} · found by ${h.arms
            .map((a) => (a === 'vector' ? 'meaning' : 'exact wording'))
            .join(' and ')}`,
        })),
      }
    : null

  const shown = real ?? SAMPLE

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col justify-center px-8 py-16 max-sm:px-5">
        {/* ── the claim ──────────────────────────────────────────────── */}
        <p className="mb-5 flex items-center gap-2.5 text-xs text-faint">
          <span className="size-1.5 rounded-full bg-glow" aria-hidden />
          Retrieval augmented generation, with the receipts
        </p>

        <h1 className="max-w-3xl font-serif text-[clamp(2.5rem,6vw,4.25rem)] font-normal leading-[1.05] tracking-[-0.02em]">
          <KineticTextReveal
            text="Every answer says where it came from."
            splitBy="words"
            direction="up"
            distance={22}
            stagger={0.035}
            transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
            blur
          />
        </h1>

        <p className="mt-6 max-w-xl text-lg leading-relaxed text-dim">
          Ask your PDFs a question. PaperTrail answers only from passages it actually
          retrieved, shows each one beside the text, and flags any citation it cannot
          trace back.
        </p>

        {/* ── the demonstration ──────────────────────────────────────── */}
        <div className="glass mt-14 rounded-xl p-6 max-sm:p-4">
          <div className="mb-4 flex items-baseline justify-between gap-4 border-b border-hair pb-3">
            <p className="truncate font-serif text-[15px] text-text" title={shown.question}>
              {shown.question}
            </p>
            <span className="shrink-0 text-[11px] text-faint">
              {real ? 'most recent answer' : 'example'}
            </span>
          </div>

          <p className="font-serif text-[17px] leading-[1.75] text-text/95">
            {real
              ? 'This instance answered the question above from the passages listed below. Open one to read the text the answer was built from.'
              : SAMPLE.answer.split(/(\[\d\])/).map((part, i) => {
                  const m = /^\[(\d)\]$/.exec(part)
                  if (!m) return <span key={i}>{part}</span>
                  const n = Number(m[1])
                  return (
                    <button
                      key={i}
                      onClick={() => setOpen(open === n ? null : n)}
                      aria-expanded={open === n}
                      className="mx-[1px] align-[.35em] font-sans text-[11px] font-semibold text-glow underline-offset-4 hover:underline"
                    >
                      {n}
                    </button>
                  )
                })}
          </p>

          <ul className="mt-5 space-y-px">
            {shown.sources.map((s) => (
              <li key={s.n} className="border-t border-hair/70">
                <button
                  onClick={() => setOpen(open === s.n ? null : s.n)}
                  aria-expanded={open === s.n}
                  className="flex w-full items-baseline gap-3 py-2.5 text-left transition-colors hover:text-glow"
                >
                  <span className="tabular w-4 shrink-0 text-[11px] font-semibold text-glow">{s.n}</span>
                  <span className="flex-1 text-[13px] text-dim">{s.where}</span>
                  <span className="text-[11px] text-faint">{open === s.n ? 'hide' : 'read'}</span>
                </button>
                {open === s.n && s.text && (
                  <p className="border-l border-hair/70 pb-3 pl-4 font-serif text-sm leading-relaxed text-dim">
                    {s.text}
                  </p>
                )}

              </li>
            ))}
          </ul>
        </div>

        {/* ── the way in ─────────────────────────────────────────────── */}
        <div className="mt-10 flex flex-wrap items-center gap-4">
          <a
            href="#ask"
            className="rounded-md bg-glow px-6 py-3 text-sm font-semibold text-primary-foreground shadow-[0_0_30px_-8px_var(--accent)] transition-shadow hover:shadow-[0_0_40px_-6px_var(--accent)]"
          >
            Ask a document
          </a>
          <a
            href="#instrumentation"
            className="rounded-md border border-hair px-6 py-3 text-sm text-dim transition-colors hover:border-halo hover:text-text"
          >
            See how well it works
          </a>
        </div>

        {/* ── what is actually in there. Real numbers or nothing. ────── */}
        {stats && stats.chunks > 0 && (
          <dl className="mt-14 grid max-w-2xl grid-cols-4 gap-px overflow-hidden rounded-lg border border-hair/80 bg-hair/60 max-sm:grid-cols-2">
            {[
              ['Documents', String(stats.documents_ready)],
              ['Passages indexed', compact(stats.chunks)],
              ['Questions answered', compact(stats.queries)],
              [
                'Citations traced',
                stats.total_citations
                  ? `${stats.total_citations - stats.unverified_citations}/${stats.total_citations}`
                  : '—',
              ],
            ].map(([k, v]) => (
              <div key={k} className="bg-panel/70 px-4 py-3.5 backdrop-blur-xl">
                <dt className="text-[11px] text-faint">{k}</dt>
                <dd className="tabular mt-1 font-serif text-xl text-text">{v}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </div>
  )
}
