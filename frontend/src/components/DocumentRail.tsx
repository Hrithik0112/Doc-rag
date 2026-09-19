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
      <p className="px-3 py-2 text-[13px] leading-relaxed text-faint">
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
            className="relative block w-full rounded-md border-b border-hair/60 px-3 py-2.5 text-left transition-colors last:border-b-0 hover:bg-raised/60"
          >
            {on && <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-glow shadow-[0_0_10px_var(--accent)]" />}
            <span className="block truncate text-[13px] font-medium" title={d.filename}>
              {d.filename}
            </span>

            <span className={`tabular mt-1 block text-xs ${d.status === 'failed' ? 'text-critical' : 'text-faint'}`}>
              {d.status === 'ready'
                ? `${d.n_chunks} passages across ${d.n_pages} pages`
                : d.status === 'failed'
                  ? `${STATE.failed} at ${d.n_embedded} of ${d.n_chunks} passages`
                  : `${STATE[d.status]} ${d.n_embedded} of ${d.n_chunks} passages`}
            </span>

            {working && (
              <span className="mt-1.5 block h-[3px] overflow-hidden rounded-full bg-hair">
                {/* scaleX, not width: width is a layout property. linear, because
                    a progress bar is constant motion rather than an entrance. */}
                <i
                  className="block h-full w-full origin-left bg-glow shadow-[0_0_8px_var(--accent)] transition-transform duration-300 ease-linear"
                  style={{ transform: `scaleX(${pct / 100})` }}
                />
              </span>
            )}

            {d.status === 'failed' && (
              <>
                <span className="mt-1 block text-xs leading-snug text-critical/85">
                  {d.error?.startsWith('quota')
                    ? 'Gemini free-tier quota ran out. Resume when it resets; finished passages are kept.'
                    : d.error}
                </span>
                <span className="mt-1.5 flex gap-4">
                  <button
                    className="text-xs text-dim underline underline-offset-2 hover:text-glow"
                    onClick={(e) => { e.stopPropagation(); resumeDocument(d.id).then(onRefresh) }}
                  >
                    Resume
                  </button>
                  <button
                    className="text-xs text-dim underline underline-offset-2 hover:text-critical"
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
