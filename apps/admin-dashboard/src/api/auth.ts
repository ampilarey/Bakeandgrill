import type { StaffUser } from '@shared/types';
import { req } from './client';

export type { StaffUser };

/**
 * An admin sign-in either finishes, or stops and asks for the second factor.
 *
 * Nothing is signed in while `two_factor_required` is set — the challenge is
 * an opaque handle to a half-finished login, not a session.
 */
export type LoginResult =
  | { user: StaffUser; two_factor_required?: undefined }
  | { two_factor_required: true; challenge: string; message?: string };

export function needsTwoFactor(
  result: LoginResult,
): result is { two_factor_required: true; challenge: string; message?: string } {
  return result.two_factor_required === true;
}

export async function pinLogin(username: string, pin: string): Promise<LoginResult> {
  return req('/auth/staff/pin-login', {
    method: 'POST',
    body: JSON.stringify({ username, pin, intent: 'admin' }),
    anonymous: true,
  });
}

export async function phoneLogin(phone: string, password: string): Promise<LoginResult> {
  return req('/auth/staff/login', {
    method: 'POST',
    body: JSON.stringify({ phone, password }),
    anonymous: true,
  });
}

/**
 * Second step: the code from the authenticator app, or a recovery code.
 *
 * `recovery_code_used` comes back when they got in with a recovery code, which
 * means the phone is gone and they need to enrol a new one.
 */
export async function twoFactorChallenge(
  challenge: string,
  code: string,
): Promise<{
  user: StaffUser;
  message: string;
  recovery_code_used?: boolean;
  recovery_codes_remaining?: number;
}> {
  return req('/auth/staff/two-factor-challenge', {
    method: 'POST',
    body: JSON.stringify({ challenge, code }),
    anonymous: true,
  });
}

// ── Managing your own second factor (My Account) ─────────────────────────────

export type TwoFactorStatus = {
  enabled: boolean;
  /** A setup someone started and abandoned — offer to resume rather than restart. */
  pending: boolean;
  confirmed_at: string | null;
  recovery_codes_remaining: number;
  required_for_admin: boolean;
};

export async function getTwoFactorStatus(): Promise<TwoFactorStatus> {
  return req('/auth/two-factor');
}

/** Returns the QR payload and the same secret in typeable form. */
export async function setupTwoFactor(): Promise<{ uri: string; secret: string }> {
  return req('/auth/two-factor/setup', { method: 'POST' });
}

/** Recovery codes come back exactly once — they are stored hashed. */
export async function confirmTwoFactor(
  code: string,
): Promise<{ message: string; recovery_codes: string[] }> {
  return req('/auth/two-factor/confirm', { method: 'POST', body: JSON.stringify({ code }) });
}

export async function disableTwoFactor(password: string): Promise<{ message: string }> {
  return req('/auth/two-factor', { method: 'DELETE', body: JSON.stringify({ password }) });
}

export async function regenerateRecoveryCodes(
  password: string,
): Promise<{ message: string; recovery_codes: string[] }> {
  return req('/auth/two-factor/recovery-codes', {
    method: 'POST',
    body: JSON.stringify({ password }),
  });
}

export async function staffPasswordResetRequest(phone: string): Promise<{ message: string }> {
  return req('/auth/staff/password/reset-request', {
    method: 'POST',
    body: JSON.stringify({ phone }),
    anonymous: true,
  });
}

export async function staffPasswordResetVerify(
  phone: string,
  otp: string,
  password: string,
  password_confirmation: string,
): Promise<{ message: string }> {
  return req('/auth/staff/password/reset-verify', {
    method: 'POST',
    body: JSON.stringify({ phone, otp, password, password_confirmation }),
    anonymous: true,
  });
}

/** Session probe — anonymous so a cold boot 401 does not fire auth_expired. */
export async function getMe(): Promise<{ user: StaffUser }> {
  return req('/auth/me', { anonymous: true });
}

export async function updateMyPreferences(data: {
  pos_idle_lock_minutes: number;
}): Promise<{ message: string; user: StaffUser }> {
  return req('/auth/me/preferences', { method: 'PATCH', body: JSON.stringify(data) });
}

export async function logout(): Promise<void> {
  await req('/auth/logout', { method: 'POST' });
}

/**
 * Revoke every token this account holds, on every device.
 *
 * Ordinary logout drops only the credential in hand, so a lost phone or a till
 * left signed in stayed valid until its 72h expiry. This is the way to cut
 * those off without waiting.
 */
export async function logoutEverywhere(): Promise<{ message: string; revoked: number }> {
  return req('/auth/logout-everywhere', { method: 'POST' });
}
