import { useCallback, useEffect, useRef, useState } from "react";
import { fetchPosMenu } from "../api";
import type { PosSalesChannel } from "../api";
import type { Category, Item } from "../types";
import { loadCachedMenu, saveCachedMenu } from "../offline/db";
import { markOfflineBootstrap } from "../offline/offlineGate";

const MAX_RETRIES = 3;
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
function channelForOrderType(orderType: "Dine-in" | "Takeaway" | "Pickup"): PosSalesChannel {
  if (orderType === "Dine-in") return "dine_in";
  if (orderType === "Pickup") return "online_pickup";
  return "takeaway";
}

export function useMenu(
  isLoggedIn: boolean,
  orderType: "Dine-in" | "Takeaway" | "Pickup",
  isReachable = true,
) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [dataError, setDataError] = useState("");
  const [usingCachedMenu, setUsingCachedMenu] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<number | null>(null);
  const attemptRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const channel = channelForOrderType(orderType);

  // Stable refs so the auto-refresh / visibility-change handlers don't
  // need to be re-registered on every channel/login change.
  const channelRef = useRef(channel);
  const loggedInRef = useRef(isLoggedIn);
  useEffect(() => { channelRef.current = channel; }, [channel]);
  useEffect(() => { loggedInRef.current = isLoggedIn; }, [isLoggedIn]);

  /**
   * Internal loader. `mode` distinguishes the cashier's first hit
   * (where we want the big "Loading menu…" panel) from a silent
   * background poll or pull-to-refresh (where we want to keep showing
   * the old items so the cashier never sees an empty grid mid-ticket).
   */
  const load = useCallback(
    async (mode: "initial" | "silent" | "manual" = "initial") => {
      if (!loggedInRef.current) return;
      const ch = channelRef.current;

      let showedCachedMenu = false;

      if (mode === "initial") {
        setDataError("");
        const cached = await loadCachedMenu(ch);
        if (cached?.items?.length) {
          setCategories((cached.categories ?? []) as Category[]);
          setItems((cached.items ?? []) as Item[]);
          setUsingCachedMenu(true);
          setLastRefreshedAt(Date.parse(cached.cached_at));
          setIsLoading(false);
          setIsRefreshing(true);
          showedCachedMenu = true;
        } else {
          setIsLoading(true);
          setDataError("");
        }
      } else if (mode === "manual") {
        setIsRefreshing(true);
      }

      try {
        const menu = await fetchPosMenu(ch);
        const cats = menu.categories;
        const its = menu.items;
        // Defensive: only commit if the channel didn't change mid-flight.
        // Otherwise the cashier flipping order types could see the
        // wrong items pop in for a split second.
        if (ch !== channelRef.current) return;
        setCategories(cats);
        setItems(its);
        setDataError("");
        setUsingCachedMenu(false);
        setLastRefreshedAt(Date.now());
        markOfflineBootstrap();
        void saveCachedMenu(ch, { categories: cats, items: its });
        attemptRef.current = 0;
        if (mode === "initial") {
          // Default the cashier to "All items" rather than the first
          // category so the whole menu is visible at a glance. The
          // pill row makes narrowing obvious. Don't reset on silent
          // refresh — that would clobber the cashier's current
          // category selection.
          setSelectedCategoryId(null);
        }
      } catch (err) {
        if (mode === "initial") {
          attemptRef.current++;
          if (!showedCachedMenu) {
            const cached = await loadCachedMenu(ch);
            if (cached?.items?.length) {
              setCategories((cached.categories ?? []) as Category[]);
              setItems((cached.items ?? []) as Item[]);
              setUsingCachedMenu(true);
              setDataError(isReachable
                ? "Unable to load menu. Check your connection and try again."
                : "Showing cached menu (offline).");
              setLastRefreshedAt(Date.parse(cached.cached_at));
              setIsLoading(false);
              return;
            }
          }
          if (attemptRef.current < MAX_RETRIES) {
            const delay = RETRY_BASE_MS * 2 ** (attemptRef.current - 1);
            timerRef.current = setTimeout(() => void load("initial"), delay);
          } else if (!showedCachedMenu) {
            setDataError("Unable to load menu. Check your connection and try again.");
          }
        }
        // Silent / manual failures are swallowed — keep showing the
        // existing menu instead of breaking a working POS for a
        // transient network blip. The cashier will see the
        // last-refreshed timestamp stop advancing and can hit the
        // manual refresh button to retry.
        if (mode === "manual") {
          const cached = await loadCachedMenu(ch);
          if (cached?.items?.length) {
            setCategories((cached.categories ?? []) as Category[]);
            setItems((cached.items ?? []) as Item[]);
            setUsingCachedMenu(true);
          }
          setDataError("Couldn't reach server. Showing last known menu.");
          // Auto-clear the error after a few seconds so it doesn't
          // hang around once connectivity comes back.
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
    [],
  );

  /** Public refresh handler — for the "↻" button in the menu top bar. */
  const refresh = useCallback(() => {
    void load("manual");
  }, [load]);

  // ── Initial load + channel switches ──────────────────────────────
  useEffect(() => {
    if (!isLoggedIn) return;
    attemptRef.current = 0;
    void load("initial");
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [isLoggedIn, channel, load]);

  // ── Silent background poll ──────────────────────────────────────
  // Refreshes menu data every AUTO_REFRESH_MS so a new item the owner
  // added in admin shows up on the POS within a few minutes without
  // anyone having to think about it. Pauses when the tab is hidden
  // (visibilitychange handler below picks up the slack).
  useEffect(() => {
    if (!isLoggedIn) return;
    const interval = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void load("silent");
    }, AUTO_REFRESH_MS);
    return () => window.clearInterval(interval);
  }, [isLoggedIn, load]);

  // ── Refetch when the tab regains focus ──────────────────────────
  // The most reliable refresh signal: cashier puts the iPad to sleep
  // and comes back. Without this, a menu update made overnight stays
  // invisible until they manually log out and back in.
  useEffect(() => {
    if (!isLoggedIn) return;
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        // Skip if we polled recently (within 30s) to avoid pile-up on
        // rapid tab switching.
        if (lastRefreshedAt && Date.now() - lastRefreshedAt < 30_000) return;
        void load("silent");
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [isLoggedIn, load, lastRefreshedAt]);

  return {
    categories,
    items,
    selectedCategoryId,
    setSelectedCategoryId,
    isLoading,
    isRefreshing,
    dataError,
    refresh,
    lastRefreshedAt,
    usingCachedMenu,
  };
}
