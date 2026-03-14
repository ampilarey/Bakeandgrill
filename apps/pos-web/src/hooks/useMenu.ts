import { useEffect, useState } from "react";
import { fetchCategories, fetchItems } from "../api";
import type { Category, Item } from "../types";

export function useMenu(isLoggedIn: boolean) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [dataError, setDataError] = useState("");

  useEffect(() => {
    if (!isLoggedIn) return;

    setIsLoading(true);
    setDataError("");

    Promise.all([fetchCategories(), fetchItems()])
      .then(([cats, its]) => {
        setCategories(cats);
        setItems(its);
        setSelectedCategoryId(cats[0]?.id ?? null);
      })
      .catch(() => {
        setDataError("Unable to load menu. Check your connection and refresh.");
      })
      .finally(() => setIsLoading(false));
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
