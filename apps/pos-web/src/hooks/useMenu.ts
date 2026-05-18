import { useEffect, useRef, useState } from "react";
import { fetchCategories, fetchItems } from "../api";
import type { PosSalesChannel } from "../api";
import type { Category, Item } from "../types";

const MAX_RETRIES = 3;
const RETRY_BASE_MS = 1500;

/**
 * Mirror of the admin's order-type → sales-channel mapping in
 * `KitchenMenuResolver::channelForOrderType`. Keeps the POS aligned
 * with the same channel constants the backend filters on, so an item
 * the admin marked "Takeaway only" actually disappears when the
 * cashier switches to Dine-in.
 */
function channelForOrderType(orderType: "Dine-in" | "Takeaway" | "Online Pickup"): PosSalesChannel {
  if (orderType === "Dine-in") return "dine_in";
  if (orderType === "Online Pickup") return "online_pickup";
  return "takeaway";
}

export function useMenu(isLoggedIn: boolean, orderType: "Dine-in" | "Takeaway" | "Online Pickup") {
  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [dataError, setDataError] = useState("");
  const attemptRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const channel = channelForOrderType(orderType);

  useEffect(() => {
    if (!isLoggedIn) return;

    attemptRef.current = 0;
    setIsLoading(true);
    setDataError("");

    const load = () => {
      // Categories are channel-agnostic (the API returns the whole tree)
      // — only the items list is filtered. Refetching both keeps the
      // selected category stable when the cashier flips order types.
      Promise.all([fetchCategories(), fetchItems(channel)])
        .then(([cats, its]) => {
          setCategories(cats);
          setItems(its);
          // Start on "All items" instead of the first category so the
          // cashier sees the whole menu by default. The pill row makes
          // it obvious how to narrow down once they know what they're
          // ringing up.
          setSelectedCategoryId(null);
          setIsLoading(false);
        })
        .catch(() => {
          attemptRef.current++;
          if (attemptRef.current < MAX_RETRIES) {
            const delay = RETRY_BASE_MS * 2 ** (attemptRef.current - 1);
            timerRef.current = setTimeout(load, delay);
          } else {
            setDataError("Unable to load menu. Check your connection and try again.");
            setIsLoading(false);
          }
        });
    };

    load();

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [isLoggedIn, channel]);

  return {
    categories,
    items,
    selectedCategoryId,
    setSelectedCategoryId,
    isLoading,
    dataError,
  };
}
