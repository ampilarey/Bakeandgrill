const GUEST_PHONE_KEY = 'bakegrill_guest_phone';

export function readGuestPhone(): string {
  try {
    return (localStorage.getItem(GUEST_PHONE_KEY) ?? '').trim();
  } catch {
    return '';
  }
}

export function persistGuestPhone(phone: string): void {
  const trimmed = phone.trim();
  try {
    if (trimmed) localStorage.setItem(GUEST_PHONE_KEY, trimmed);
    else localStorage.removeItem(GUEST_PHONE_KEY);
  } catch { /* private mode */ }
}
