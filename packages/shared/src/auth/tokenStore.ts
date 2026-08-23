/**
 * Where a staff app keeps its bearer token.
 *
 * There were three hand-rolled copies of this — KDS, delivery and POS each
 * reaching into localStorage directly — and three copies of security code
 * drift. This is one implementation, parameterised by the storage key rather
 * than by the principal, because the *key* is the only thing that genuinely
 * differs between them. The principals themselves are different token types,
 * not variants of one.
 *
 * Keys are passed in and never derived, so migrating an app cannot silently
 * rename its key and sign every device out on deploy.
 *
 * Every access is guarded. Direct localStorage calls throw outright in a
 * private window and in browsers set to block site data, which on a kiosk or
 * a driver's phone means a white screen rather than a login form.
 */

export type TokenStore = {
  /** The stored token, or null when absent or unreadable. */
  get(): string | null;
  /** Store a token. Silently does nothing where storage is unavailable. */
  set(token: string): void;
  /** Forget the token. */
  clear(): void;
  /** The storage key, exposed for tests and for migration checks. */
  readonly key: string;
};

/** Safe read — never throws, whatever the browser thinks of storage. */
export function readStored(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Safe write — returns whether it stuck, for callers that care. */
export function writeStored(key: string, value: string): boolean {
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

/** Safe delete. */
export function clearStored(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* nothing to do — it was never readable either */
  }
}

export function createTokenStore(key: string): TokenStore {
  return {
    key,
    get: () => {
      const value = readStored(key);
      // An empty string is not a token. Storing one used to leave the app
      // sending `Authorization: Bearer ` and getting a confusing 401.
      return value && value.length > 0 ? value : null;
    },
    set: (token: string) => {
      if (token) writeStored(key, token);
    },
    clear: () => clearStored(key),
  };
}
