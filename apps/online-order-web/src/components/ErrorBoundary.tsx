import { Component, type ErrorInfo, type ReactNode } from 'react';
import { translate as t } from '../context/LanguageContext';
import { reloadBoard } from '../lib/signageBoard';

type Props = {
  children: ReactNode;
  inline?: boolean;
  /**
   * `signage`: a TV has nobody to press a button, so after a crash the
   * board restarts itself (signage audit, 2026-09-23). A board that keeps
   * crashing waits longer between restarts rather than flickering.
   */
  variant?: 'signage';
};
type State = { hasError: boolean };

/** How long a crashed board shows its notice before restarting. */
export const SIGNAGE_RESTART_MS = 10_000;
/** A second crash within this window is a loop — back off to a minute. */
export const SIGNAGE_CRASH_LOOP_MS = 120_000;
const CRASH_STAMP_KEY = 'bg_signage_crash_at';

export function signageRestartDelay(now = Date.now(), storage: Storage | null = safeSession()): number {
  let last = 0;
  try {
    last = Number(storage?.getItem(CRASH_STAMP_KEY) ?? 0) || 0;
    storage?.setItem(CRASH_STAMP_KEY, String(now));
  } catch {
    /* private mode / quota */
  }
  return last > 0 && now - last < SIGNAGE_CRASH_LOOP_MS ? 60_000 : SIGNAGE_RESTART_MS;
}

function safeSession(): Storage | null {
  try {
    return typeof sessionStorage !== 'undefined' ? sessionStorage : null;
  } catch {
    return null;
  }
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };
  private restartTimer: number | null = null;

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (import.meta.env.DEV) {
      console.error('[ErrorBoundary]', error, info.componentStack);
    }
    if (this.props.variant === 'signage' && this.restartTimer === null) {
      this.restartTimer = window.setTimeout(() => { void reloadBoard(); }, signageRestartDelay());
    }
  }

  componentWillUnmount() {
    if (this.restartTimer !== null) window.clearTimeout(this.restartTimer);
  }

  render() {
    if (this.state.hasError) {
      const { inline, variant } = this.props;
      if (variant === 'signage') {
        return (
          <div
            data-testid="signage-crash"
            style={{
              position: 'fixed',
              inset: 0,
              background: '#0d0a07',
              color: '#c4b5a5',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: 'var(--font-ui)',
              fontSize: '2.4vmin',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
            }}
          >
            Restarting the board…
          </div>
        );
      }
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
            fontFamily: "var(--font-ui)",
          }}
        >
          <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>😔</div>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-dark)', marginBottom: '0.5rem' }}>
            {t('error.generic_title')}
          </h1>
          <p style={{ color: 'var(--color-text-muted)', marginBottom: '1.5rem', maxWidth: 360, fontSize: '0.9rem', lineHeight: 1.5 }}>
            {t('error.generic_body')}
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
              {t('common.try_again')}
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
                {t('error.go_menu')}
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
              {t('error.reload')}
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
