import type { StaffUser } from '@shared/types';
import { req } from './client';

export type { StaffUser };

export async function pinLogin(pin: string): Promise<{ token: string; user: StaffUser }> {
  return req('/auth/staff/pin-login', { method: 'POST', body: JSON.stringify({ pin }) });
}

export async function getMe(): Promise<{ user: StaffUser }> {
  return req('/auth/me');
}

export async function logout(): Promise<void> {
  await req('/auth/logout', { method: 'POST' });
}
