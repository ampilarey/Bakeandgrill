import { createContext, useContext } from 'react';

/**
 * True while a page is rendered as a tab of a hub (Kitchen, Customers,
 * Finance …). PageShell and PageHeader read it and drop their own chrome —
 * the hub already drew the title — so a page needs no `embedded` prop to
 * move into a hub.
 */
export const HubContext = createContext(false);

export function useInHub(): boolean {
  return useContext(HubContext);
}
