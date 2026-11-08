/** The server's order type for the app's mode, so an offer for some order types is judged (2026-11-08). */
export function promoOrderType(mode: string | null | undefined): string {
  return mode === 'delivery' ? 'delivery' : mode === 'dine_in' ? 'dine_in' : 'online_pickup';
}
