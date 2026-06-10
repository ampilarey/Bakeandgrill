import type { StaffUser } from '@shared/types';
import { req } from './client';

export type { StaffUser };

export async function pinLogin(username: string, pin: string): Promise<{ token: string; user: StaffUser }> {
  return req('/auth/staff/pin-login', {
    method: 'POST',
    body: JSON.stringify({ username, pin, intent: 'admin' }),
    anonymous: true,
  });
}

export async function phoneLogin(phone: string, password: string): Promise<{ token: string; user: StaffUser }> {
  return req('/auth/staff/login', {
    method: 'POST',
    body: JSON.stringify({ phone, password }),
    anonymous: true,
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

export async function getMe(): Promise<{ user: StaffUser }> {
  return req('/auth/me');
}

export async function updateMyPreferences(data: {
  pos_idle_lock_minutes: number;
}): Promise<{ message: string; user: StaffUser }> {
  return req('/auth/me/preferences', { method: 'PATCH', body: JSON.stringify(data) });
}

export async function logout(): Promise<void> {
  await req('/auth/logout', { method: 'POST' });
}
