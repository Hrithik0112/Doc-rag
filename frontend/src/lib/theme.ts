import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'

export type Theme = 'light' | 'dark'

const KEY = 'papertrail-theme'

/** One store, not one useState per caller.
 *
 * The obvious version -- a hook holding its own useState -- gives every
 * component a private copy. The toggle then updates its own copy and the DOM
 * attribute, and every other consumer keeps rendering the old theme forever.
 * Anything driven by a CSS variable still flips, so the bug hides: only the
 * things that take colour as a prop (the WebGL gradient, the Recharts config,
 * the split-flap) stay stuck, and only until the next full page load. */
const listeners = new Set<() => void>()

const read = (): Theme =>
  (document.documentElement.dataset.theme as Theme) ?? 'dark'

function subscribe(fn: () => void) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

function emit() {
  listeners.forEach((fn) => fn())
}

export function setTheme(next: Theme) {
  document.documentElement.dataset.theme = next
  try {
    localStorage.setItem(KEY, next)
  } catch {
    /* private mode */
  }
  emit()
}

/** The theme is resolved and written to <html> by an inline script in
 *  index.html before first paint, so this reads it rather than deciding it. */
export function useTheme() {
  const theme = useSyncExternalStore(subscribe, read, () => 'dark' as Theme)

  useEffect(() => {
    // follow the OS only while the user has expressed no preference
    const mq = matchMedia('(prefers-color-scheme: light)')
    const onSystem = () => {
      if (localStorage.getItem(KEY)) return
      document.documentElement.dataset.theme = mq.matches ? 'light' : 'dark'
      emit()
    }
    mq.addEventListener('change', onSystem)
    return () => mq.removeEventListener('change', onSystem)
  }, [])

  const toggle = useCallback(() => {
    setTheme(read() === 'dark' ? 'light' : 'dark')
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
