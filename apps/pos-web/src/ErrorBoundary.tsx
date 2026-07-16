import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = { children: ReactNode };
type State = { hasError: boolean; message: string };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: '' };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[POS ErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      // Don't surface the raw React error message to staff — it leaks
      // internals (stack-y messages like "Cannot read properties of
      // undefined (reading 'x')") that mean nothing to a cashier and
      // make the POS look broken. Keep the technical message in
      // console (via componentDidCatch above) where it's useful for
      // developers, and show staff a recovery-focused message.
      return (
        <div className="pos-app-root" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100dvh', background: '#1F2937', color: '#fff', textAlign: 'center', padding: '2rem' }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.5rem' }}>Something went wrong</h1>
          <p style={{ color: '#9CA3AF', marginBottom: '1.5rem', maxWidth: 400 }}>
            The POS hit an unexpected error. Your current cart was preserved.
            Tap Reload to recover — if the problem repeats, sign out and back in.
          </p>
          {/*
            Tiny details disclosure for support — staff won't open it but
            our support team can ask the manager to expand it and read
            the message out for triage.
          */}
          {this.state.message && (
            <details style={{ color: '#6B7280', marginBottom: '1rem', fontSize: '0.75rem' }}>
              <summary style={{ cursor: 'pointer' }}>Technical details</summary>
              <code style={{ display: 'block', marginTop: 6, wordBreak: 'break-word' }}>{this.state.message}</code>
            </details>
          )}
          <button
            onClick={() => window.location.reload()}
            style={{ background: '#3B82F6', color: '#fff', border: 'none', borderRadius: 8, padding: '0.6rem 1.4rem', fontWeight: 600, cursor: 'pointer', fontSize: '1rem' }}
          >
            Reload POS
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
