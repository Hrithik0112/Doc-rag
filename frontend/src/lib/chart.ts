/** Shared chart configuration, dark mode.
 *
 * These are a SEPARATE validated set from the light palette, not a brightened
 * flip of it. Stepped against the panel surface and checked at every pair for
 * colour-vision separation. The intuitive "just make them brighter" candidate
 * failed outright: blue and violet came out at delta-E 0.2 for protanopes,
 * i.e. the same colour. Three slots, because three is the most ever shown at
 * once. Do not swap one without re-validating the whole set. */

export const CHART = ['#00ab84', '#6180e8', '#c07f14'] as const
export const STATUS = { good: '#00b98d', warning: '#d9a520', critical: '#f06a5e' } as const

export const TEXT = '#e6ecea'
export const DIM = '#8fa09b'
export const HAIR = '#1f2c33'
export const SURFACE = '#10171c'
export const ACCENT = '#00c79a'

/** Recessive axes and grid: on dark, furniture needs to be quieter still or it
 *  reads as data. */
export const axis = {
  stroke: HAIR,
  tick: { fill: DIM, fontSize: 11 },
  tickLine: false,
  axisLine: { stroke: HAIR },
} as const

export const grid = {
  stroke: HAIR,
  strokeDasharray: '2 5',
  vertical: false,
} as const

export const tooltipStyle = {
  contentStyle: {
    background: 'rgba(16,23,28,.94)',
    border: `1px solid ${HAIR}`,
    borderRadius: 6,
    fontSize: 12,
    padding: '8px 10px',
    backdropFilter: 'blur(10px)',
    boxShadow: '0 12px 40px -12px rgba(0,0,0,.8)',
  },
  labelStyle: { color: TEXT, fontWeight: 500, marginBottom: 4 },
  itemStyle: { color: DIM, padding: 0 },
  cursor: { stroke: HAIR, strokeWidth: 1 },
} as const

/** 2px strokes, 8px active dots. The surface ring keeps a marker readable where
 *  it lands on top of its own line. */
export const line = {
  strokeWidth: 2,
  dot: false,
  activeDot: { r: 4, strokeWidth: 2, stroke: SURFACE },
} as const
