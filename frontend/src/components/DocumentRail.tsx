import type { Doc } from '../api'
import { deleteDocument, resumeDocument } from '../api'

const STATE: Record<Doc['status'], string> = {
  pending: 'Queued',
  processing: 'Indexing',
  ready: 'Ready',
  failed: 'Stopped',
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
      <p className="docs-empty">
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
        return (
          <button
            key={d.id}
            type="button"
            className="doc"
            aria-pressed={selected.has(d.id)}
            onClick={() => onToggle(d.id)}
          >
            <span className="doc-name" title={d.filename}>{d.filename}</span>

            <span className={`doc-meta${d.status === 'failed' ? ' failed' : ''}`}>
              {d.status === 'ready'
                ? `${d.n_chunks} passages across ${d.n_pages} pages`
                : d.status === 'failed'
                  ? `${STATE.failed} at ${d.n_embedded} of ${d.n_chunks} passages`
                  : `${STATE[d.status]} ${d.n_embedded} of ${d.n_chunks}`}
            </span>

            {working && <span className="bar"><i style={{ width: `${pct}%` }} /></span>}

            {d.status === 'failed' && (
              <>
                <span className="doc-meta failed">
                  {d.error?.startsWith('quota')
                    ? 'Gemini free-tier quota ran out. Resume when it resets; finished passages are kept.'
                    : d.error}
                </span>
                <span className="doc-actions">
                  <button
                    className="link"
                    onClick={(e) => { e.stopPropagation(); resumeDocument(d.id).then(onRefresh) }}
                  >
                    Resume
                  </button>
                  <button
                    className="link danger"
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
