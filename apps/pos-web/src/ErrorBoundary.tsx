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
      return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#1F2937', color: '#fff', textAlign: 'center', padding: '2rem' }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.5rem' }}>POS Error</h1>
          <p style={{ color: '#9CA3AF', marginBottom: '1.5rem', maxWidth: 400 }}>
            {this.state.message || 'An unexpected error occurred. Please refresh to restore the POS.'}
          </p>
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
