import { Component, type ErrorInfo, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'

// Catches render errors from whatever page is currently mounted under
// <Outlet />. Without this, a single throwing component tears down the
// entire tree — nav bar included — leaving the user with a blank screen
// and no way out (see the 2 Aug 2026 Admin-tab report).
//
// Behaviour:
//   * Nav stays alive because the boundary sits INSIDE Layout, not around it.
//   * The offending page renders a compact error card with the actual message
//     + component stack — surfaces WHY it broke without needing devtools.
//   * Reset key = current pathname, so navigating away and back auto-clears.

interface Props {
  resetKey: string
  children: ReactNode
}

interface State {
  error: Error | null
  info: ErrorInfo | null
}

class Inner extends Component<Props, State> {
  state: State = { error: null, info: null }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.setState({ info })
    console.error('[route-error-boundary]', error, info)
  }

  componentDidUpdate(prev: Props) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null, info: null })
    }
  }

  render() {
    if (!this.state.error) return this.props.children
    const err = this.state.error
    return (
      <div className="px-4 pt-6 pb-8">
        <div className="rounded-2xl p-4"
          style={{
            background: 'var(--color-surface)',
            border: '1px solid var(--tt-red, #DC2626)',
            backgroundClip: 'padding-box',
          }}>
          <p className="text-xs font-semibold uppercase tracking-widest mb-2"
            style={{ color: 'var(--tt-red, #DC2626)' }}>
            ⚠️ This tab hit an error
          </p>
          <p className="text-sm mb-3" style={{ color: 'var(--color-text)' }}>
            The page failed to render. Nav still works — tap another tab and
            come back, or hit the button below to retry.
          </p>
          <details style={{ color: 'var(--color-text-muted)' }}>
            <summary className="text-xs cursor-pointer" style={{ color: 'var(--color-text-muted)' }}>
              Error details
            </summary>
            <pre className="mt-2 text-[11px] whitespace-pre-wrap break-words"
              style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-text-muted)' }}>
{err.name}: {err.message}
{this.state.info?.componentStack ?? ''}
            </pre>
          </details>
          <button
            onClick={() => this.setState({ error: null, info: null })}
            className="mt-3 px-3 py-1.5 rounded-lg text-xs font-semibold"
            style={{
              background: 'var(--color-primary)',
              color: 'var(--color-text)',
              border: '1px solid var(--color-primary)',
            }}
          >
            Retry
          </button>
        </div>
      </div>
    )
  }
}

export default function RouteErrorBoundary({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  return <Inner resetKey={pathname}>{children}</Inner>
}
