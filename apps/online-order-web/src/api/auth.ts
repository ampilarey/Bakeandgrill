// ── Customer Authentication ────────────────────────────────────────────────────
import { ENDPOINTS } from '@shared/api';
import type { Customer } from '@shared/types';
import { API_BASE_URL, API_ORIGIN, request } from './client';

export type AuthCustomer = Customer & { is_profile_complete: boolean };
export type AuthResponse = { token: string; customer: AuthCustomer; is_new_customer?: boolean };

function readCookie(name: string): string | null {
  const m = document.cookie.split('; ').find((r) => r.startsWith(name + '='));
  if (!m) return null;
  return decodeURIComponent(m.split('=').slice(1).join('='));
}

/**
 * Establish a Blade web session from a Sanctum Bearer token.
 * Call after every React login so the main website header shows "Hi, [phone]".
 */
export async function syncBladeSession(token: string): Promise<void> {
  if (typeof window === 'undefined') return;
  await fetch(`${API_ORIGIN}/customer/sync-session`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
    },
  });
}

/**
 * Revoke the current Sanctum Bearer token.
 * Call before clearing localStorage so the old token stops working immediately.
 */
export async function revokeCustomerToken(token: string): Promise<void> {
  if (!token) return;
  try {
    await fetch(`${API_BASE_URL}/auth/customer/logout`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      },
    });
  } catch {
    /* token may already be gone */
  }
}

/**
 * Invalidate the Blade customer web session so the main site header
 * shows "Login" instead of the phone number after sign-out.
 */
export async function logoutCustomerWebSession(): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    await fetch(`${API_ORIGIN}/sanctum/csrf-cookie`, { method: 'GET', credentials: 'include' });
  } catch { /* cookie may already exist */ }
  const xsrf = readCookie('XSRF-TOKEN');
  const headers: Record<string, string> = {
    Accept: 'text/html,application/xhtml+xml',
    'X-Requested-With': 'XMLHttpRequest',
  };
  if (xsrf) headers['X-XSRF-TOKEN'] = xsrf;
  await fetch(`${API_ORIGIN}/customer/logout`, { method: 'POST', credentials: 'include', headers });
}

export async function checkPhone(phone: string): Promise<{ exists: boolean; has_password: boolean }> {
  return request(ENDPOINTS.CUSTOMER_CHECK_PHONE, { method: 'POST', body: JSON.stringify({ phone }) });
}

export async function passwordLogin(payload: { phone: string; password: string }): Promise<AuthResponse> {
  return request<AuthResponse>(ENDPOINTS.CUSTOMER_PASSWORD_LOGIN, { method: 'POST', body: JSON.stringify(payload) });
}

export async function requestOtp(phone: string, purpose: 'register' | 'reset_password' = 'register'): Promise<{ otp?: string }> {
  return request<{ otp?: string }>(ENDPOINTS.CUSTOMER_OTP_REQUEST, { method: 'POST', body: JSON.stringify({ phone, purpose }) });
}

export async function verifyOtp(payload: { phone: string; otp: string }): Promise<AuthResponse> {
  return request<AuthResponse>(ENDPOINTS.CUSTOMER_OTP_VERIFY, { method: 'POST', body: JSON.stringify(payload) });
}

export async function checkSession(): Promise<AuthResponse & { authenticated: boolean }> {
  return request(ENDPOINTS.CUSTOMER_SESSION_CHECK);
}

export async function forgotPassword(phone: string): Promise<{ otp?: string }> {
  return request(ENDPOINTS.CUSTOMER_FORGOT_PASSWORD, { method: 'POST', body: JSON.stringify({ phone }) });
}

export async function resetPassword(payload: {
  phone: string; otp: string; password: string; password_confirmation: string;
}): Promise<AuthResponse> {
  return request<AuthResponse>(ENDPOINTS.CUSTOMER_RESET_PASSWORD, { method: 'POST', body: JSON.stringify(payload) });
}

export async function completeProfile(
  token: string,
  payload: { name: string; email?: string; password: string; password_confirmation: string },
): Promise<{ customer: AuthCustomer }> {
  return request(ENDPOINTS.CUSTOMER_COMPLETE_PROFILE, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
}

export async function updateCustomerProfile(
  token: string,
  data: { name?: string; email?: string },
): Promise<{ customer: AuthCustomer }> {
  return request(ENDPOINTS.CUSTOMER_PROFILE, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(data),
  });
}

export async function changeCustomerPassword(
  token: string,
  data: { current_password: string; new_password: string },
): Promise<void> {
  await request(ENDPOINTS.CUSTOMER_CHANGE_PASSWORD, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      current_password: data.current_password,
      password: data.new_password,
      password_confirmation: data.new_password,
    }),
  });
}

export async function getCustomerMe(token: string): Promise<{ customer: AuthCustomer }> {
  return request(ENDPOINTS.CUSTOMER_ME, { headers: { Authorization: `Bearer ${token}` } });
}
