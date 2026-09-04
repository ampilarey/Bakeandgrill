import { useCallback, useEffect, useRef, useState } from "react";
import { registerSW } from "virtual:pwa-register";
import { POS_BUILD_INFO } from "../posBuildInfo";
import { purgePosCachesAndReload, softReloadPos } from "../posHardReload";
import {
  isNewerPosBuild,
  isPosUpdateBlocked,
  type PosUpdateBlockers,
  type PosVersionInfo,
} from "../posUpdateSafety";

const VERSION_URL = "/pos-version.json";
const POLL_MS = 3 * 60 * 1000;

export type ManualUpdateResult =
  | "current"
  | "available"
  | "blocked"
  | "applying";

export type PosAppUpdateState = {
  localBuild: PosVersionInfo;
  serverBuild: PosVersionInfo | null;
  updateAvailable: boolean;
  swWaiting: boolean;
  bannerVisible: boolean;
  updateBlocked: boolean;
  checking: boolean;
  applying: boolean;
  lastCheckedAt: string | null;
  checkNow: (opts?: { force?: boolean }) => Promise<boolean>;
  requestManualUpdate: () => Promise<ManualUpdateResult>;
  dismissBanner: () => void;
  applyUpdate: () => Promise<{ ok: boolean; message?: string }>;
};

async function fetchServerVersion(): Promise<PosVersionInfo | null> {
  try {
    const res = await fetch(`${VERSION_URL}?t=${Date.now()}`, {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    return (await res.json()) as PosVersionInfo;
  } catch {
    return null;
  }
}

export function usePosAppUpdate(blockers: PosUpdateBlockers, enabled = true): PosAppUpdateState {
  const localBuild = POS_BUILD_INFO as PosVersionInfo;
  const [serverBuild, setServerBuild] = useState<PosVersionInfo | null>(null);
  const [swWaiting, setSwWaiting] = useState(false);
  const [bannerVisible, setBannerVisible] = useState(false);
  const [checking, setChecking] = useState(false);
  const [applying, setApplying] = useState(false);
  const [lastCheckedAt, setLastCheckedAt] = useState<string | null>(null);
  const dismissedBuildRef = useRef<string | null>(null);
  const [stickyBanner, setStickyBanner] = useState(false);
  const applyingRef = useRef(false);

  const versionMismatch =
    serverBuild !== null && isNewerPosBuild(serverBuild, localBuild);

  const updateAvailable = versionMismatch || swWaiting;
  const updateBlocked = isPosUpdateBlocked(blockers);

  const markUpdateAvailable = useCallback(
    (server: PosVersionInfo | null, sw: boolean, force = false) => {
      const mismatch = server !== null && isNewerPosBuild(server, localBuild);
      const available = mismatch || sw;
      const key = server?.build ?? (sw ? "sw-waiting" : "");
      if (!available) {
        if (!applyingRef.current) {
          setStickyBanner(false);
          setBannerVisible(false);
        }
        return false;
      }
      if (force) {
        dismissedBuildRef.current = null;
        setStickyBanner(true);
      }
      if (!force && dismissedBuildRef.current && dismissedBuildRef.current === key) {
        return true;
      }
      setStickyBanner(true);
      setBannerVisible(true);
      return true;
    },
    [localBuild],
  );

  const readSwWaiting = useCallback(async (checkSw = false): Promise<boolean> => {
    if (!("serviceWorker" in navigator)) return swWaiting;
    const reg = await navigator.serviceWorker.getRegistration("/pos/");
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
      const mismatch = server !== null && isNewerPosBuild(server, localBuild);
      const available = mismatch || sw;
      if (available) markUpdateAvailable(server, sw, force);
      else if (!stickyBanner && !applyingRef.current) setBannerVisible(false);

      setLastCheckedAt(new Date().toISOString());
      return available;
    } finally {
      setChecking(false);
    }
  }, [enabled, localBuild, markUpdateAvailable, readSwWaiting, stickyBanner]);

  useEffect(() => {
    if (!enabled) return;
    if (!("serviceWorker" in navigator)) return;

    let pollInterval: number | undefined;

    registerSW({
      immediate: true,
      onNeedRefresh() {
        setSwWaiting(true);
        setStickyBanner(true);
        setBannerVisible(true);
      },
      onRegistered(registration) {
        if (!registration) return;
        pollInterval = window.setInterval(() => {
          void registration.update();
        }, POLL_MS);
        registration.addEventListener("updatefound", () => {
          const installing = registration.installing;
          if (!installing) return;
          installing.addEventListener("statechange", () => {
            if (installing.state === "installed" && navigator.serviceWorker.controller) {
              setSwWaiting(true);
              setStickyBanner(true);
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
    const interval = window.setInterval(() => void checkNow(), POLL_MS);
    return () => {
      window.clearTimeout(handle);
      window.clearInterval(interval);
    };
  }, [enabled, checkNow]);

  useEffect(() => {
    if (!enabled) return;
    const onVisible = () => {
      if (document.visibilityState === "visible") void checkNow();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [enabled, checkNow]);

  useEffect(() => {
    if (updateAvailable) markUpdateAvailable(serverBuild, swWaiting);
  }, [updateAvailable, serverBuild, swWaiting, markUpdateAvailable]);

  const dismissBanner = useCallback(() => {
    const key = serverBuild?.build ?? (swWaiting ? "sw-waiting" : "");
    dismissedBuildRef.current = key || null;
    setStickyBanner(false);
    setBannerVisible(false);
  }, [serverBuild, swWaiting]);

  /**
   * Reload onto the newest build.
   *
   * Only tears the caches down when there is genuinely something newer to
   * fetch — a version mismatch, or a service worker sitting in `waiting`.
   * Otherwise it is a plain reload onto the bundle already installed.
   *
   * Owner, 2026-09-04: "after each time when I update **or when I click update
   * app even though there is no new update** … get stuck for about 30
   * seconds". The purge used to run every time, so tapping Update on an
   * up-to-date till threw away the whole bundle and every photo and pulled it
   * all back over the phone connection for no reason at all.
   */
  const runHardReload = useCallback(async (): Promise<void> => {
    applyingRef.current = true;
    setApplying(true);
    if (!versionMismatch && !swWaiting) {
      softReloadPos();
      return;
    }
    await purgePosCachesAndReload();
  }, [versionMismatch, swWaiting]);

  const applyUpdate = useCallback(async (): Promise<{ ok: boolean; message?: string }> => {
    if (updateBlocked) {
      return {
        ok: false,
        message: "Finish the current order or payment before updating.",
      };
    }

    try {
      await runHardReload();
      return { ok: true };
    } catch {
      return { ok: false, message: "Update failed — try Update app from the menu." };
    }
  }, [updateBlocked, runHardReload]);

  const requestManualUpdate = useCallback(async (): Promise<ManualUpdateResult> => {
    await checkNow({ force: true });
    if (updateBlocked) return "blocked";
    try {
      await runHardReload();
      return "applying";
    } catch {
      return "available";
    }
  }, [checkNow, updateBlocked, runHardReload]);

  return {
    localBuild,
    serverBuild,
    updateAvailable,
    swWaiting,
    bannerVisible: bannerVisible && (updateAvailable || stickyBanner),
    updateBlocked,
    checking,
    applying,
    lastCheckedAt,
    checkNow,
    requestManualUpdate,
    dismissBanner,
    applyUpdate,
  };
};
