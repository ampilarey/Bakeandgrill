import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { useTableSession, type TableSession } from '../hooks/useTableSession';
import { useOrderMode } from './OrderModeContext';

/*
 * The table a guest scanned, for the whole visit.
 *
 * Owner, 2026-10-12: a scan opened the home page, the guest tapped Menu, and
 * by checkout the table was gone, because only the checkout page read the
 * link. The token is now read the moment the app opens, on any page, and
 * held here. A confirmed table also settles the order mode: someone sitting
 * at table 4 is eating here, so the first Add asks nothing and the menu shows
 * the eat-in dishes, even while eat-here pre-orders are switched off.
 */
export const TableSessionContext = createContext<TableSession | null>(null);

export function TableSessionProvider({ children }: { children: ReactNode }) {
  const session = useTableSession();
  const { mode, setMode } = useOrderMode();

  useEffect(() => {
    if (session.name && mode !== 'dine_in') setMode('dine_in');
    // Only when the table is confirmed; a guest who later clears it keeps
    // whatever mode they picked.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.name]);

  return (
    <TableSessionContext.Provider value={session}>
      {children}
    </TableSessionContext.Provider>
  );
}

/** The scanned table, or null outside the provider. */
export function useTableSessionContext(): TableSession | null {
  return useContext(TableSessionContext);
}

/** The confirmed table's name when the guest is seated, else null. */
export function useSeatedTable(): { name: string | null; error: string } {
  const ctx = useContext(TableSessionContext);

  return { name: ctx?.name ?? null, error: ctx?.error ?? '' };
}
