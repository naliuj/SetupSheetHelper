import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

/** Catches a render/lifecycle crash anywhere below it.
 *
 *  Without one, React unmounts the whole tree on an uncaught error and leaves a blank white
 *  window — indistinguishable, to the person looking at it, from the app having lost their work.
 *  This at least says what happened, reassures them their data is on disk, and offers a reload,
 *  which recovers from anything that was transient.
 *
 *  It cannot catch errors from event handlers, timers, or rejected promises — React only routes
 *  render-phase errors here. Those are covered separately: the save path reports through
 *  saveError, and main writes uncaught exceptions to its log file. */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Goes to the devtools console in development, and to main's log file in a packaged build
    // via the console forwarding set up in main/log.ts.
    console.error('[renderer] uncaught error:', error, info.componentStack)
  }

  render(): ReactNode {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div className="page" style={{ maxWidth: '70ch', margin: '10vh auto', textAlign: 'left' }}>
        <h2 style={{ marginTop: 0 }}>Something went wrong</h2>
        <p className="card-sub">
          Setup Sheet Helper hit an error it could not recover from. Your setups are saved on disk
          and have not been changed — reloading should bring everything back.
        </p>
        <pre
          style={{
            background: 'var(--color-surface-alt)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius)',
            padding: 12,
            overflowX: 'auto',
            fontSize: 12
          }}
        >
          {error.message}
        </pre>
        <div className="modal-actions">
          <button className="btn primary" onClick={() => window.location.reload()}>
            Reload
          </button>
        </div>
      </div>
    )
  }
}
