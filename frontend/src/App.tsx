import { useEffect, useState } from 'react'
import { ErrorBoundary } from './components/ErrorBoundary'
import { Chat } from './screens/Chat'
import { Dashboard } from './screens/Dashboard'
import { Landing } from './screens/Landing'
import { useTheme } from './lib/theme'

type Screen = 'home' | 'ask' | 'instrumentation'

const NAV: { id: Screen; label: string; href: string }[] = [
  { id: 'home', label: 'Home', href: '#' },
  { id: 'ask', label: 'Ask', href: '#ask' },
  { id: 'instrumentation', label: 'Instrumentation', href: '#instrumentation' },
]

const read = (): Screen => {
  const h = window.location.hash.slice(1)
  return h === 'ask' || h === 'instrumentation' ? h : 'home'
}

function ThemeToggle() {
  const { theme, toggle } = useTheme()
  const next = theme === 'dark' ? 'light' : 'dark'
  return (
    <button
      onClick={toggle}
      title={`Switch to ${next} mode`}
      aria-label={`Switch to ${next} mode`}
      className="press grid size-8 place-items-center rounded-md text-dim transition-colors hover:bg-raised hover:text-text"
    >
      {theme === 'dark' ? (
        <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" aria-hidden>
          <circle cx="12" cy="12" r="4.2" stroke="currentColor" strokeWidth="1.6" />
          <path d="M12 2.6v2.2M12 19.2v2.2M2.6 12h2.2M19.2 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M18.7 5.3l-1.6 1.6M6.9 17.1l-1.6 1.6"
                stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" aria-hidden>
          <path d="M20 14.2A8.2 8.2 0 1 1 9.8 4a6.6 6.6 0 0 0 10.2 10.2z"
                stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  )
}

export default function App() {
  // hash routing: three screens do not justify a router, and URLs still work
  const [screen, setScreen] = useState<Screen>(read)

  useEffect(() => {
    const onHash = () => setScreen(read())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  return (
    <div className="flex h-dvh w-full flex-col bg-void">
      <header className="flex flex-none items-center gap-6 border-b border-hair px-6 py-3">
        <a href="#" className="flex items-baseline gap-3" onClick={() => setScreen('home')}>
          <span className="font-display text-[22px] leading-none tracking-tight">PaperTrail</span>
          <span className="hidden text-xs text-faint sm:inline">
            Answers that show where they came from
          </span>
        </a>

        <nav className="ml-auto flex items-center gap-1">
          {NAV.map((n) => (
            <a
              key={n.id}
              href={n.href}
              aria-current={screen === n.id ? 'page' : undefined}
              onClick={() => n.id === 'home' && setScreen('home')}
              className={`rounded-md px-3 py-1.5 text-[13px] transition-colors ${
                screen === n.id ? 'bg-raised text-text' : 'text-dim hover:text-text'
              }`}
            >
              {n.label}
            </a>
          ))}
          <span className="mx-1 h-5 w-px bg-hair" aria-hidden />
          <ThemeToggle />
        </nav>
      </header>

      <main className="flex min-h-0 flex-1 flex-col">
        {/* keyed by screen so navigating away from a broken one clears the error */}
        <ErrorBoundary key={screen}>
          {screen === 'home' ? <Landing /> : screen === 'ask' ? <Chat /> : <Dashboard />}
        </ErrorBoundary>
      </main>
    </div>
  )
}
