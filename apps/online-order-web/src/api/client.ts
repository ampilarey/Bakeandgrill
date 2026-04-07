// ── Shared API client instance ─────────────────────────────────────────────────
// Single source of truth for the base URL and the `request` helper.
// All domain slices import from here — never create a second client.

import { createApiClient } from '@shared/api';

export const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ??
  (import.meta.env.PROD ? '/api' : 'http://localhost:8000/api');

/** Base URL for images/assets (same origin as API, without /api suffix). */
export const API_ORIGIN =
  API_BASE_URL.replace(/\/api\/?$/, '') ||
  (import.meta.env.PROD ? '' : 'http://localhost:8000');

// credentials: 'include' enables Sanctum SPA cookie auth and session detection.
const client = createApiClient({ baseUrl: API_BASE_URL, credentials: 'include' });
export const { request } = client;
