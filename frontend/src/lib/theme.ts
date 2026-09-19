import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'

export type Theme = 'light' | 'dark'

const KEY = 'papertrail-theme'

/** One store, not a useState per caller. Private copies leave every consumer
 *  but the toggle rendering a stale theme, which only shows on the few things
 *  taking colour as a prop rather than from a CSS variable. */
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

// <html data-theme> is set pre-paint in index.html; this reads it, not decides it
export function useTheme() {
  const theme = useSyncExternalStore(subscribe, read, () => 'dark' as Theme)

  useEffect(() => {
    // follow the OS only until the user expresses a preference
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

/** rAF animation ignores the CSS reduced-motion rule, so canvases must ask. */
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
