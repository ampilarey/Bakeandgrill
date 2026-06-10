import type { StaffLoginResponse, StaffUser } from "@shared/types";
import { request } from "./client";

export async function staffLogin(
  username: string,
  pin: string,
  deviceIdentifier: string
): Promise<StaffLoginResponse> {
  return request<StaffLoginResponse>("/auth/staff/pin-login", {
    method: "POST",
    body: JSON.stringify({ username, pin, device_identifier: deviceIdentifier }),
  });
}

/**
 * Bug-052: cheap "is my token still good?" ping. Used by the POS
 * shell on visibilitychange to proactively boot the cashier to
 * the lock screen if the Sanctum token expired while the tab was
 * backgrounded — instead of letting them ring up a ticket and
 * fail at charge time. Resolves silently on success; the 401
 * branch in `request()` already dispatches `auth_expired` which
 * App.tsx listens for.
 */
export async function fetchMe(): Promise<StaffUser> {
  const res = await request<{ user: StaffUser }>("/auth/me");
  return res.user;
}

export async function updateMyPreferences(data: {
  pos_idle_lock_minutes: number;
}): Promise<{ message: string; user: StaffUser }> {
  return request("/auth/me/preferences", {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function pingAuth(): Promise<void> {
  await fetchMe();
}

export async function selfRegisterDevice(identifier: string, name: string): Promise<{ status: string; device?: { id: number } }> {
  return request<{ status: string; device?: { id: number } }>("/devices/self-register", {
    method: "POST",
    body: JSON.stringify({ identifier, name, type: "pos" }),
  });
}

export async function selfDeviceStatus(identifier: string): Promise<{ status: string; is_active?: boolean; id?: number }> {
  return request<{ status: string; is_active?: boolean; id?: number }>(`/devices/self-status?identifier=${encodeURIComponent(identifier)}`);
}
