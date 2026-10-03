import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './ErrorBoundary';
import { startPosViewportHeight } from './posViewportHeight';
import '@shared/styles/fonts.css';
import './index.css';

// Load Sentry only when a DSN is configured — keeps the cashier first-load
// chunk free of the SDK when monitoring is off (common on till images).
const sentryDsn = import.meta.env.VITE_SENTRY_DSN;
if (sentryDsn) {
  void import('@sentry/react').then((Sentry) => {
    Sentry.init({
      dsn: sentryDsn,
      environment: import.meta.env.MODE,
    });
  });
}

// Before first paint: iOS reports the wrong dvh on a fresh load, which is
// what puts the Charge bar in the wrong place and the taps one row out.
startPosViewportHeight();

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Root element #root not found in DOM');
ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
