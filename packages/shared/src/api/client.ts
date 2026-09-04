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

async function throwForFailedResponse(
  response: Response,
  options: { emitAuthExpired?: boolean } = {},
): Promise<never> {
  if (response.status === 401) {
    if (options.emitAuthExpired !== false && typeof window !== 'undefined') {
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

export type ApiRequestOptions = RequestInit & {
  /** Skip bearer token and do not fire auth_expired on 401 (login / password reset). */
  anonymous?: boolean;
  /**
   * Milliseconds before the request is abandoned. Defaults to
   * `DEFAULT_REQUEST_TIMEOUT_MS`. Pass 0 to wait indefinitely — only for work
   * that genuinely has no upper bound, such as a large import.
   */
  timeoutMs?: number;
};

/**
 * How long any one request may hang before we give up on it.
 *
 * Every call in all three apps was a bare `fetch()` with no AbortController,
 * so on a phone with a weak signal a request could sit open for as long as the
 * OS allowed — often a minute or more. Browsers also cap concurrent
 * connections per host at six, so a handful of stalled polls queued everything
 * behind them, including whatever the cashier pressed next.
 *
 * Owner, 2026-09-04: "still it freez after updating and its ok after
 * sometime". That is the shape of it exactly — nothing is broken, the till is
 * waiting on sockets that nobody ever closed, and it comes back when the OS
 * finally drops them.
 *
 * Twenty seconds is far longer than any healthy call here and far shorter than
 * a stalled socket. A timed-out request throws like any other failure, so the
 * existing error handling and offline queues take it from there.
 */
export const DEFAULT_REQUEST_TIMEOUT_MS = 20_000;

/**
 * Run a fetch under a deadline, honouring any caller-supplied signal.
 *
 * `AbortSignal.any` is not available on the older WebKit some tills run, so
 * the caller's signal is chained by hand.
 */
async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  if (!(timeoutMs > 0) || typeof AbortController === 'undefined') {
    return fetch(url, init);
  }

  const controller = new AbortController();
  const onOuterAbort = () => controller.abort();
  const outer = init.signal;
  if (outer) {
    if (outer.aborted) controller.abort();
    else outer.addEventListener('abort', onOuterAbort);
  }

  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (e) {
    // Ours, not the caller's: report it as a timeout rather than a cancel.
    if (
      (e as { name?: string })?.name === 'AbortError'
      && !(outer?.aborted ?? false)
    ) {
      throw new ApiRequestError(
        'The server took too long to answer. Check the connection and try again.',
        0,
      );
    }
    throw e;
  } finally {
    clearTimeout(timer);
    if (outer) outer.removeEventListener('abort', onOuterAbort);
  }
}

export function createApiClient(config: ApiClientConfig) {
  async function request<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
    const { anonymous, timeoutMs, ...fetchOptions } = options;
    const isFormData = fetchOptions.body instanceof FormData;
    const defaultHeaders = {
      ...(!isFormData ? { 'Content-Type': 'application/json' } : {}),
      Accept: 'application/json',
    };

    const response = await fetchWithTimeout(
      `${config.baseUrl}${path}`,
      {
        credentials: config.credentials ?? 'same-origin',
        ...fetchOptions,
        headers: anonymous
          ? { ...defaultHeaders, ...fetchOptions.headers }
          : buildAuthHeaders(config, fetchOptions, defaultHeaders),
      },
      // An upload has no useful deadline — a photo on a slow link legitimately
      // takes a while, and abandoning it halfway helps nobody.
      timeoutMs ?? (isFormData ? 0 : DEFAULT_REQUEST_TIMEOUT_MS),
    );

    if (!response.ok) {
      await throwForFailedResponse(response, { emitAuthExpired: !anonymous });
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return response.json() as Promise<T>;
  }

  async function requestBlob(path: string, options: ApiRequestOptions = {}): Promise<Blob> {
    const { anonymous: _anonymous, timeoutMs, ...fetchOptions } = options;
    // Exports can be large; give them room but never forever.
    const response = await fetchWithTimeout(
      `${config.baseUrl}${path}`,
      {
        credentials: config.credentials ?? 'same-origin',
        ...fetchOptions,
        headers: buildAuthHeaders(config, fetchOptions, {}),
      },
      timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS * 3,
    );

    if (!response.ok) {
      await throwForFailedResponse(response);
    }

    return response.blob();
  }

  return { request, requestBlob };
}
