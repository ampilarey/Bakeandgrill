import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = { children: ReactNode; inline?: boolean };
type State = { hasError: boolean };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (import.meta.env.DEV) {
      console.error('[ErrorBoundary]', error, info.componentStack);
    }
  }

  render() {
    if (this.state.hasError) {
      const { inline } = this.props;
      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: inline ? '40vh' : '60vh',
            padding: '2rem',
            textAlign: 'center',
            fontFamily: "'Plus Jakarta Sans', sans-serif",
          }}
        >
          <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>😔</div>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-dark)', marginBottom: '0.5rem' }}>
            Something went wrong
          </h1>
          <p style={{ color: 'var(--color-text-muted)', marginBottom: '1.5rem', maxWidth: 360, fontSize: '0.9rem', lineHeight: 1.5 }}>
            This page encountered an unexpected error.
          </p>
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={() => this.setState({ hasError: false })}
              style={{
                background: 'var(--color-primary)',
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                padding: '0.6rem 1.4rem',
                fontWeight: 600,
                cursor: 'pointer',
                minHeight: 44,
              }}
            >
              Try again
            </button>
            {inline && (
              <a
                href="/order"
                style={{
                  background: 'transparent',
                  color: 'var(--color-text-muted)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 8,
                  padding: '0.6rem 1.4rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  textDecoration: 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  minHeight: 44,
                }}
              >
                Go to menu
              </a>
            )}
            <button
              onClick={() => window.location.reload()}
              style={{
                background: 'transparent',
                color: 'var(--color-text-muted)',
                border: '1px solid var(--color-border)',
                borderRadius: 8,
                padding: '0.6rem 1.4rem',
                fontWeight: 600,
                cursor: 'pointer',
                minHeight: 44,
              }}
            >
              Reload page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
