import type { ReactNode } from 'react'

/** The ledger band: hero figures separated by rules rather than boxed into
 *  identical cards, so the headline number outranks the supporting ones. */
export function Band({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-4 divide-x divide-rule border-y border-rule bg-card max-md:grid-cols-2 max-md:divide-y">
      {children}
    </div>
  )
}

export function Figure({
  label, value, note, tone = 'ink', lead = false,
}: {
  label: string
  value: string
  note?: ReactNode
  tone?: 'ink' | 'good' | 'critical' | 'quiet'
  lead?: boolean
}) {
  const color = {
    ink: 'text-ink', good: 'text-good', critical: 'text-critical', quiet: 'text-quiet',
  }[tone]
  return (
    <div className="px-5 py-4">
      <p className="text-xs text-quiet">{label}</p>
      <p className={`tabular mt-1.5 font-serif ${lead ? 'text-4xl' : 'text-2xl'} font-medium leading-none tracking-tight ${color}`}>
        {value}
      </p>
      {note && <p className="mt-1.5 text-xs leading-snug text-quiet">{note}</p>}
    </div>
  )
}

/** A proportion shown as a thin rule rather than a pie or a donut. */
export function Meter({ parts }: { parts: { label: string; n: number; color: string }[] }) {
  const total = parts.reduce((s, p) => s + p.n, 0)
  if (!total) return <p className="text-xs text-quiet">No data yet.</p>
  return (
    <>
      <div className="flex h-2 w-full gap-0.5 overflow-hidden">
        {parts.filter((p) => p.n > 0).map((p) => (
          <div key={p.label} style={{ width: `${(p.n / total) * 100}%`, background: p.color }} />
        ))}
      </div>
      <ul className="mt-3 space-y-1.5">
        {parts.map((p) => (
          <li key={p.label} className="flex items-baseline gap-2 text-xs">
            <span className="mt-[3px] size-2 shrink-0 self-start" style={{ background: p.color }} />
            <span className="flex-1 text-quiet">{p.label}</span>
            <span className="tabular text-ink">{p.n}</span>
            <span className="tabular w-10 text-right text-quiet">
              {((p.n / total) * 100).toFixed(0)}%
            </span>
          </li>
        ))}
      </ul>
    </>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-xs text-quiet">{children}</p>
}
