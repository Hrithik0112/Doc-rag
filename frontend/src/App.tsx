import { useEffect, useState } from 'react'
import { GrainGradient } from '@/components/ui/grain-gradient'
import { KineticTextReveal } from '@/components/ui/kinetic-text-reveal'
import { MagneticDock, type DockItemData } from '@/components/ui/magnetic-dock'
import { Chat } from './screens/Chat'
import { Dashboard } from './screens/Dashboard'

type Screen = 'ask' | 'instrumentation'

const read = (): Screen =>
  window.location.hash.slice(1) === 'instrumentation' ? 'instrumentation' : 'ask'

/** Two marks drawn rather than imported, so the dock carries this product's
 *  vocabulary (a page, a trace) instead of generic app icons. */
const IconAsk = () => (
  <svg viewBox="0 0 24 24" fill="none" className="size-full" aria-hidden>
    <path d="M6 3.5h8.5L19 8v12.5H6z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    <path d="M14 3.5V8h4.5" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    <path d="M9 12h7M9 15.5h4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
)

const IconTrace = () => (
  <svg viewBox="0 0 24 24" fill="none" className="size-full" aria-hidden>
    <path d="M4 17.5l4.5-5.5 3.5 3L19 6" stroke="currentColor" strokeWidth="1.8"
          strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="19" cy="6" r="2.2" fill="currentColor" />
  </svg>
)

export default function App() {
  // The hash is the router. Two screens do not justify a routing library, and
  // this still gives each one a shareable, reloadable URL.
  const [screen, setScreen] = useState<Screen>(read)

  useEffect(() => {
    const onHash = () => setScreen(read())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const go = (id: Screen) => () => { window.location.hash = id }

  const items: DockItemData[] = [
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
          colorDark="#070a0d"
          colorMid="#0d2b2a"
          colorLight="#00c79a"
          angle={118}
          softness={0.85}
          grain={0.32}
          scale={1.35}
          speed={0.22}
          className="size-full opacity-[0.55]"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-void/40 via-void/75 to-void" />
      </div>

      <header className="relative z-20 flex flex-none items-center gap-4 border-b border-hair/70 px-6 py-3 backdrop-blur-xl">
        <a href="#ask" className="group flex items-baseline gap-3">
          <KineticTextReveal
            text="PaperTrail"
            splitBy="characters"
            direction="up"
            distance={18}
            stagger={0.028}
            blur
            className="font-serif text-xl font-medium tracking-tight"
          />
          <span className="hidden text-xs text-faint sm:inline">
            Answers that show where they came from
          </span>
        </a>

        <div className="ml-auto">
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
        {screen === 'ask' ? <Chat /> : <Dashboard />}
      </main>
    </div>
  )
}
