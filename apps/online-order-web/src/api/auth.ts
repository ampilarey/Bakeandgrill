// ── Customer Authentication ────────────────────────────────────────────────────
import { ENDPOINTS } from '@shared/api';
import type { Customer } from '@shared/types';
import { csrfHeadersForMutation } from '@shared/api';
import { API_ORIGIN, request } from './client';

export type AuthCustomer = Customer & {
  is_profile_complete: boolean;
  email_verified?: boolean;
  /** A guest checkout number nobody has checked with a code yet (backend GuestNumbers). */
  phone_unverified?: boolean;
  /** Account → Messages: each kind by SMS and email (iruali import plan, feature 5). */
  message_choices?: Record<'orders' | 'delivery' | 'offers' | 'security', { sms: boolean; email: boolean; locked: boolean }>;
  /** Google, Facebook and Apple sign-ins linked to the account (iruali import plan, feature 1). */
  social_accounts?: SocialAccount[];
};

export type SocialAccount = { provider: 'google' | 'facebook' | 'apple'; label: string; email: string | null };
export type SocialSignIn = {
  providers: { provider: 'google' | 'facebook' | 'apple'; label: string }[];
  /** A sign-in waiting for the phone to finish it. */
  pending: { provider: string; label: string; name: string | null; email: string | null } | null;
};

/** Which social sign-in buttons to show, and a sign-in waiting for the phone. */
export async function getSocialSignIn(): Promise<SocialSignIn> {
  return request('/auth/customer/social');
}

export async function unlinkSocialAccount(provider: string): Promise<{ social_accounts: SocialAccount[] }> {
  return request(`/customer/social/${provider}`, { method: 'DELETE' });
}

/** The browser page that starts a social sign-in and comes back to `returnTo`. */
export function socialSignInUrl(provider: string, returnTo: string): string {
  return `/auth/social/${provider}?return=${encodeURIComponent(returnTo)}`;
}
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

/**
 * What the server says after sending a code. `email_hint` (texted codes only)
 * is the masked address on the account, when it has one; `sent_to` is the
 * masked address an emailed code went to. Never the full address.
 */
export type OtpSendResult = {
  otp?: string;
  channel?: 'sms' | 'email';
  email_hint?: string;
  sent_to?: string;
  /** The same texted code was also emailed here (masked). */
  also_emailed_to?: string;
};

/** Without `email`, an emailed code goes to the address already on the account. */
export async function requestOtp(
  phone: string,
  purpose: 'register' | 'reset_password' = 'register',
  opts?: { channel?: 'sms' | 'email'; email?: string },
): Promise<OtpSendResult> {
  return request<OtpSendResult>(ENDPOINTS.CUSTOMER_OTP_REQUEST, {
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

export async function forgotPassword(phone: string): Promise<OtpSendResult> {
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
  data: { name?: string; email?: string; date_of_birth?: string | null; sms_opt_out?: boolean; preferred_language?: 'en' | 'dv'; message_choices?: Record<string, { sms?: boolean; email?: boolean }> },
): Promise<{ customer: AuthCustomer }> {
  return request(ENDPOINTS.CUSTOMER_PROFILE, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

/** Send a 6-digit code to the account's email (iruali import plan, feature 2). */
export async function sendEmailCheckCode(): Promise<{ email_verified: boolean; sent_to?: string; message: string }> {
  return request('/customer/email/send-code', { method: 'POST' });
}

/** Prove the account's email with the code that was sent to it. */
export async function verifyEmailCheckCode(code: string): Promise<{ email_verified: boolean; message: string }> {
  return request('/customer/email/verify', { method: 'POST', body: JSON.stringify({ code }) });
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

/** A guest's number: unverified or not, and the orders and points waiting on it. */
export async function getPhoneStatus(): Promise<{ phone: string; unverified: boolean; held_orders: number; held_points: number }> {
  return request('/customer/phone');
}

/** Text a code to the number on the account (never by email: only a text proves a phone). */
export async function sendPhoneCode(): Promise<{ unverified: boolean; sent_to?: string; message: string }> {
  return request('/customer/phone/send-code', { method: 'POST' });
}

export async function verifyPhoneCode(code: string): Promise<{ unverified: boolean; points_added: number; message: string }> {
  return request('/customer/phone/verify', { method: 'POST', body: JSON.stringify({ code }) });
}

/** Whether the checkout offers guest checkout (Admin → Settings → Ordering → Features). */
export async function getGuestRules(): Promise<{ guest_checkout: boolean }> {
  return request('/auth/customer/guest-rules');
}

export async function guestSession(payload: { phone: string; name: string }): Promise<AuthResponse> {
  return request<AuthResponse>(ENDPOINTS.CUSTOMER_GUEST_SESSION, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
