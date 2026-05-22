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
const RELOAD_FALLBACK_MS = 1200;

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

/** Hard navigation — reliable on iPad standalone PWAs when SW skipWaiting alone stalls. */
async function hardReloadPosApp(
  updateSW: ((reloadPage?: boolean) => Promise<void>) | null,
): Promise<void> {
  if ("serviceWorker" in navigator) {
    try {
      const reg = await navigator.serviceWorker.getRegistration("/pos/");
      reg?.waiting?.postMessage({ type: "SKIP_WAITING" });
    } catch {
      // continue to reload
    }
  }

  if (updateSW) {
    try {
      await updateSW(true);
    } catch {
      // fall through — many browsers no-op when no worker is waiting
    }
  }

  const url = new URL(window.location.href);
  url.searchParams.delete("_u");
  url.searchParams.delete("_r");
  url.searchParams.set("_u", Date.now().toString(36));
  window.location.replace(url.toString());
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

  const checkNow = useCallback(async (opts?: { force?: boolean }): Promise<boolean> => {
    const force = opts?.force === true;
    setChecking(true);
    try {
      const server = await fetchServerVersion();
      if (server) setServerBuild(server);

      let sw = swWaiting;
      if ("serviceWorker" in navigator) {
        const reg = await navigator.serviceWorker.getRegistration("/pos/");
        await reg?.update();
        if (reg?.waiting) {
          sw = true;
          setSwWaiting(true);
        }
      }

      const mismatch = server !== null && isNewerPosBuild(server, localBuild);
      const available = mismatch || sw;
      if (available) markUpdateAvailable(server, sw, force);
      else if (!stickyBanner) setBannerVisible(false);

      setLastCheckedAt(new Date().toISOString());
      return available;
    } finally {
      setChecking(false);
    }
  }, [localBuild, markUpdateAvailable, stickyBanner, swWaiting]);

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

    const onControllerChange = () => {
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    return () => {
      if (pollInterval !== undefined) window.clearInterval(pollInterval);
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
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

    const hasUpdate =
      (serverBuild !== null && isNewerPosBuild(serverBuild, localBuild)) || swWaiting;

    if (!hasUpdate) {
      return { ok: false, message: "Already on the latest POS version." };
    }

    setApplying(true);
    try {
      void hardReloadPosApp(updateSWRef.current);
      reloadTimerRef.current = window.setTimeout(() => {
        void hardReloadPosApp(updateSWRef.current);
      }, RELOAD_FALLBACK_MS);
      return { ok: true };
    } catch {
      if (reloadTimerRef.current !== null) {
        window.clearTimeout(reloadTimerRef.current);
      }
      return { ok: false, message: "Update failed — try again from the menu." };
    } finally {
      setApplying(false);
    }
  }, [updateBlocked, serverBuild, localBuild, swWaiting]);

  const requestManualUpdate = useCallback(async (): Promise<ManualUpdateResult> => {
    const available = await checkNow({ force: true });
    if (!available) return "current";
    if (updateBlocked) return "blocked";
    setApplying(true);
    try {
      await hardReloadPosApp(updateSWRef.current);
      return "applying";
    } catch {
      setApplying(false);
      return "available";
    }
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
