/** Shared chart configuration.
 *
 * The categorical colours below are a validated set: every pair clears the
 * colour-vision-deficiency and normal-vision separation floors against the
 * board surface. Swapping one without re-validating the whole set is how a
 * palette quietly becomes unreadable, so treat these as fixed and assign them
 * in order rather than cycling. */

export const CHART = ['#00997c', '#3a5ae0', '#b8730c', '#8e3a99'] as const
export const STATUS = { good: '#00806a', warning: '#a87f00', critical: '#c02a24' } as const

export const INK = '#16202b'
export const QUIET = '#6b7975'
export const RULE = '#d3d9d7'
export const SURFACE = '#fbfcfb'

/** Recessive axes and grid: the data carries the emphasis, not the furniture. */
export const axis = {
  stroke: RULE,
  tick: { fill: QUIET, fontSize: 11 },
  tickLine: false,
  axisLine: { stroke: RULE },
} as const

export const grid = {
  stroke: RULE,
  strokeDasharray: '2 4',
  vertical: false,
} as const

export const tooltipStyle = {
  contentStyle: {
    background: SURFACE,
    border: `1px solid ${RULE}`,
    borderRadius: 2,
    fontSize: 12,
    padding: '8px 10px',
    boxShadow: 'none',
  },
  labelStyle: { color: INK, fontWeight: 500, marginBottom: 4 },
  itemStyle: { color: QUIET, padding: 0 },
  cursor: { stroke: RULE, strokeWidth: 1 },
} as const

/** 2px strokes, 8px active dots -- the minimum that stays visible on a
 *  hairline-ruled surface without shouting. */
export const line = {
  strokeWidth: 2,
  dot: false,
  activeDot: { r: 4, strokeWidth: 2, stroke: SURFACE },
} as const
