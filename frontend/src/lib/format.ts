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

/** Free-tier spend is zero. This is what the traffic WOULD cost on the paid
 *  tier, so it is never rendered without that qualifier beside it. */
export const usd = (v: number) =>
  v === 0 ? '$0' : v < 0.01 ? `$${v.toFixed(4)}` : `$${v.toFixed(2)}`

export const ERROR_KIND_LABEL: Record<string, string> = {
  quota_daily: 'Daily quota',
  quota_per_minute: 'Per-minute quota',
  upstream: 'Upstream 5xx',
  timeout: 'Timeout',
  no_extractable_text: 'No text to extract',
  bad_input: 'Bad input',
  database: 'Database',
  unknown: 'Unclassified',
}
