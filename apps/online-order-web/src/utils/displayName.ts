const PHONE_ONLY = /^\+?[\d\s-]+$/;

/**
 * The first name on an account, for a greeting. Null for an empty value and
 * for the phone digits sign-in stores as the display name, so nobody is
 * greeted "Hi, 7009995" (UI audit, 2026-10-10).
 */
export function firstName(value: string | null | undefined): string | null {
  const v = (value ?? '').trim();
  if (v === '' || PHONE_ONLY.test(v)) return null;
  return v.split(/\s+/)[0] ?? null;
}
