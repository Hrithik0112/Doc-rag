import { useCallback, useEffect, useState } from 'react'

export type Theme = 'light' | 'dark'

const KEY = 'papertrail-theme'

const current = (): Theme =>
  (document.documentElement.dataset.theme as Theme) ?? 'dark'

/** The theme is already resolved and written to <html> by an inline script in
 *  index.html, so this reads it rather than deciding it. That keeps the first
 *  paint correct and leaves one source of truth. */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(current)

  useEffect(() => {
    // follow the OS only while the user has expressed no preference
    const mq = matchMedia('(prefers-color-scheme: light)')
    const onSystem = () => {
      if (localStorage.getItem(KEY)) return
      const next: Theme = mq.matches ? 'light' : 'dark'
      document.documentElement.dataset.theme = next
      setTheme(next)
    }
    mq.addEventListener('change', onSystem)
    return () => mq.removeEventListener('change', onSystem)
  }, [])

  const toggle = useCallback(() => {
    setTheme((prev) => {
      const next: Theme = prev === 'dark' ? 'light' : 'dark'
      document.documentElement.dataset.theme = next
      try { localStorage.setItem(KEY, next) } catch { /* private mode */ }
      return next
    })
  }, [])

  return { theme, toggle }
}

/** WebGL animation runs on requestAnimationFrame, which a CSS
 *  prefers-reduced-motion rule cannot stop. Anything canvas-based has to check
 *  this itself and render something still instead. */
export function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(
    () => matchMedia('(prefers-reduced-motion: reduce)').matches,
  )
  useEffect(() => {
    const mq = matchMedia('(prefers-reduced-motion: reduce)')
    const on = () => setReduced(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return reduced
}
