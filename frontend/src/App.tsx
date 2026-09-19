import { useEffect, useState } from 'react'
import { GrainGradient } from '@/components/ui/grain-gradient'
import { KineticTextReveal } from '@/components/ui/kinetic-text-reveal'
import { MagneticDock, type DockItemData } from '@/components/ui/magnetic-dock'
import { Chat } from './screens/Chat'
import { Dashboard } from './screens/Dashboard'
import { Landing } from './screens/Landing'
import { useTheme } from './lib/theme'

type Screen = 'home' | 'ask' | 'instrumentation'

const read = (): Screen => {
  const h = window.location.hash.slice(1)
  return h === 'ask' || h === 'instrumentation' ? h : 'home'
}

/** Two marks drawn rather than imported, so the dock carries this product's
 *  vocabulary (a page, a trace) instead of generic app icons. */
const IconAsk = () => (
  <svg viewBox="0 0 24 24" fill="none" className="size-full" aria-hidden>
    <path d="M6 3.5h8.5L19 8v12.5H6z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    <path d="M14 3.5V8h4.5" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    <path d="M9 12h7M9 15.5h4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
)

const IconHome = () => (
  <svg viewBox="0 0 24 24" fill="none" className="size-full" aria-hidden>
    <path d="M4 10.8 12 4l8 6.8V20H4z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    <path d="M9.6 20v-5.4h4.8V20" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
  </svg>
)

const IconTrace = () => (
  <svg viewBox="0 0 24 24" fill="none" className="size-full" aria-hidden>
    <path d="M4 17.5l4.5-5.5 3.5 3L19 6" stroke="currentColor" strokeWidth="1.8"
          strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="19" cy="6" r="2.2" fill="currentColor" />
  </svg>
)

function ThemeToggle() {
  const { theme, toggle } = useTheme()
  const next = theme === 'dark' ? 'light' : 'dark'
  return (
    <button
      onClick={toggle}
      title={`Switch to ${next} mode`}
      aria-label={`Switch to ${next} mode`}
      className="grid size-9 place-items-center rounded-full border border-hair text-dim transition-colors hover:border-halo hover:text-text"
    >
      {theme === 'dark' ? (
        <svg viewBox="0 0 24 24" className="size-4" fill="none" aria-hidden>
          <circle cx="12" cy="12" r="4.2" stroke="currentColor" strokeWidth="1.6" />
          <path d="M12 2.6v2.2M12 19.2v2.2M2.6 12h2.2M19.2 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M18.7 5.3l-1.6 1.6M6.9 17.1l-1.6 1.6"
                stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" className="size-4" fill="none" aria-hidden>
          <path d="M20 14.2A8.2 8.2 0 1 1 9.8 4a6.6 6.6 0 0 0 10.2 10.2z"
                stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  )
}

export default function App() {
  const { theme } = useTheme()
  // The hash is the router. Two screens do not justify a routing library, and
  // this still gives each one a shareable, reloadable URL.
  const [screen, setScreen] = useState<Screen>(read)

  useEffect(() => {
    const onHash = () => setScreen(read())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const go = (id: Screen) => () => {
    if (id === 'home') history.replaceState(null, '', ' ')
    window.location.hash = id === 'home' ? '' : id
    if (id === 'home') setScreen('home')
  }

  const items: DockItemData[] = [
    { id: 'home', label: 'Home', icon: <IconHome />, isActive: screen === 'home', onClick: go('home') },
    { id: 'ask', label: 'Ask', icon: <IconAsk />, isActive: screen === 'ask', onClick: go('ask') },
    {
      id: 'instrumentation', label: 'Instrumentation', icon: <IconTrace />,
      isActive: screen === 'instrumentation', onClick: go('instrumentation'),
    },
  ]

  return (
    <div className="relative flex h-dvh w-full flex-col overflow-hidden bg-void">
      {/* Ambient field. Fixed and non-interactive so it never competes with the
          work; the panels above it are opaque where numbers are read. */}
      <div className="pointer-events-none fixed inset-0 -z-10" aria-hidden>
        <GrainGradient
          key={theme}
          colorDark={theme === 'dark' ? '#070a0d' : '#e2e9e6'}
          colorMid={theme === 'dark' ? '#0d2b2a' : '#c9ded6'}
          colorLight={theme === 'dark' ? '#00c79a' : '#7fd3bb'}
          angle={118}
          softness={0.85}
          grain={theme === 'dark' ? 0.32 : 0.18}
          scale={1.35}
          speed={0.22}
          className={`size-full ${theme === 'dark' ? 'opacity-[0.55]' : 'opacity-[0.5]'}`}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-void/40 via-void/75 to-void" />
      </div>

      <header className="relative z-20 flex flex-none items-center gap-4 border-b border-hair/70 px-6 py-3 backdrop-blur-xl">
        <a href="#" className="group flex items-baseline gap-3">
          <KineticTextReveal
            text="PaperTrail"
            splitBy="characters"
            direction="up"
            distance={18}
            stagger={0.022}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            blur
            className="font-serif text-xl font-medium tracking-tight"
          />
          <span className="hidden text-xs text-faint sm:inline">
            Answers that show where they came from
          </span>
        </a>

        <div className="ml-auto flex items-center gap-3">
          <ThemeToggle />
          <MagneticDock
            items={items}
            position="top"
            variant="glass"
            iconSize={30}
            maxScale={1.7}
            magneticDistance={110}
            showLabels
            className="!static !translate-x-0"
          />
        </div>
      </header>

      <main className="relative z-10 flex min-h-0 flex-1 flex-col">
        {screen === 'home' ? <Landing /> : screen === 'ask' ? <Chat /> : <Dashboard />}
      </main>
    </div>
  )
}
