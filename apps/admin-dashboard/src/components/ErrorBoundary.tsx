import { Component, type ErrorInfo, type ReactNode } from 'react';
import { isChunkLoadError } from '../utils/lazyWithRetry';

type Props = { children: ReactNode };
type State = { hasError: boolean; message: string; chunkError: boolean };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: '', chunkError: false };

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      message: error.message,
      chunkError: isChunkLoadError(error),
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  hardReload = () => {
    const url = new URL(window.location.href);
    url.searchParams.set('_r', String(Date.now()));
    window.location.replace(url.toString());
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', padding: '2rem', textAlign: 'center' }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.5rem' }}>
            {this.state.chunkError ? 'Page update available' : 'Something went wrong'}
          </h1>
          <p style={{ color: 'var(--color-text-secondary)', marginBottom: '1.5rem', maxWidth: 420 }}>
            {this.state.chunkError
              ? 'The admin app was updated while this tab was open. Reload to fetch the latest version.'
              : (this.state.message || 'An unexpected error occurred. Please refresh the page.')}
          </p>
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
            <button
              onClick={() => this.setState({ hasError: false, message: '', chunkError: false })}
              style={{ background: 'var(--color-warning)', color: '#fff', border: 'none', borderRadius: 8, padding: '0.6rem 1.4rem', fontWeight: 600, cursor: 'pointer' }}
            >
              Try again
            </button>
            <button
              onClick={this.state.chunkError ? this.hardReload : () => window.location.reload()}
              style={{ background: 'transparent', color: 'var(--color-text-secondary)', border: '1px solid #D1D5DB', borderRadius: 8, padding: '0.6rem 1.4rem', fontWeight: 600, cursor: 'pointer' }}
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
