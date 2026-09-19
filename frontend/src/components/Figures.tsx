import type { ReactNode } from 'react'
import { SplitFlapDisplay } from '@/components/ui/split-flap-display'
import { chartTheme } from '@/lib/chart'
import { useTheme } from '@/lib/theme'

/** Hairlines rather than identical cards, so the lead figure outranks the rest. */
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

/** Only the lead figure flips, so the motion keeps its meaning. */
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
    text: theme === 'dark' ? '#e8e6e0' : '#1a2233',
    good: STATUS.good,
    critical: STATUS.critical,
    dim: theme === 'dark' ? '#97a0a8' : '#5b5750',
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
        <div className="mt-2.5">
          <SplitFlapDisplay
            text={value.toUpperCase()}
            columns={value.length}
            size="md"
            accentColor={accent}
            // the strip is the only place accentColor lands; it carries the tone
            showIndicators
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

      {/* tone is never colour alone: the note spells the ratio out in words */}
      {note && (
        <p className={`mt-2 text-xs leading-snug ${lead && tone !== 'text' ? TONE[tone] : 'text-faint'}`}>
          {note}
        </p>
      )}
    </div>
  )
}

/** A bar, not a pie. 2px gaps keep adjacent fills apart without borders. */
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
