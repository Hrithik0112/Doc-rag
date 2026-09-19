import { useEffect, useState } from 'react'
import { AnimatedGradient } from '@/components/ui/animated-gradient'
import { getOverview, getRecentQueries, type Overview, type QueryRow } from '../api'
import { compact } from '../lib/format'
import { usePrefersReducedMotion, useTheme } from '../lib/theme'

/** Fallback when nothing has been answered yet. Labelled as an example on
 *  screen: a page about provenance must not pass invented output off as real. */
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
  const reducedMotion = usePrefersReducedMotion()
  const [stats, setStats] = useState<Overview | null>(null)
  const [latest, setLatest] = useState<QueryRow | null>(null)
  const [open, setOpen] = useState<number | null>(1)

  useEffect(() => {
    getOverview().then(setStats).catch(() => {})
    getRecentQueries(1)
      .then((q) => setLatest(q[0]?.status === 'ok' && q[0].hits.length ? q[0] : null))
      .catch(() => {})
  }, [])

  // prefer a real answer over the scripted example
  const real = latest && {
    question: latest.question,
    answer: '',
    sources: latest.hits.slice(0, 3).map((h, i) => ({
      n: i + 1,
      where: `${h.filename}, page ${h.page}`,
      // the log stores no passage text, so show what it does store
      detail: `Fusion score ${h.score.toFixed(4)} · matched by ${h.arms
        .map((a) => (a === 'vector' ? 'meaning' : 'exact wording'))
        .join(' and ')}`,
    })),
  }
  const shown = real ?? SAMPLE

  /* One motion, two palettes: every timing and shape value is shared, only the
     colour changes. Light reaches further into deep brass than dark reaches up,
     because the same swirl over three near-white tones is invisible. */
  const MOTION = {
    preset: 'custom' as const,
    rotation: -38,
    proportion: 55,
    scale: 0.78,
    speed: 12,
    distortion: 32,
    swirl: 64,
    swirlIterations: 8,
    softness: 98,
    offset: 168,
    shape: 'Edge' as const,
    shapeSize: 58,
  }

  const PALETTE = {
    dark: { color1: '#0a0e14', color2: '#123040', color3: '#c9963a' },
    light: { color1: '#f5f3ef', color2: '#cdb37a', color3: '#9c7326' },
  }

  const gradient = { ...MOTION, ...PALETTE[theme] }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      {/* ── hero ─────────────────────────────────────────────────────── */}
      <section className="relative isolate overflow-hidden border-b border-hair">
{/* The gradient lives in the right half and fades in through a mask,
            rather than being covered by a scrim over the whole hero. A scrim
            wide enough to protect 6rem type leaves a visible vertical seam
            where its ramp begins; a mask has no edge to see. The copy then sits
            on the page's own ground, so its contrast is the token contrast and
            does not depend on where the gradient is bright this second. */}
        <div
          className="pointer-events-none absolute inset-y-0 right-0 -z-10 w-[55%] max-lg:w-[72%]"
          style={{
            maskImage:
              'linear-gradient(to right, transparent 0%, rgba(0,0,0,.45) 30%, #000 62%)',
            WebkitMaskImage:
              'linear-gradient(to right, transparent 0%, rgba(0,0,0,.45) 30%, #000 62%)',
          }}
          aria-hidden
        >
          {reducedMotion ? (
            // still gradient rather than a canvas looping for someone who opted out
            <div
              className="size-full"
              style={{
                background: `linear-gradient(142deg, ${gradient.color1} 0%, ${gradient.color2} 45%, ${gradient.color3} 100%)`,
              }}
            />
          ) : (
            <AnimatedGradient
              key={theme}
              config={gradient}
              noise={{ opacity: 0.06, scale: 0.6 }}
              className="size-full"
            />
          )}
        </div>

        <div className="absolute inset-x-0 bottom-0 -z-10 h-24 bg-gradient-to-t from-void to-transparent" />

        <div className="mx-auto max-w-5xl px-8 py-28 max-sm:px-5 max-sm:py-20 lg:max-w-6xl">
          <p className="mb-7 flex items-center gap-2.5 text-xs text-dim">
            <span className="size-1.5 rounded-full bg-glow" aria-hidden />
            Ask your documents. Check the answer.
          </p>

          <h1 className="max-w-[13ch] font-display text-[clamp(2.75rem,6.4vw,5rem)] font-normal leading-[0.96] tracking-[-0.022em]">
            Every claim, traced to the page it came from.
          </h1>

          <p className="mt-9 max-w-lg text-lg leading-relaxed text-dim">
            PaperTrail answers only from passages it retrieved, lists every one beside the
            text, and marks any citation it cannot verify. Including its own.
          </p>

          <div className="mt-11 flex flex-wrap items-center gap-3">
            <a
              href="#ask"
              className="press rounded-md bg-glow px-6 py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
            >
              Ask a document
            </a>
            <a
              href="#instrumentation"
              className="press rounded-md border border-hair px-6 py-3 text-sm text-dim transition-colors hover:border-halo hover:text-text"
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
