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
};

type ApiError = { message?: string; errors?: Record<string, string[]> };

export type ApiClient = ReturnType<typeof createApiClient>;

export function createApiClient(config: ApiClientConfig) {
  async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const token = config.getToken?.();

    const response = await fetch(`${config.baseUrl}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        // Caller-supplied headers override defaults (including auth if needed)
        ...options.headers,
      },
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      let message = 'Request failed';
      try {
        const body = JSON.parse(text) as ApiError;
        message =
          body.message ??
          Object.values(body.errors ?? {})[0]?.[0] ??
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
