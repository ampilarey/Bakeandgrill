const BASE =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ??
  (import.meta.env.PROD ? '/api' : 'http://localhost:8000/api');

function getToken(): string | null {
  return localStorage.getItem('driver_token');
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const token = getToken();
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
    localStorage.removeItem('driver_token');
    window.location.href = '/driver/login';
    throw new Error('Unauthenticated');
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: 'Server error.' }));
    throw new Error((err as { message?: string }).message ?? 'Server error.');
  }

  return res.json() as Promise<T>;
}

export const api = {
  pinLogin: (phone: string, pin: string) =>
    request<{ token: string; driver: import('./types').Driver }>('POST', '/auth/driver/pin-login', { phone, pin }),

  logout: () => request<{ message: string }>('POST', '/auth/driver/logout'),

  me: () => request<{ driver: import('./types').Driver }>('GET', '/driver/me'),

  getDeliveries: () =>
    request<{ deliveries: import('./types').Delivery[] }>('GET', '/driver/deliveries'),

  getHistory: (page = 1, date?: string) =>
    request<{
      deliveries: import('./types').Delivery[];
      meta: { current_page: number; last_page: number; total: number };
    }>('GET', `/driver/deliveries/history?page=${page}${date ? `&date=${date}` : ''}`),

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
};
