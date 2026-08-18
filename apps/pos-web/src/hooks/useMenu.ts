import { useCallback, useEffect, useRef, useState } from "react";
import { fetchPosBootstrap, fetchPosMenu, type PosDiscountControls, type PosPairings, type PosSmsNotifications } from "../api";
import type { PosBootstrapShift, PosSalesChannel } from "../api";
import type { PosOrderType } from "../orderTypes";
import type { Category, Item } from "../types";
import { loadCachedMenu, saveCachedMenu } from "../offline/db";
import { markOfflineBootstrap } from "../offline/offlineGate";

const MAX_RETRIES = 2;
const RETRY_BASE_MS = 1500;
/**
 * Silent background refetch interval. 5 minutes balances "owner adds
 * a new item and cashier sees it without thinking about it" against
 * server load for a venue running several POS devices. A long-lived
 * tab will refresh ~12 times/hour per device.
 */
const AUTO_REFRESH_MS = 5 * 60 * 1000;

/**
 * Mirror of the admin's order-type → sales-channel mapping in
 * `KitchenMenuResolver::channelForOrderType`. Keeps the POS aligned
 * with the same channel constants the backend filters on, so an item
 * the admin marked "Online pickup only" actually disappears when the
 * cashier switches to Dine-in.
 */
function formatMenuAge(ms: number): string {
  const hours = Math.max(1, Math.floor(ms / 3_600_000));
  if (hours < 48) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

function channelForOrderType(orderType: PosOrderType): PosSalesChannel {
  if (orderType === "Dine-in") return "dine_in";
  if (orderType === "Pickup") return "online_pickup";
  // Staff phone-in delivery uses the in-store menu (takeaway channel),
  // not the online delivery channel — same items a cashier can ring
  // at the counter should be orderable for call-in delivery.
  if (orderType === "Delivery") return "takeaway";
  return "takeaway";
}

export function useMenu(
  isLoggedIn: boolean,
  orderType: PosOrderType,
  isReachable = true,
  onBootstrapShift?: (shift: PosBootstrapShift | null) => void,
  onBootstrapSmsNotifications?: (settings: PosSmsNotifications) => void,
  onBootstrapDiscountControls?: (controls: PosDiscountControls) => void,
) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [pairings, setPairings] = useState<PosPairings>({});
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [dataError, setDataError] = useState("");
  const [usingCachedMenu, setUsingCachedMenu] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<number | null>(null);
  /**
   * FIX 16 — when serving from cache offline and the cache is >24h old,
   * surface a dismissible "menu prices last updated N ago" warning so
   * cashiers know they may be ringing yesterday's price list.
   */
  const [staleMenuWarning, setStaleMenuWarning] = useState<string | null>(null);
  const [dismissedStaleAt, setDismissedStaleAt] = useState<number | null>(null);
  const STALE_MS = 24 * 60 * 60 * 1000;
  const attemptRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bootstrapDoneRef = useRef(false);

  const channel = channelForOrderType(orderType);

  const channelRef = useRef(channel);
  const loggedInRef = useRef(isLoggedIn);
  const reachableRef = useRef(isReachable);
  const onBootstrapShiftRef = useRef(onBootstrapShift);
  const onBootstrapSmsNotificationsRef = useRef(onBootstrapSmsNotifications);
  const onBootstrapDiscountControlsRef = useRef(onBootstrapDiscountControls);
  useEffect(() => { channelRef.current = channel; }, [channel]);
  useEffect(() => { loggedInRef.current = isLoggedIn; }, [isLoggedIn]);
  useEffect(() => { reachableRef.current = isReachable; }, [isReachable]);
  useEffect(() => { onBootstrapShiftRef.current = onBootstrapShift; }, [onBootstrapShift]);
  useEffect(() => { onBootstrapSmsNotificationsRef.current = onBootstrapSmsNotifications; }, [onBootstrapSmsNotifications]);
  useEffect(() => { onBootstrapDiscountControlsRef.current = onBootstrapDiscountControls; }, [onBootstrapDiscountControls]);

  const applyCachedMenu = useCallback((cached: NonNullable<Awaited<ReturnType<typeof loadCachedMenu>>>) => {
    setCategories((cached.categories ?? []) as Category[]);
    setItems((cached.items ?? []) as Item[]);
    // Older caches predate pairings; an empty map just means no chips.
    setPairings((cached.pairings ?? {}) as PosPairings);
    setUsingCachedMenu(true);
    const savedAtMs = Date.parse(cached.cached_at);
    setLastRefreshedAt(savedAtMs);
    // FIX 16 — if the cache we're about to serve is > 24h old and we
    // haven't dismissed a warning since then, flash the stale note.
    if (Number.isFinite(savedAtMs)) {
      const ageMs = Date.now() - savedAtMs;
      if (ageMs > STALE_MS && (dismissedStaleAt == null || dismissedStaleAt < savedAtMs)) {
        setStaleMenuWarning(`Menu prices last updated ${formatMenuAge(ageMs)} ago. Reconnect to refresh.`);
      }
    }
  }, [dismissedStaleAt, STALE_MS]);

  const load = useCallback(
    async (mode: "initial" | "silent" | "manual" = "initial") => {
      if (!loggedInRef.current) return;
      const ch = channelRef.current;

      let showedCachedMenu = false;
      const useBootstrap = mode === "initial" && !bootstrapDoneRef.current;

      if (mode === "initial") {
        setDataError("");
        const cached = await loadCachedMenu(ch);
        if (cached?.items?.length) {
          applyCachedMenu(cached);
          setIsLoading(false);
          setIsRefreshing(true);
          showedCachedMenu = true;
        } else {
          setIsLoading(true);
          setDataError("");
        }

        // Offline with a warm cache — skip a doomed network fetch on login.
        if (showedCachedMenu && !reachableRef.current) {
          setIsRefreshing(false);
          setDataError("Showing cached menu (offline).");
          return;
        }
      } else if (mode === "manual") {
        setIsRefreshing(true);
      } else if (mode === "silent" && !reachableRef.current) {
        return;
      }

      try {
        if (useBootstrap) {
          const boot = await fetchPosBootstrap(ch);
          if (ch !== channelRef.current) return;
          const cats = boot.categories;
          const its = boot.items;
          setCategories(cats);
          setItems(its);
          setPairings(boot.pairings ?? {});
          setDataError("");
          setUsingCachedMenu(false);
          setStaleMenuWarning(null);
          setLastRefreshedAt(Date.now());
          markOfflineBootstrap();
          void saveCachedMenu(ch, { categories: cats, items: its, pairings: boot.pairings ?? {} });
          attemptRef.current = 0;
          bootstrapDoneRef.current = true;
          onBootstrapShiftRef.current?.(boot.shift ?? null);
          onBootstrapSmsNotificationsRef.current?.(boot.smsNotifications);
          onBootstrapDiscountControlsRef.current?.(boot.discountControls);
          setSelectedCategoryId(null);
        } else {
          const menu = await fetchPosMenu(ch);
          const cats = menu.categories;
          const its = menu.items;
          if (ch !== channelRef.current) return;
          setCategories(cats);
          setItems(its);
          setPairings(menu.pairings ?? {});
          setDataError("");
          setUsingCachedMenu(false);
          setStaleMenuWarning(null);
          setLastRefreshedAt(Date.now());
          markOfflineBootstrap();
          void saveCachedMenu(ch, { categories: cats, items: its, pairings: menu.pairings ?? {} });
          attemptRef.current = 0;
          if (mode === "initial") {
            setSelectedCategoryId(null);
          }
        }
      } catch (err) {
        if (mode === "initial") {
          attemptRef.current++;
          if (!showedCachedMenu) {
            const cached = await loadCachedMenu(ch);
            if (cached?.items?.length) {
              applyCachedMenu(cached);
              setDataError(reachableRef.current
                ? "Unable to load menu. Check your connection and try again."
                : "Showing cached menu (offline).");
              setIsLoading(false);
              return;
            }
          }
          if (attemptRef.current < MAX_RETRIES && reachableRef.current) {
            const delay = RETRY_BASE_MS * 2 ** (attemptRef.current - 1);
            timerRef.current = setTimeout(() => void load("initial"), delay);
          } else if (!showedCachedMenu) {
            setDataError("Unable to load menu. Check your connection and try again.");
          }
        }
        if (mode === "manual") {
          const cached = await loadCachedMenu(ch);
          if (cached?.items?.length) {
            applyCachedMenu(cached);
          }
          setDataError("Couldn't reach server. Showing last known menu.");
          setTimeout(() => setDataError(""), 4000);
        }
        void err;
      } finally {
        if (mode === "initial") {
          setIsLoading(false);
          setIsRefreshing(false);
        }
        if (mode === "manual") setIsRefreshing(false);
      }
    },
    [applyCachedMenu],
  );

  const refresh = useCallback(() => {
    void load("manual");
  }, [load]);

  useEffect(() => {
    if (!isLoggedIn) {
      bootstrapDoneRef.current = false;
      return;
    }
    attemptRef.current = 0;
    void load("initial");
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [isLoggedIn, channel, load]);

  useEffect(() => {
    if (!isLoggedIn) return;
    const interval = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void load("silent");
    }, AUTO_REFRESH_MS);
    return () => window.clearInterval(interval);
  }, [isLoggedIn, load]);

  useEffect(() => {
    if (!isLoggedIn) return;
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        if (lastRefreshedAt && Date.now() - lastRefreshedAt < 30_000) return;
        void load("silent");
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [isLoggedIn, load, lastRefreshedAt]);

  const dismissStaleMenuWarning = useCallback(() => {
    setStaleMenuWarning(null);
    setDismissedStaleAt(Date.now());
  }, []);

  return {
    categories,
    items,
    pairings,
    selectedCategoryId,
    setSelectedCategoryId,
    isLoading,
    isRefreshing,
    dataError,
    refresh,
    lastRefreshedAt,
    usingCachedMenu,
    /** FIX 16 — dismissible "menu prices last updated N ago" note. */
    staleMenuWarning,
    dismissStaleMenuWarning,
  };
}
