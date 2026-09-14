import { useCallback, useEffect, useRef, useState } from 'react';
import { registerSW } from 'virtual:pwa-register';
import { ADMIN_BUILD_INFO } from '../adminBuildInfo';
import { purgeAdminCachesAndReload, softReloadAdmin } from '../adminHardReload';
import { isNewerAdminBuild, type AdminVersionInfo } from '../adminUpdateSafety';

/*
 * Knowing when a newer admin is on the server, and getting onto it.
 *
 * Owner, 2026-09-14: "enhance the mobile pwa for admin … admin app update
 * option etc. Same as pos." A phone with the admin on its home screen holds
 * the bundle it installed; without this it kept the old one until somebody
 * thought to clear Safari. This is the POS's update hook with the till's
 * blockers taken out — an admin screen has no half-taken payment to protect,
 * so an update is never refused, only offered.
 */

const VERSION_URL = '/admin/admin-version.json';
const POLL_MS = 3 * 60 * 1000;

export type ManualUpdateResult = 'current' | 'available' | 'applying';

export type AdminAppUpdateState = {
  localBuild: AdminVersionInfo;
  serverBuild: AdminVersionInfo | null;
  updateAvailable: boolean;
  bannerVisible: boolean;
  checking: boolean;
  applying: boolean;
  lastCheckedAt: string | null;
  /** Ask the server what it has. Resolves true when something newer is there. */
  checkNow: (opts?: { force?: boolean }) => Promise<boolean>;
  /** Check, then reload — hard when there is something newer, plain when not. */
  requestManualUpdate: () => Promise<ManualUpdateResult>;
  dismissBanner: () => void;
  applyUpdate: () => Promise<{ ok: boolean; message?: string }>;
  /** Throw away every cache and start again — the last resort for a stuck app. */
  hardReset: () => Promise<void>;
};

async function fetchServerVersion(): Promise<AdminVersionInfo | null> {
  try {
    const res = await fetch(`${VERSION_URL}?t=${Date.now()}`, {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;
    return (await res.json()) as AdminVersionInfo;
  } catch {
    return null;
  }
}

export function useAdminAppUpdate(enabled = true): AdminAppUpdateState {
  const localBuild = ADMIN_BUILD_INFO as AdminVersionInfo;
  const [serverBuild, setServerBuild] = useState<AdminVersionInfo | null>(null);
  const [swWaiting, setSwWaiting] = useState(false);
  const [bannerVisible, setBannerVisible] = useState(false);
  const [checking, setChecking] = useState(false);
  const [applying, setApplying] = useState(false);
  const [lastCheckedAt, setLastCheckedAt] = useState<string | null>(null);
  const dismissedBuildRef = useRef<string | null>(null);
  const applyingRef = useRef(false);

  const versionMismatch = serverBuild !== null && isNewerAdminBuild(serverBuild, localBuild);
  const updateAvailable = versionMismatch || swWaiting;

  const readSwWaiting = useCallback(async (checkSw = false): Promise<boolean> => {
    if (!('serviceWorker' in navigator)) return swWaiting;
    const reg = await navigator.serviceWorker.getRegistration('/admin/');
    if (checkSw) await reg?.update();
    const waiting = Boolean(reg?.waiting);
    if (waiting) setSwWaiting(true);
    return waiting || swWaiting;
  }, [swWaiting]);

  const checkNow = useCallback(async (opts?: { force?: boolean }): Promise<boolean> => {
    if (!enabled) return false;
    const force = opts?.force === true;
    setChecking(true);
    try {
      const server = await fetchServerVersion();
      if (server) setServerBuild(server);
      const sw = await readSwWaiting(force);
      const available = (server !== null && isNewerAdminBuild(server, localBuild)) || sw;
      if (available) {
        const key = server?.build ?? (sw ? 'sw-waiting' : '');
        if (force) dismissedBuildRef.current = null;
        if (dismissedBuildRef.current !== key || force) setBannerVisible(true);
      } else if (!applyingRef.current) {
        setBannerVisible(false);
      }
      setLastCheckedAt(new Date().toISOString());
      return available;
    } finally {
      setChecking(false);
    }
  }, [enabled, localBuild, readSwWaiting]);

  useEffect(() => {
    if (!enabled) return;
    if (!('serviceWorker' in navigator)) return;

    let pollInterval: number | undefined;

    registerSW({
      immediate: true,
      onNeedRefresh() {
        setSwWaiting(true);
        setBannerVisible(true);
      },
      onRegistered(registration) {
        if (!registration) return;
        pollInterval = window.setInterval(() => { void registration.update(); }, POLL_MS);
        registration.addEventListener('updatefound', () => {
          const installing = registration.installing;
          if (!installing) return;
          installing.addEventListener('statechange', () => {
            if (installing.state === 'installed' && navigator.serviceWorker.controller) {
              setSwWaiting(true);
              setBannerVisible(true);
            }
          });
        });
      },
    });

    return () => {
      if (pollInterval !== undefined) window.clearInterval(pollInterval);
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    const handle = window.setTimeout(() => { void checkNow(); }, 12_000);
    const interval = window.setInterval(() => { void checkNow(); }, POLL_MS);
    return () => {
      window.clearTimeout(handle);
      window.clearInterval(interval);
    };
  }, [enabled, checkNow]);

  useEffect(() => {
    if (!enabled) return;
    const onVisible = () => {
      if (document.visibilityState === 'visible') void checkNow();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [enabled, checkNow]);

  const dismissBanner = useCallback(() => {
    dismissedBuildRef.current = serverBuild?.build ?? (swWaiting ? 'sw-waiting' : null);
    setBannerVisible(false);
  }, [serverBuild, swWaiting]);

  /*
   * Only tear the caches down when there is genuinely something newer —
   * otherwise tapping Update on an up-to-date app throws the whole bundle away
   * and pulls it back over the phone connection for nothing (the POS learned
   * this the hard way, 2026-09-04).
   */
  const runReload = useCallback(async (): Promise<void> => {
    applyingRef.current = true;
    setApplying(true);
    if (!versionMismatch && !swWaiting) {
      softReloadAdmin();
      return;
    }
    await purgeAdminCachesAndReload();
  }, [versionMismatch, swWaiting]);

  const applyUpdate = useCallback(async (): Promise<{ ok: boolean; message?: string }> => {
    try {
      await runReload();
      return { ok: true };
    } catch {
      return { ok: false, message: 'Update failed — close the app from the home screen and reopen it.' };
    }
  }, [runReload]);

  const requestManualUpdate = useCallback(async (): Promise<ManualUpdateResult> => {
    const available = await checkNow({ force: true });
    try {
      await runReload();
      return 'applying';
    } catch {
      return available ? 'available' : 'current';
    }
  }, [checkNow, runReload]);

  const hardReset = useCallback(async (): Promise<void> => {
    applyingRef.current = true;
    setApplying(true);
    await purgeAdminCachesAndReload();
  }, []);

  return {
    localBuild,
    serverBuild,
    updateAvailable,
    bannerVisible: bannerVisible && updateAvailable,
    checking,
    applying,
    lastCheckedAt,
    checkNow,
    requestManualUpdate,
    dismissBanner,
    applyUpdate,
    hardReset,
  };
}
