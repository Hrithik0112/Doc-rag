import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = { children: ReactNode }
type State = { error: Error | null }

/** React unmounts the whole tree on an uncaught render error, so without this
 *  one bad answer blanks the entire app with no message. Still a class: hooks
 *  cannot catch render errors. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error('[papertrail] render error', error, info.componentStack)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <div className="max-w-md">
          <h2 className="font-display text-2xl tracking-tight text-critical">
            This screen stopped rendering
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-dim">
            Something in the interface threw while drawing. Your documents and answers are
            untouched — this is a display fault, not lost data.
          </p>
          <pre className="mt-4 overflow-x-auto rounded-md border border-hair bg-panel p-3 text-xs text-faint">
            {error.message}
          </pre>
          <div className="mt-5 flex gap-3">
            <button
              onClick={() => this.setState({ error: null })}
              className="press rounded-md bg-glow px-4 py-2 text-sm font-semibold text-primary-foreground"
            >
              Try again
            </button>
            <a
              href="#"
              onClick={() => this.setState({ error: null })}
              className="press rounded-md border border-hair px-4 py-2 text-sm text-dim hover:text-text"
            >
              Back to start
            </a>
          </div>
        </div>
      </div>
    )
  }
}
