// ── Shared API client factory ─────────────────────────────────────────────────
// Each app creates its own instance with its own token storage key and base URL.

type ApiClientConfig = {
  /** Base URL for all API calls, e.g. "/api" or "http://localhost:8000/api" */
  baseUrl: string;
  /**
   * Optional function that returns the current auth token.
   * Called on every request so the token is always fresh.
   */
  getToken?: () => string | null;
  /**
   * Controls whether cookies are sent with requests.
   * Set to 'include' for the online-order app to support unified session auth
   * (customer logs in on either the Blade site or React app, stays logged in on both).
   * Defaults to 'same-origin'.
   */
  credentials?: RequestCredentials;
};

type ApiError = { message?: string; errors?: Record<string, string[]> };

export type ApiClient = ReturnType<typeof createApiClient>;

export function createApiClient(config: ApiClientConfig) {
  async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const token = config.getToken?.();
    // Don't set Content-Type for FormData — browser must set it with the multipart boundary
    const isFormData = options.body instanceof FormData;

    const response = await fetch(`${config.baseUrl}${path}`, {
      credentials: config.credentials ?? 'same-origin',
      ...options,
      headers: {
        ...(!isFormData ? { 'Content-Type': 'application/json' } : {}),
        Accept: 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        // Caller-supplied headers override defaults (including auth if needed)
        ...options.headers,
      },
    });

    if (!response.ok) {
      // Token expired or revoked — notify the app so it can redirect to login
      if (response.status === 401) {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('auth_expired'));
        }
        throw new Error('Session expired. Please log in again.');
      }

      const text = await response.text().catch(() => '');
      let message = 'Request failed';
      try {
        const body = JSON.parse(text) as ApiError;
        // Prefer the first field-level error (e.g. "Invalid OTP code. 4 attempts remaining.")
        // over the generic Laravel validation message ("The given data was invalid.").
        message =
          Object.values(body.errors ?? {})[0]?.[0] ??
          body.message ??
          'Request failed';
      } catch {
        message = `Server error (${response.status})`;
      }
      throw new Error(message);
    }

    // 204 No Content
    if (response.status === 204) {
      return undefined as T;
    }

    return response.json() as Promise<T>;
  }

  return { request };
}
