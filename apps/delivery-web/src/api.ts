import { createTokenStore } from '@shared/auth';

/**
 * The driver's bearer token. Key unchanged from when this was inline
 * localStorage — renaming it would sign every driver out on deploy.
 */
export const driverToken = createTokenStore('driver_token');

const BASE =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ??
  (import.meta.env.PROD ? '/api' : 'http://localhost:8000/api');

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const token = driverToken.get();
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401) {
    driverToken.clear();
    // Dispatch a custom event instead of a full-page redirect so the React
    // SPA can handle the transition via state (preserving LocationTracker buffer).
    window.dispatchEvent(new Event('auth_expired'));
    throw new Error('Unauthenticated');
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: 'Server error.' }));
    throw new Error((err as { message?: string }).message ?? 'Server error.');
  }

  // 204 No Content — return null without attempting JSON parse (which would throw).
  if (res.status === 204) return null as T;

  return res.json() as Promise<T>;
}

export const api = {
  pinLogin: (phone: string, pin: string) =>
    request<{ token: string; driver: import('./types').Driver }>('POST', '/auth/driver/pin-login', { phone, pin }),

  logout: () => request<{ message: string }>('POST', '/auth/driver/logout'),

  me: () => request<{ driver: import('./types').Driver }>('GET', '/driver/me'),

  getDeliveries: () =>
    request<{ deliveries: import('./types').Delivery[] }>('GET', '/driver/deliveries'),

  getHistory: (page = 1, date?: string) => {
    // Validate ISO 8601 date format before interpolating into URL (L-15)
    const safeDate = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined;
    return request<{
      deliveries: import('./types').Delivery[];
      meta: { current_page: number; last_page: number; total: number };
    }>('GET', `/driver/deliveries/history?page=${page}${safeDate ? `&date=${safeDate}` : ''}`);
  },

  getDelivery: (id: number) =>
    request<{ delivery: import('./types').Delivery }>('GET', `/driver/deliveries/${id}`),

  updateStatus: (id: number, status: string) =>
    request<{ delivery: { id: number; status: string; picked_up_at: string | null; delivered_at: string | null } }>(
      'PATCH',
      `/driver/deliveries/${id}/status`,
      { status },
    ),

  getStats: () => request<{ stats: import('./types').Stats }>('GET', '/driver/stats'),

  postLocation: (locations: import('./types').DriverLocation[]) =>
    request<{ message: string }>('POST', '/driver/location', { locations }),

  uploadProof: async (orderId: number, file: File) => {
    const token = driverToken.get();
    const form = new FormData();
    form.append('photo', file);
    const res = await fetch(`${BASE}/driver/deliveries/${orderId}/proof`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: form,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: 'Upload failed.' }));
      throw new Error((err as { message?: string }).message ?? 'Upload failed.');
    }
    return res.json() as Promise<{ message: string; proof_url: string }>;
  },
};
