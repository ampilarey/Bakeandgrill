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
  checkNow: () => Promise<boolean>;
  dismissBanner: () => void;
  applyUpdate: () => Promise<{ ok: boolean; message?: string }>;
};

async function fetchServerVersion(): Promise<PosVersionInfo | null> {
  try {
    const res = await fetch(`${VERSION_URL}?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as PosVersionInfo;
  } catch {
    return null;
  }
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
  const updateSWRef = useRef<((reloadPage?: boolean) => Promise<void>) | null>(null);
  const reloadScheduledRef = useRef(false);

  const versionMismatch =
    serverBuild !== null && isNewerPosBuild(serverBuild, localBuild);

  const updateAvailable = versionMismatch || swWaiting;
  const updateBlocked = isPosUpdateBlocked(blockers);

  const showBannerIfNeeded = useCallback(
    (server: PosVersionInfo | null, sw: boolean) => {
      const mismatch = server !== null && isNewerPosBuild(server, localBuild);
      const available = mismatch || sw;
      if (!available) {
        setBannerVisible(false);
        return;
      }
      const buildKey = server?.build ?? (sw ? "sw-waiting" : "");
      if (dismissedBuildRef.current && dismissedBuildRef.current === buildKey) {
        return;
      }
      setBannerVisible(true);
    },
    [localBuild],
  );

  const checkNow = useCallback(async (): Promise<boolean> => {
    setChecking(true);
    try {
      const server = await fetchServerVersion();
      setServerBuild(server);
      setLastCheckedAt(new Date().toISOString());
      const mismatch = server !== null && isNewerPosBuild(server, localBuild);
      const available = mismatch || swWaiting;
      showBannerIfNeeded(server, swWaiting);
      if ("serviceWorker" in navigator) {
        const reg = await navigator.serviceWorker.getRegistration("/pos/");
        await reg?.update();
      }
      return available;
    } finally {
      setChecking(false);
    }
  }, [localBuild, showBannerIfNeeded, swWaiting]);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    let pollInterval: number | undefined;

    const updateSW = registerSW({
      immediate: true,
      onNeedRefresh() {
        setSwWaiting(true);
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
              setBannerVisible(true);
            }
          });
        });
      },
    });

    updateSWRef.current = updateSW;

    const onControllerChange = () => {
      if (reloadScheduledRef.current) {
        window.location.reload();
      }
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    return () => {
      if (pollInterval !== undefined) window.clearInterval(pollInterval);
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
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
    if (updateAvailable) showBannerIfNeeded(serverBuild, swWaiting);
  }, [updateAvailable, serverBuild, swWaiting, showBannerIfNeeded]);

  const dismissBanner = useCallback(() => {
    const buildKey = serverBuild?.build ?? (swWaiting ? "sw-waiting" : "");
    dismissedBuildRef.current = buildKey || null;
    setBannerVisible(false);
  }, [serverBuild, swWaiting]);

  const applyUpdate = useCallback(async (): Promise<{ ok: boolean; message?: string }> => {
    if (updateBlocked) {
      return {
        ok: false,
        message: "Finish the current order or payment before updating.",
      };
    }
    setApplying(true);
    reloadScheduledRef.current = true;
    try {
      if (updateSWRef.current) {
        await updateSWRef.current(true);
        return { ok: true };
      }
      // No service worker (first install / unsupported) — cache-bust reload.
      const url = new URL(window.location.href);
      url.searchParams.set("_u", Date.now().toString(36));
      window.location.replace(url.toString());
      return { ok: true };
    } catch {
      reloadScheduledRef.current = false;
      return { ok: false, message: "Update failed — try again from the menu." };
    } finally {
      setApplying(false);
    }
  }, [updateBlocked]);

  return {
    localBuild,
    serverBuild,
    updateAvailable,
    swWaiting,
    bannerVisible: bannerVisible && updateAvailable,
    updateBlocked,
    checking,
    applying,
    lastCheckedAt,
    checkNow,
    dismissBanner,
    applyUpdate,
  };
}
