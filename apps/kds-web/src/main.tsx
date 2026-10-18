import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './ErrorBoundary';
import '@shared/styles/fonts.css';
import { refreshDhivehiFont } from '@shared/utils/dhivehiFont';
import './index.css';

// A changed Dhivehi font shows on the next visit, past every cache.
void refreshDhivehiFont();

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Root element #root not found in DOM');
ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
