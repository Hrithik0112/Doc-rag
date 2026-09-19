import type { Doc } from '../api'
import { deleteDocument, resumeDocument } from '../api'

const STATE: Record<Doc['status'], string> = {
  pending: 'Queued', processing: 'Indexing', ready: 'Ready', failed: 'Stopped',
}

export function DocumentRail({
  docs, selected, onToggle, onRefresh,
}: {
  docs: Doc[]
  selected: Set<string>
  onToggle: (id: string) => void
  onRefresh: () => void
}) {
  if (!docs.length) {
    return (
      <p className="px-3 py-2 text-[13px] leading-relaxed text-quiet">
        Nothing indexed yet. Add a PDF and PaperTrail will split it into passages you can
        question.
      </p>
    )
  }

  return (
    <>
      {docs.map((d) => {
        const pct = d.n_chunks ? Math.round((d.n_embedded / d.n_chunks) * 100) : 0
        const working = d.status === 'pending' || d.status === 'processing'
        const on = selected.has(d.id)
        return (
          <button
            key={d.id}
            type="button"
            aria-pressed={on}
            onClick={() => onToggle(d.id)}
            className="relative block w-full border-b border-rule px-3 py-2.5 text-left last:border-b-0"
          >
            {on && <span className="absolute inset-y-2 left-0 w-0.5 bg-trace" />}
            <span className="block truncate text-[13px] font-medium" title={d.filename}>
              {d.filename}
            </span>

            <span className={`tabular mt-1 block text-xs ${d.status === 'failed' ? 'text-oxide' : 'text-quiet'}`}>
              {d.status === 'ready'
                ? `${d.n_chunks} passages across ${d.n_pages} pages`
                : d.status === 'failed'
                  ? `${STATE.failed} at ${d.n_embedded} of ${d.n_chunks} passages`
                  : `${STATE[d.status]} ${d.n_embedded} of ${d.n_chunks} passages`}
            </span>

            {working && (
              <span className="mt-1.5 block h-0.5 bg-rule">
                <i className="block h-full bg-trace transition-[width] duration-300" style={{ width: `${pct}%` }} />
              </span>
            )}

            {d.status === 'failed' && (
              <>
                <span className="mt-1 block text-xs leading-snug text-oxide">
                  {d.error?.startsWith('quota')
                    ? 'Gemini free-tier quota ran out. Resume when it resets; finished passages are kept.'
                    : d.error}
                </span>
                <span className="mt-1.5 flex gap-4">
                  <button
                    className="text-xs text-quiet underline underline-offset-2 hover:text-ink"
                    onClick={(e) => { e.stopPropagation(); resumeDocument(d.id).then(onRefresh) }}
                  >
                    Resume
                  </button>
                  <button
                    className="text-xs text-quiet underline underline-offset-2 hover:text-oxide"
                    onClick={(e) => { e.stopPropagation(); deleteDocument(d.id).then(onRefresh) }}
                  >
                    Remove
                  </button>
                </span>
              </>
            )}
          </button>
        )
      })}
    </>
  )
}
