import { useEffect, useState } from 'react'
import { AuroraFlow } from '@/components/ui/aurora-flow'
import { getOverview, getRecentQueries, type Overview, type QueryRow } from '../api'
import { compact } from '../lib/format'
import { useTheme } from '../lib/theme'

/** A worked example, used only when this instance has answered nothing yet. It
 *  is labelled as an example on screen, because a landing page for a tool about
 *  provenance should not pass invented output off as a real answer. */
const SAMPLE = {
  question: 'What optimizer was used, and with what beta values?',
  answer:
    'The Adam optimizer was used, with beta 1 = 0.9, beta 2 = 0.98 and epsilon = 1e-9 [1]. ' +
    'The learning rate was varied over training according to a warmup schedule [2].',
  sources: [
    { n: 1, where: 'attention.pdf, page 7', detail: '5.3 Optimizer. We used the Adam optimizer with β1 = 0.9, β2 = 0.98 and ϵ = 10−9.' },
    { n: 2, where: 'attention.pdf, page 7', detail: 'We varied the learning rate over the course of training, according to the formula…' },
  ],
}

export function Landing() {
  const { theme } = useTheme()
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
  const real = latest && {
    question: latest.question,
    answer: '',
    sources: latest.hits.slice(0, 3).map((h, i) => ({
      n: i + 1,
      where: `${h.filename}, page ${h.page}`,
      // The query log records scores and page numbers but never passage text,
      // so this shows what was actually stored rather than a plausible quote.
      detail: `Fusion score ${h.score.toFixed(4)} · matched by ${h.arms
        .map((a) => (a === 'vector' ? 'meaning' : 'exact wording'))
        .join(' and ')}`,
    })),
  }
  const shown = real ?? SAMPLE

  // The aurora is the landing page's own weather. The working screens stay flat.
  const aurora =
    theme === 'dark'
      ? ['#0d1219', '#1d2b3a', '#8a6a22', '#d6a447', '#00a98a']
      : ['#f5f3ef', '#e8dcc0', '#d2ae6b', '#b98f3f', '#fffdf9']

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      {/* ── hero ─────────────────────────────────────────────────────── */}
      <section className="relative isolate overflow-hidden border-b border-hair">
        <AuroraFlow
          colors={aurora}
          className="pointer-events-none absolute inset-0 -z-10"
          speed={0.35}
          animationSpeed={0.4}
          intensity={theme === 'dark' ? 1.15 : 1.25}
          opacity={1}
          blur={38}
          layers={4}
          grain
          grainOpacity={theme === 'dark' ? 0.09 : 0.05}
          vignette
          vignetteStrength={theme === 'dark' ? 0.4 : 0.25}
          pointerInteraction
          pointerStrength={0.16}
        />
        {/* The scrim runs horizontally, not over everything: the copy is
            left-aligned, so it keeps solid ground under the text while the
            aurora stays vivid on the right where nothing has to be read.
            A flat overlay dark enough for contrast just hides the gradient. */}
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-void via-void/75 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 -z-10 h-24 bg-gradient-to-t from-void to-transparent" />

        <div className="mx-auto max-w-5xl px-8 py-28 max-sm:px-5 max-sm:py-20">
          <p className="mb-7 flex items-center gap-2.5 text-xs text-dim">
            <span className="size-1.5 rounded-full bg-glow" aria-hidden />
            Ask your documents. Check the answer.
          </p>

          <h1 className="max-w-[16ch] font-display text-[clamp(3rem,8.5vw,6.5rem)] font-normal leading-[0.94] tracking-[-0.025em]">
            Every claim, traced to the page it came from.
          </h1>

          <p className="mt-9 max-w-xl text-lg leading-relaxed text-dim">
            PaperTrail answers only from passages it retrieved, lists every one beside the
            text, and marks any citation it cannot verify. Including its own.
          </p>

          <div className="mt-11 flex flex-wrap items-center gap-3">
            <a
              href="#ask"
              className="rounded-md bg-glow px-6 py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
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
        </div>
      </section>

      <div className="mx-auto max-w-5xl px-8 max-sm:px-5">
        {/* ── the demonstration ──────────────────────────────────────── */}
        <section className="py-20 max-sm:py-14">
          <h2 className="font-display text-[clamp(1.75rem,3.5vw,2.5rem)] leading-tight tracking-tight">
            An answer, with its evidence attached
          </h2>
          <p className="mt-3 max-w-xl text-dim">
            Numbers in the text are not decoration. Each one opens the passage the claim
            was built from.
          </p>

          <div className="mt-9 rounded-xl border border-hair bg-panel">
            <div className="flex items-baseline justify-between gap-4 border-b border-hair px-6 py-4 max-sm:px-4">
              <p className="truncate font-serif text-[15px]" title={shown.question}>
                {shown.question}
              </p>
              <span className="shrink-0 text-[11px] text-faint">
                {real ? 'most recent answer' : 'example'}
              </span>
            </div>

            <div className="px-6 py-5 max-sm:px-4">
              <p className="font-serif text-[17px] leading-[1.75]">
                {real
                  ? 'This instance answered the question above using the passages below. Open one to see what was recorded about it.'
                  : SAMPLE.answer.split(/(\[\d\])/).map((part, i) => {
                      const m = /^\[(\d)\]$/.exec(part)
                      if (!m) return <span key={i}>{part}</span>
                      const n = Number(m[1])
                      return (
                        <button
                          key={i}
                          onClick={() => setOpen(open === n ? null : n)}
                          aria-expanded={open === n}
                          className="mx-px align-[.35em] font-sans text-[11px] font-semibold text-glow underline-offset-4 hover:underline"
                        >
                          {n}
                        </button>
                      )
                    })}
              </p>

              <ul className="mt-5">
                {shown.sources.map((s) => (
                  <li key={s.n} className="border-t border-hair">
                    <button
                      onClick={() => setOpen(open === s.n ? null : s.n)}
                      aria-expanded={open === s.n}
                      className="flex w-full items-baseline gap-3 py-3 text-left transition-colors hover:text-glow"
                    >
                      <span className="tabular w-4 shrink-0 text-[11px] font-semibold text-glow">{s.n}</span>
                      <span className="flex-1 text-[13px] text-dim">{s.where}</span>
                      <span className="text-[11px] text-faint">{open === s.n ? 'hide' : 'open'}</span>
                    </button>
                    {open === s.n && (
                      <p className="border-l-2 border-glow/40 pb-4 pl-4 font-serif text-sm leading-relaxed text-dim">
                        {s.detail}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* ── the part nobody else ships ─────────────────────────────── */}
        <section className="border-t border-hair py-20 max-sm:py-14">
          <h2 className="font-display text-[clamp(1.75rem,3.5vw,2.5rem)] leading-tight tracking-tight">
            And when it gets one wrong
          </h2>
          <p className="mt-3 max-w-xl text-dim">
            Models cite pages they did not read. Every citation is checked against what was
            actually retrieved, and the ones that fail are shown, not swallowed.
          </p>

          <div className="mt-9 grid grid-cols-2 gap-5 max-sm:grid-cols-1">
            <figure className="rounded-xl border border-hair bg-panel p-5">
              <figcaption className="mb-3 flex items-center gap-2 text-xs text-good">
                <span aria-hidden>✓</span> Traced
              </figcaption>
              <p className="font-serif text-[15px] leading-relaxed">
                The base model uses 8 attention heads
                <span className="align-[.35em] font-sans text-[11px] font-semibold text-glow">1</span>.
              </p>
              <p className="mt-3 border-t border-hair pt-3 text-[13px] text-dim">
                attention.pdf, page 5 — among the retrieved passages.
              </p>
            </figure>

            <figure className="rounded-xl border border-critical/30 bg-critical/[0.05] p-5">
              <figcaption className="mb-3 flex items-center gap-2 text-xs text-critical">
                <span aria-hidden>!</span> Not traced
              </figcaption>
              <p className="font-serif text-[15px] leading-relaxed">
                The learning rate followed a warmup schedule
                <span className="align-[.35em] font-sans text-[11px] font-semibold text-critical">!</span>.
              </p>
              <p className="mt-3 border-t border-critical/25 pt-3 text-[13px] text-critical/90">
                <s>attention.pdf, page 13</s> — never retrieved. Treat the claim as
                unsupported.
              </p>
            </figure>
          </div>
        </section>

        {/* ── real numbers, or nothing at all ────────────────────────── */}
        {stats && stats.chunks > 0 && (
          <section className="border-t border-hair py-16 max-sm:py-12">
            <p className="mb-6 text-xs text-faint">Measured on this instance, right now</p>
            <dl className="grid grid-cols-4 gap-8 max-sm:grid-cols-2">
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
                <div key={k}>
                  <dt className="text-[11px] text-faint">{k}</dt>
                  <dd className="tabular mt-1.5 font-display text-4xl leading-none">{v}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}
      </div>
    </div>
  )
}
