import type { ReactNode } from 'react'
import { SplitFlapDisplay } from '@/components/ui/split-flap-display'
import { chartTheme } from '@/lib/chart'
import { useTheme } from '@/lib/theme'

/** The headline band. Figures sit on the ambient field separated by hairlines
 *  rather than boxed into identical cards, so the lead number outranks the
 *  supporting ones instead of competing with them. */
export function Band({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-4 gap-px overflow-hidden rounded-lg border border-hair/80 bg-hair/60 max-md:grid-cols-2">
      {children}
    </div>
  )
}

const TONE = {
  text: 'text-text',
  good: 'text-good',
  critical: 'text-critical',
  dim: 'text-dim',
} as const

/** The lead figure flips like a departure board. It is the one moment of
 *  mechanical motion on the screen, reserved for the number that matters most;
 *  the supporting figures stay still so the movement keeps its meaning. */
export function Figure({
  label, value, note, tone = 'text', lead = false, flip = false,
}: {
  label: string
  value: string
  note?: ReactNode
  tone?: keyof typeof TONE
  lead?: boolean
  flip?: boolean
}) {
  const { theme } = useTheme()
  const { STATUS } = chartTheme(theme)
  const accent = {
    text: theme === 'dark' ? '#e6ecea' : '#16202b',
    good: STATUS.good,
    critical: STATUS.critical,
    dim: theme === 'dark' ? '#8fa09b' : '#55635f',
  }[tone]

  return (
    <div className="relative bg-panel/70 px-5 py-4 backdrop-blur-xl">
      {lead && (
        <span
          className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-glow to-transparent"
          aria-hidden
        />
      )}
      <p className="text-xs tracking-wide text-faint">{label}</p>

      {flip ? (
        // columns must match the value or the board pads to its 14-cell default
        // and runs straight out of the panel
        <div className="mt-2.5">
          <SplitFlapDisplay
            text={value.toUpperCase()}
            columns={value.length}
            size="md"
            accentColor={accent}
            showIndicators={false}
            flipSpeed={34}
            staggerDelay={60}
            className="!rounded-md !p-2"
          />
        </div>
      ) : (
        <p className={`tabular mt-1.5 font-serif ${lead ? 'text-4xl' : 'text-2xl'} font-medium leading-none tracking-tight ${TONE[tone]}`}>
          {value}
        </p>
      )}

      {note && <p className="mt-2 text-xs leading-snug text-faint">{note}</p>}
    </div>
  )
}

/** A proportion as a thin bar rather than a pie. Each segment keeps a 2px gap
 *  so adjacent fills stay distinguishable without a border. */
export function Meter({ parts }: { parts: { label: string; n: number; color: string }[] }) {
  const total = parts.reduce((s, p) => s + p.n, 0)
  if (!total) return <p className="text-xs text-faint">No data yet.</p>
  return (
    <>
      <div className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full bg-hair/60">
        {parts.filter((p) => p.n > 0).map((p) => (
          <div
            key={p.label}
            className="first:rounded-l-full last:rounded-r-full"
            style={{
              width: `${(p.n / total) * 100}%`,
              background: p.color,
              boxShadow: `0 0 14px -4px ${p.color}`,
            }}
          />
        ))}
      </div>
      <ul className="mt-3.5 space-y-2">
        {parts.map((p) => (
          <li key={p.label} className="flex items-baseline gap-2.5 text-xs">
            <span
              className="mt-[3px] size-2 shrink-0 self-start rounded-[2px]"
              style={{ background: p.color, boxShadow: `0 0 10px -2px ${p.color}` }}
            />
            <span className="flex-1 text-dim">{p.label}</span>
            <span className="tabular text-text">{p.n}</span>
            <span className="tabular w-10 text-right text-faint">
              {((p.n / total) * 100).toFixed(0)}%
            </span>
          </li>
        ))}
      </ul>
    </>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-8 text-center text-xs text-faint">{children}</p>
}
