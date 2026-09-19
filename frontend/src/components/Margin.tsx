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
    <aside className="margin">
      <p className="margin-head">
        {sources.length} passage{sources.length === 1 ? '' : 's'} used to write this answer
      </p>

      {sources.map((s, i) => (
        <details className="mark" key={`${s.document_id}-${s.page}-${i}`}>
          <summary>
            <span className="mark-n">{i + 1}</span>
            <span className="mark-where">
              Page {s.page}
              <span>
                {s.filename}, found by {s.matched.map((k) => HOW[k]).join(' and ')}
              </span>
            </span>
          </summary>
          <p className="mark-body">{s.excerpt}</p>
        </details>
      ))}

      {done &&
        unverified.map((u, i) => (
          <div className="mark unverified" key={`bad-${i}`}>
            <div style={{ display: 'flex', gap: '.55rem', padding: '.6rem 0 .25rem' }}>
              <span className="mark-n">!</span>
              <span className="mark-where">
                {u.filename ? `${u.filename}, page ${u.page}` : `Page ${u.page}`}
              </span>
            </div>
            <p className="mark-note">
              The answer cited this, but it is not one of the passages above. Treat the
              claim it supports as unsupported.
            </p>
          </div>
        ))}
    </aside>
  )
}
