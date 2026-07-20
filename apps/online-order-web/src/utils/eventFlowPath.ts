/**
 * Paths where the immediate-order cart chrome (FAB / sheet offset) must not appear.
 * Event wizard and quote are a separate cart — mixing the two confuses customers.
 */
export function isEventFlowPath(pathname: string): boolean {
  const p = pathname.replace(/\/+$/, '') || '/';
  return (
    p === '/events'
    || p.startsWith('/events/')
    || p === '/pre-order'
    || p.startsWith('/quote/')
  );
}
