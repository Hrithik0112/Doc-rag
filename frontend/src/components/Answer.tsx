import type { Source } from '../api'

// Built per call, not shared at module scope: matchAll honours a stale
// lastIndex, so one shared /g regex would need resetting on every use.
const bracketRe = () => /\[([^\][]+)\]/g
// Models write [report.pdf, Page 1, Page 8], so the filename is whatever
// precedes the FIRST page mark, not the last.
const pagesRe = () => /Pages?\s+([\d\s,–-]*\d)/gi

type Cite = { filename: string; page: number }

// source PDFs carry LaTeX; unwrap it rather than ship a math engine
const stripMath = (t: string) =>
  t
    .replace(/\$([^$\n]{1,120})\$/g, '$1')
    .replace(/\\(?:text|mathrm|mathit|mathbf|rm)\{([^{}]*)\}/g, '$1')
    .replace(/_\{([^{}]*)\}/g, '$1')
    .replace(/\^\{([^{}]*)\}/g, '$1')

function parseCitations(inner: string): Cite[] {
  const runs = [...inner.matchAll(pagesRe())]
  if (!runs.length) return []
  const filename = inner.slice(0, runs[0].index).trim().replace(/,$/, '').trim()
  return runs.flatMap((r) =>
    r[1]
      .split(/[,\s]+/)
      .flatMap((p) => p.split(/[–-]/))
      .filter((p) => /^\d+$/.test(p))
      .map((p) => ({ filename, page: Number(p) })),
  )
}

/** Qualified citations must match the filename too, so a page from the wrong
 *  document cannot quietly resolve to a right-looking mark. */
function markFor(sources: Source[], filename: string, page: number) {
  const i = sources.findIndex(
    (s) => s.page === page && (!filename || s.filename === filename),
  )
  return i === -1 ? null : i + 1
}

export function Answer({
  text: raw, sources, streaming,
}: {
  text: string
  sources: Source[]
  streaming: boolean
}) {
  const text = stripMath(raw)
  const nodes: React.ReactNode[] = []
  let last = 0

  for (const m of text.matchAll(bracketRe())) {
    const cites = parseCitations(m[1])
    if (!cites.length) continue // a bare [1] is a reference, not a citation
    nodes.push(text.slice(last, m.index))
    last = m.index + m[0].length

    cites.forEach((c, j) => {
      const n = markFor(sources, c.filename, c.page)
      const label = c.filename ? `${c.filename}, page ${c.page}` : `page ${c.page}`
      nodes.push(
        <sup
          key={`${m.index}-${j}`}
          className={`px-[.1em] align-[.35em] font-sans text-[11px] font-medium ${
            n === null
              ? 'text-critical'
              : 'text-glow [text-shadow:0_0_10px_color-mix(in_oklab,currentColor_55%,transparent)]'
          }`}
          title={n === null ? `${label} is not among the retrieved passages` : label}
        >
          {n === null ? '!' : n}
        </sup>,
      )
    })
  }
  nodes.push(text.slice(last))

  return (
    <div className="whitespace-pre-wrap font-serif text-[17px] leading-[1.72] text-text/95">
      {nodes}
      {streaming && (
        <span
          aria-label="Writing"
          className="ml-[.06em] inline-block h-[1.05em] w-[.5em] animate-[blink_1.1s_steps(1,end)_infinite] align-[-.16em] bg-glow shadow-[0_0_12px_var(--accent)]"
        />
      )}
    </div>
  )
}
