import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@shared/styles/fonts.css';
import { refreshDhivehiFont } from '@shared/utils/dhivehiFont';
import './index.css';
import App from './App';

// A changed Dhivehi font shows on the next visit, past every cache.
void refreshDhivehiFont();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
