/** Two validated palettes, not one inverted. Three slots because three is the
 *  most ever shown at once. Re-validate the whole set before swapping one. */

import type { Theme } from './theme'

const PALETTES = {
  dark: {
    chart: ['#00a98a', '#7086ef', '#c2861c'],
    // warning is the accent: an attention state, not a fourth categorical hue
    status: { good: '#3fb389', warning: '#d6a447', critical: '#ef6f61' },
    text: '#e8e6e0',
    dim: '#97a0a8',
    hair: '#29343f',
    surface: '#151d27',
    accent: '#d6a447',
    tooltipBg: 'rgba(21,29,39,.95)',
    tooltipShadow: '0 12px 40px -12px rgba(0,0,0,.75)',
    barCursor: 'rgba(255,255,255,.04)',
  },
  light: {
    chart: ['#00806a', '#3f5ddd', '#9d6412'],
    status: { good: '#00755f', warning: '#835c10', critical: '#b23a2e' },
    text: '#1a2233',
    dim: '#5b5750',
    hair: '#dcd6cb',
    surface: '#fffdf9',
    accent: '#835c10',
    tooltipBg: 'rgba(255,253,249,.96)',
    tooltipShadow: '0 12px 30px -14px rgba(26,34,51,.3)',
    barCursor: 'rgba(26,34,51,.05)',
  },
} as const

export function chartTheme(theme: Theme) {
  const p = PALETTES[theme]
  return {
    CHART: p.chart,
    STATUS: p.status,

    // recessive furniture: quieter than the data, per theme
    axis: {
      stroke: p.hair,
      tick: { fill: p.dim, fontSize: 11 },
      tickLine: false,
      axisLine: { stroke: p.hair },
    },
    grid: { stroke: p.hair, strokeDasharray: '2 5', vertical: false },
    tooltipStyle: {
      contentStyle: {
        background: p.tooltipBg,
        border: `1px solid ${p.hair}`,
        borderRadius: 6,
        fontSize: 12,
        padding: '8px 10px',
        backdropFilter: 'blur(10px)',
        boxShadow: p.tooltipShadow,
      },
      labelStyle: { color: p.text, fontWeight: 500, marginBottom: 4 },
      itemStyle: { color: p.dim, padding: 0 },
      cursor: { stroke: p.hair, strokeWidth: 1 },
    },
    barCursor: { fill: p.barCursor },
    // surface-ringed dots stay readable where a marker lands on its own line
    line: {
      strokeWidth: 2,
      dot: false,
      activeDot: { r: 4, strokeWidth: 2, stroke: p.surface },
    },
  }
}
