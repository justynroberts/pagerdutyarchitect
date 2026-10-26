import { Component, type ReactNode } from 'react'

/**
 * If drawing the app ever fails, say so instead of leaving a blank page: what went wrong, and a reload.
 * Saved diagrams are untouched; they live in the browser and the diagrams folder.
 */
export class Crash extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error) {
    console.error('PagerDuty Architect could not draw the page:', error)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <div className="crash" role="alert">
        <h1>Something went wrong drawing the page</h1>
        <p>Your diagrams are safe. Reload to try again; if it happens again, send the details below.</p>
        <pre>{`${error.name}: ${error.message}\n${(error.stack ?? '').split('\n').slice(1, 6).join('\n')}`}</pre>
        <div className="crash__actions">
          <button className="btn btn--primary" onClick={() => location.reload()}>
            Reload
          </button>
          <button className="btn" onClick={() => navigator.clipboard?.writeText(`${error.name}: ${error.message}\n${error.stack ?? ''}`)}>
            Copy details
          </button>
        </div>
      </div>
    )
  }
}
