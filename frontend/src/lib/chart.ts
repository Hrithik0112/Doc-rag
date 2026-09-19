/** Shared chart configuration.
 *
 * Two palettes, not one palette inverted. Each was stepped against its own
 * surface and checked at every pair for lightness band, chroma floor,
 * colour-vision separation and contrast. The dark set is emphatically not the
 * light set brightened: that candidate failed, putting blue and violet at
 * delta-E 0.2 for protanopes, i.e. the same colour.
 *
 * Three slots in both themes, because three is the most ever shown at once.
 * Do not swap one without re-validating the whole set. */

import type { Theme } from './theme'

const PALETTES = {
  dark: {
    chart: ['#00ab84', '#6180e8', '#c07f14'],
    status: { good: '#00b98d', warning: '#d9a520', critical: '#f06a5e' },
    text: '#e6ecea',
    dim: '#8fa09b',
    hair: '#1f2c33',
    surface: '#10171c',
    accent: '#00c79a',
    tooltipBg: 'rgba(16,23,28,.94)',
    tooltipShadow: '0 12px 40px -12px rgba(0,0,0,.8)',
    barCursor: 'rgba(255,255,255,.04)',
  },
  light: {
    chart: ['#00997c', '#3a5ae0', '#b8730c'],
    status: { good: '#00806a', warning: '#a87f00', critical: '#c02a24' },
    text: '#16202b',
    dim: '#55635f',
    hair: '#d3d9d7',
    surface: '#fbfcfb',
    accent: '#00806a',
    tooltipBg: 'rgba(251,252,251,.96)',
    tooltipShadow: '0 12px 30px -14px rgba(22,32,43,.35)',
    barCursor: 'rgba(22,32,43,.05)',
  },
} as const

export type ChartTheme = ReturnType<typeof chartTheme>

export function chartTheme(theme: Theme) {
  const p = PALETTES[theme]
  return {
    CHART: p.chart,
    STATUS: p.status,
    ACCENT: p.accent,

    /** Recessive axes and grid: furniture must stay quieter than data in both
     *  themes, which means different values, not the same values. */
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
    /** 2px strokes, 8px active dots, ringed in the surface colour so a marker
     *  stays readable where it lands on its own line. */
    line: {
      strokeWidth: 2,
      dot: false,
      activeDot: { r: 4, strokeWidth: 2, stroke: p.surface },
    },
  }
}
