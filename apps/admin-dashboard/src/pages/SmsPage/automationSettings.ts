/**
 * Whether a staff-SMS automation toggle is ON.
 *
 * `undefined` is never treated as enabled — that is the unknown / unloaded
 * state. After a *successful* settings fetch, callers should seed absent keys
 * to `'1'` so they match `StaffNotificationDispatcher::isEventEnabled`, which
 * defaults missing SiteSetting rows to on.
 */
export function isAutomationEnabled(value: string | undefined): boolean {
  return value === '1' || value === 'true';
}
