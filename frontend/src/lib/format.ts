export const compact = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M`
  : n >= 10_000 ? `${Math.round(n / 1000)}k`
  : n >= 1_000 ? `${(n / 1000).toFixed(1)}k`
  : String(n)

const pct = (num: number, den: number) =>
  den === 0 ? null : (num / den) * 100

/** One decimal only when it changes the reading. */
export const pctLabel = (num: number, den: number, fallback = 'no data yet') => {
  const p = pct(num, den)
  if (p === null) return fallback
  return `${p % 1 === 0 ? p.toFixed(0) : p.toFixed(1)}%`
}

export const ms = (v: number | null) =>
  v === null || v === undefined ? '—' : v >= 1000 ? `${(v / 1000).toFixed(1)}s` : `${v}ms`

export const day = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

export const stamp = (iso: string) =>
  new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  })
