import { createContext, useContext } from 'react';
import { ADMIN_BUILD_INFO } from '../adminBuildInfo';
import type { AdminAppUpdateState } from './useAdminAppUpdate';

/**
 * The update state plus "reload data", reachable from the shell's banner and
 * the App panel on My Account without threading props through every page.
 */
export type AppUpdateContextValue = AdminAppUpdateState & {
  /**
   * Fetch everything on the current page again. Owner, 2026-09-14: "data base
   * update option … same as pos" — the POS's Refresh data. Here it remounts
   * the page, which re-runs every load it does, and empties the query cache.
   */
  refreshData: () => void;
  /** How many times data has been reloaded this session — the page key. */
  dataEpoch: number;
};

const noop = async () => false;

/** A do-nothing value so a page renders outside the provider (tests, previews). */
export const IDLE_APP_UPDATE: AppUpdateContextValue = {
  localBuild: ADMIN_BUILD_INFO,
  serverBuild: null,
  updateAvailable: false,
  bannerVisible: false,
  checking: false,
  applying: false,
  lastCheckedAt: null,
  checkNow: noop,
  requestManualUpdate: async () => 'current',
  dismissBanner: () => {},
  applyUpdate: async () => ({ ok: true }),
  hardReset: async () => {},
  refreshData: () => {},
  dataEpoch: 0,
};

export const AppUpdateContext = createContext<AppUpdateContextValue>(IDLE_APP_UPDATE);

export function useAppUpdate(): AppUpdateContextValue {
  return useContext(AppUpdateContext);
}
