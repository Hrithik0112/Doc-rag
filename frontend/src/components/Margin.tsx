import type { Source, Unverified } from '../api'

const HOW = { vector: 'meaning', keyword: 'exact wording' } as const

export function Margin({
  sources, unverified, done,
}: {
  sources: Source[]
  unverified: Unverified[]
  done: boolean
}) {
  if (!sources.length) return null

  return (
    <aside className="border-l border-hair pl-5 max-lg:border-l-0 max-lg:border-t max-lg:pl-0 max-lg:pt-4">
      <p className="mb-0.5 pb-2.5 text-xs text-faint">
        {sources.length} passage{sources.length === 1 ? '' : 's'} used to write this answer
      </p>

      {sources.map((s, i) => (
        <details key={`${s.document_id}-${s.page}-${i}`} className="group border-b border-hair/70 last:border-b-0">
          <summary className="flex cursor-pointer list-none items-baseline gap-2 py-2.5 transition-colors hover:text-glow [&::-webkit-details-marker]:hidden">
            <span className="tabular min-w-[1.25rem] text-[11px] font-semibold text-glow">{i + 1}</span>
            <span className="min-w-0 text-[13px] leading-snug">
              Page {s.page}
              <span className="mt-0.5 block text-xs text-faint">
                {s.filename}, found by {s.matched.map((k) => HOW[k]).join(' and ')}
              </span>
            </span>
          </summary>
          <p className="max-h-72 overflow-y-auto border-l border-hair/60 pb-3.5 pl-3 font-serif text-sm leading-relaxed text-dim">
            {s.excerpt}
          </p>
        </details>
      ))}

      {done &&
        unverified.map((u, i) => (
          <div key={`bad-${i}`} className="border-b border-hair/70 bg-critical/[0.06] last:border-b-0">
            <div className="flex gap-2 pb-1 pt-2.5">
              <span className="min-w-[1.25rem] text-[11px] font-semibold text-critical">!</span>
              <span className="text-[13px] leading-snug text-critical line-through">
                {u.filename ? `${u.filename}, page ${u.page}` : `Page ${u.page}`}
              </span>
            </div>
            <p className="pb-2.5 text-xs leading-snug text-critical/85">
              The answer cited this, but it is not one of the passages above. Treat the
              claim it supports as unsupported.
            </p>
          </div>
        ))}
    </aside>
  )
}
