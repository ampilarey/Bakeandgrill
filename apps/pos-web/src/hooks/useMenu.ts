import { useEffect, useRef, useState } from "react";
import { fetchCategories, fetchItems } from "../api";
import type { Category, Item } from "../types";

const MAX_RETRIES = 3;
const RETRY_BASE_MS = 1500;

export function useMenu(isLoggedIn: boolean) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [dataError, setDataError] = useState("");
  const attemptRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isLoggedIn) return;

    attemptRef.current = 0;
    setIsLoading(true);
    setDataError("");

    const load = () => {
      Promise.all([fetchCategories(), fetchItems()])
        .then(([cats, its]) => {
          setCategories(cats);
          setItems(its);
          setSelectedCategoryId(cats[0]?.id ?? null);
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
  }, [isLoggedIn]);

  return {
    categories,
    items,
    selectedCategoryId,
    setSelectedCategoryId,
    isLoading,
    dataError,
  };
}
