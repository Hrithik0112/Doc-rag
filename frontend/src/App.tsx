import { useEffect, useState } from 'react'
import { Chat } from './screens/Chat'
import { Dashboard } from './screens/Dashboard'

type Screen = 'ask' | 'instrumentation'

const SCREENS: { id: Screen; label: string }[] = [
  { id: 'ask', label: 'Ask' },
  { id: 'instrumentation', label: 'Instrumentation' },
]

const read = (): Screen =>
  window.location.hash.slice(1) === 'instrumentation' ? 'instrumentation' : 'ask'

export default function App() {
  // The hash is the router. Two screens do not justify a routing library, and
  // this still gives each one a shareable, reloadable URL.
  const [screen, setScreen] = useState<Screen>(read)

  useEffect(() => {
    const onHash = () => setScreen(read())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  return (
    <div className="flex h-dvh w-full flex-col">
      <header className="flex flex-none items-baseline gap-6 border-b border-rule bg-card px-6 py-3">
        <div className="flex items-baseline gap-3">
          <h1 className="font-serif text-xl font-medium tracking-tight">PaperTrail</h1>
          <p className="text-xs text-quiet max-sm:hidden">Answers that show where they came from</p>
        </div>

        <nav className="ml-auto flex gap-1">
          {SCREENS.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              aria-current={screen === s.id ? 'page' : undefined}
              className={`rounded-sm px-3 py-1.5 text-[13px] transition-colors ${
                screen === s.id
                  ? 'bg-ink text-board'
                  : 'text-quiet hover:bg-secondary hover:text-ink'
              }`}
            >
              {s.label}
            </a>
          ))}
        </nav>
      </header>

      <main className="flex min-h-0 flex-1 flex-col">
        {screen === 'ask' ? <Chat /> : <Dashboard />}
      </main>
    </div>
  )
}
