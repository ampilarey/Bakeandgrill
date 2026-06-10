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

/**
 * Thrown when the server returns a non-2xx response.
 * Carries the HTTP status so callers can distinguish a real network failure
 * (fetch threw a TypeError) from a server-rejected request.
 */
export class ApiRequestError extends Error {
  public readonly status: number;
  public readonly body?: unknown;
  constructor(message: string, status: number, body?: unknown) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.body = body;
  }
}

export type ApiClient = ReturnType<typeof createApiClient>;

function buildAuthHeaders(
  config: ApiClientConfig,
  options: RequestInit,
  defaults: Record<string, string>,
): HeadersInit {
  const token = config.getToken?.();
  return {
    ...defaults,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };
}

async function throwForFailedResponse(response: Response): Promise<never> {
  if (response.status === 401) {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('auth_expired'));
    }
    throw new ApiRequestError('Session expired. Please log in again.', 401);
  }

  const text = await response.text().catch(() => '');
  let message = 'Request failed';
  let parsedBody: unknown = undefined;
  try {
    const body = JSON.parse(text) as ApiError;
    parsedBody = body;
    message =
      Object.values(body.errors ?? {})[0]?.[0] ??
      body.message ??
      'Request failed';
  } catch {
    message = `Server error (${response.status})`;
  }
  throw new ApiRequestError(message, response.status, parsedBody);
}

/** Trigger a browser download for a Blob (PDF, CSV, XLSX exports). */
export function downloadBlob(blob: Blob, filename: string): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function createApiClient(config: ApiClientConfig) {
  async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const isFormData = options.body instanceof FormData;

    const response = await fetch(`${config.baseUrl}${path}`, {
      credentials: config.credentials ?? 'same-origin',
      ...options,
      headers: buildAuthHeaders(config, options, {
        ...(!isFormData ? { 'Content-Type': 'application/json' } : {}),
        Accept: 'application/json',
      }),
    });

    if (!response.ok) {
      await throwForFailedResponse(response);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return response.json() as Promise<T>;
  }

  async function requestBlob(path: string, options: RequestInit = {}): Promise<Blob> {
    const response = await fetch(`${config.baseUrl}${path}`, {
      credentials: config.credentials ?? 'same-origin',
      ...options,
      headers: buildAuthHeaders(config, options, {}),
    });

    if (!response.ok) {
      await throwForFailedResponse(response);
    }

    return response.blob();
  }

  return { request, requestBlob };
}
