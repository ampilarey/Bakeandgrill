import { readStored, writeStored } from './tokenStore';

/**
 * The stable identifier a fixed screen gives itself.
 *
 * KDS generated this inline with `crypto.randomUUID()`. That call is only
 * defined in a secure context, so on a kitchen screen reached over plain HTTP
 * — a local IP, an in-house display, anything not on https — it throws while
 * the component is initialising and the app renders nothing at all. The
 * fallback below keeps a device identifiable in that case.
 *
 * The id is generated once and kept. It identifies a screen for the audit
 * trail; it is not a credential and grants nothing on its own.
 */

function randomSuffix(): string {
  const cryptoObj = typeof globalThis !== 'undefined' ? globalThis.crypto : undefined;

  // Each attempt is guarded rather than merely feature-detected. randomUUID is
  // specced as secure-context-only, so it is usually simply absent — but some
  // browsers expose it and throw on use, which a typeof check sails straight
  // past into the same blank screen this is here to prevent.
  if (cryptoObj) {
    try {
      if (typeof cryptoObj.randomUUID === 'function') {
        return cryptoObj.randomUUID().slice(0, 8).toUpperCase();
      }
    } catch {
      /* fall through to getRandomValues */
    }

    // Available in far more contexts than randomUUID.
    try {
      if (typeof cryptoObj.getRandomValues === 'function') {
        const bytes = new Uint8Array(4);
        cryptoObj.getRandomValues(bytes);
        return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
      }
    } catch {
      /* fall through to Math.random */
    }
  }

  // Last resort. Weak, and it does not need to be strong — see above.
  return Math.random().toString(16).slice(2, 10).padStart(8, '0').toUpperCase();
}

/**
 * Read the device id for `key`, creating and storing one on first call.
 *
 * `prefix` is what makes the id legible in the admin device list — "KDS-7F3A9C2B"
 * says which screen at a glance where a bare UUID does not.
 */
export function getOrCreateDeviceId(key: string, prefix: string): string {
  const existing = readStored(key);
  if (existing && existing.length > 0) return existing;

  const id = `${prefix}-${randomSuffix()}`;
  // If storage is unavailable the id is still returned, so the app works for
  // this session rather than failing; it simply will not be remembered.
  writeStored(key, id);
  return id;
}
