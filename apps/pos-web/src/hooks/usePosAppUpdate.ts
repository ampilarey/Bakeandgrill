import { useCallback, useEffect, useRef, useState } from "react";
import { registerSW } from "virtual:pwa-register";
import { POS_BUILD_INFO } from "../posBuildInfo";
import {
  isNewerPosBuild,
  isPosUpdateBlocked,
  type PosUpdateBlockers,
  type PosVersionInfo,
} from "../posUpdateSafety";

const VERSION_URL = "/pos-version.json";
const POLL_MS = 3 * 60 * 1000;
const RELOAD_FALLBACK_MS = 800;

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

/**
 * Reload the POS shell. MUST NOT await service-worker activation first —
 * on iPad standalone PWAs `updateSW(true)` often never resolves, which
 * blocked every "Update Now" tap in production.
 */
function hardReloadPosApp(
  updateSW: ((reloadPage?: boolean) => Promise<void>) | null,
): void {
  if (updateSW) {
    void Promise.race([
      updateSW(true),
      new Promise<void>((resolve) => window.setTimeout(resolve, 400)),
    ]).catch(() => undefined);
  }

  if ("serviceWorker" in navigator) {
    void navigator.serviceWorker.getRegistration("/pos/").then((reg) => {
      reg?.waiting?.postMessage({ type: "SKIP_WAITING" });
    });
  }

  const target = new URL("/pos/", window.location.origin);
  target.searchParams.set("_u", Date.now().toString(36));
  window.location.assign(target.href);
}

export function usePosAppUpdate(blockers: PosUpdateBlockers): PosAppUpdateState {
  const localBuild = POS_BUILD_INFO as PosVersionInfo;
  const [serverBuild, setServerBuild] = useState<PosVersionInfo | null>(null);
  const [swWaiting, setSwWaiting] = useState(false);
  const [bannerVisible, setBannerVisible] = useState(false);
  const [checking, setChecking] = useState(false);
  const [applying, setApplying] = useState(false);
  const [lastCheckedAt, setLastCheckedAt] = useState<string | null>(null);
  const dismissedBuildRef = useRef<string | null>(null);
  const [stickyBanner, setStickyBanner] = useState(false);
  const updateSWRef = useRef<((reloadPage?: boolean) => Promise<void>) | null>(null);
  const reloadTimerRef = useRef<number | null>(null);

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
        setStickyBanner(false);
        setBannerVisible(false);
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

  const readSwWaiting = useCallback(async (): Promise<boolean> => {
    if (!("serviceWorker" in navigator)) return swWaiting;
    const reg = await navigator.serviceWorker.getRegistration("/pos/");
    await reg?.update();
    const waiting = Boolean(reg?.waiting);
    if (waiting) setSwWaiting(true);
    return waiting || swWaiting;
  }, [swWaiting]);

  const checkNow = useCallback(async (opts?: { force?: boolean }): Promise<boolean> => {
    const force = opts?.force === true;
    setChecking(true);
    try {
      const server = await fetchServerVersion();
      if (server) setServerBuild(server);

      const sw = await readSwWaiting();
      const mismatch = server !== null && isNewerPosBuild(server, localBuild);
      const available = mismatch || sw;
      if (available) markUpdateAvailable(server, sw, force);
      else if (!stickyBanner) setBannerVisible(false);

      setLastCheckedAt(new Date().toISOString());
      return available;
    } finally {
      setChecking(false);
    }
  }, [localBuild, markUpdateAvailable, readSwWaiting, stickyBanner]);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    let pollInterval: number | undefined;

    const updateSW = registerSW({
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

    updateSWRef.current = updateSW;

    return () => {
      if (pollInterval !== undefined) window.clearInterval(pollInterval);
      if (reloadTimerRef.current !== null) window.clearTimeout(reloadTimerRef.current);
    };
  }, []);

  useEffect(() => {
    void checkNow();
    const interval = window.setInterval(() => void checkNow(), POLL_MS);
    return () => window.clearInterval(interval);
  }, [checkNow]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void checkNow();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [checkNow]);

  useEffect(() => {
    if (updateAvailable) markUpdateAvailable(serverBuild, swWaiting);
  }, [updateAvailable, serverBuild, swWaiting, markUpdateAvailable]);

  const dismissBanner = useCallback(() => {
    const key = serverBuild?.build ?? (swWaiting ? "sw-waiting" : "");
    dismissedBuildRef.current = key || null;
    setStickyBanner(false);
    setBannerVisible(false);
  }, [serverBuild, swWaiting]);

  const applyUpdate = useCallback(async (): Promise<{ ok: boolean; message?: string }> => {
    if (updateBlocked) {
      return {
        ok: false,
        message: "Finish the current order or payment before updating.",
      };
    }

    const server = await fetchServerVersion();
    if (server) setServerBuild(server);
    const sw = await readSwWaiting();

    const hasUpdate =
      (server !== null && isNewerPosBuild(server, localBuild)) || sw;

    if (!hasUpdate) {
      dismissBanner();
      return { ok: false, message: "Already on the latest POS version." };
    }

    setApplying(true);
    hardReloadPosApp(updateSWRef.current);
    reloadTimerRef.current = window.setTimeout(() => {
      hardReloadPosApp(updateSWRef.current);
    }, RELOAD_FALLBACK_MS);

    return { ok: true };
  }, [updateBlocked, localBuild, readSwWaiting, dismissBanner]);

  const requestManualUpdate = useCallback(async (): Promise<ManualUpdateResult> => {
    const available = await checkNow({ force: true });
    if (!available) return "current";
    if (updateBlocked) return "blocked";
    setApplying(true);
    hardReloadPosApp(updateSWRef.current);
    return "applying";
  }, [checkNow, updateBlocked]);

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
}
