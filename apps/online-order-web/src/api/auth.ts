// ── Customer Authentication ────────────────────────────────────────────────────
import { ENDPOINTS } from '@shared/api';
import type { Customer } from '@shared/types';
import { csrfHeadersForMutation } from '@shared/api';
import { API_ORIGIN, request } from './client';

export type AuthCustomer = Customer & { is_profile_complete: boolean };
export type AuthResponse = {
  customer: AuthCustomer;
  is_new_customer?: boolean;
  message?: string;
};

/** End the API customer session (HttpOnly session cookie). */
export async function logoutCustomerSession(): Promise<void> {
  try {
    await request<void>('/auth/customer/logout', { method: 'POST' });
  } catch {
    /* session may already be gone */
  }
}

/**
 * Invalidate the Blade customer web session so the main site header
 * shows "Login" after sign-out from the order app.
 */
export async function logoutCustomerWebSession(): Promise<void> {
  if (typeof window === 'undefined') return;
  const headers: Record<string, string> = {
    Accept: 'text/html,application/xhtml+xml',
    'X-Requested-With': 'XMLHttpRequest',
    ...(await csrfHeadersForMutation(API_ORIGIN)),
  };
  await fetch(`${API_ORIGIN}/customer/logout`, { method: 'POST', credentials: 'include', headers });
}

export async function checkPhone(phone: string): Promise<{ exists: boolean; has_password: boolean }> {
  return request(ENDPOINTS.CUSTOMER_CHECK_PHONE, { method: 'POST', body: JSON.stringify({ phone }) });
}

export async function passwordLogin(payload: { phone: string; password: string }): Promise<AuthResponse> {
  return request<AuthResponse>(ENDPOINTS.CUSTOMER_PASSWORD_LOGIN, { method: 'POST', body: JSON.stringify(payload) });
}

export async function requestOtp(
  phone: string,
  purpose: 'register' | 'reset_password' = 'register',
  opts?: { channel?: 'sms' | 'email'; email?: string },
): Promise<{ otp?: string; channel?: string }> {
  return request<{ otp?: string; channel?: string }>(ENDPOINTS.CUSTOMER_OTP_REQUEST, {
    method: 'POST',
    body: JSON.stringify({
      phone,
      purpose,
      channel: opts?.channel ?? 'sms',
      email: opts?.email,
    }),
  });
}

export async function verifyOtp(payload: { phone: string; otp: string }): Promise<AuthResponse> {
  return request<AuthResponse>(ENDPOINTS.CUSTOMER_OTP_VERIFY, { method: 'POST', body: JSON.stringify(payload) });
}

/**
 * Probe the shared Laravel customer session (Blade + /order SPA).
 * anonymous: a guest 401 must not fire auth_expired on cold boot.
 */
export async function checkSession(
  options: { anonymous?: boolean } = { anonymous: true },
): Promise<AuthResponse & { authenticated: boolean }> {
  return request(ENDPOINTS.CUSTOMER_SESSION_CHECK, { anonymous: options.anonymous ?? true });
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
  payload: { name: string; email?: string; password: string; password_confirmation: string },
): Promise<{ customer: AuthCustomer }> {
  return request(ENDPOINTS.CUSTOMER_COMPLETE_PROFILE, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateCustomerProfile(
  data: { name?: string; email?: string; date_of_birth?: string | null },
): Promise<{ customer: AuthCustomer }> {
  return request(ENDPOINTS.CUSTOMER_PROFILE, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function changeCustomerPassword(
  data: { current_password: string; new_password: string },
): Promise<void> {
  await request(ENDPOINTS.CUSTOMER_CHANGE_PASSWORD, {
    method: 'POST',
    body: JSON.stringify({
      current_password: data.current_password,
      password: data.new_password,
      password_confirmation: data.new_password,
    }),
  });
}

export async function getCustomerMe(): Promise<{ customer: AuthCustomer; has_trade_account?: boolean }> {
  return request(ENDPOINTS.CUSTOMER_ME);
}

export async function guestSession(payload: { phone: string; name: string }): Promise<AuthResponse> {
  return request<AuthResponse>(ENDPOINTS.CUSTOMER_GUEST_SESSION, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
