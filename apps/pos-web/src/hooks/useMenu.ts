import { useEffect, useState } from "react";
import { fetchCategories, fetchItems } from "../api";
import type { Category, Item } from "../types";

const fallbackCategories: Category[] = [
  { id: 1, name: "Food" },
  { id: 2, name: "Drinks" },
  { id: 3, name: "Dessert" },
];

const fallbackItems: Item[] = [
  { id: 101, category_id: 1, name: "Chicken Burger",  base_price: 45, barcode: "FOOD-001",
    modifiers: [{ id: 1001, name: "Extra Cheese", price: 5 }, { id: 1002, name: "No Onion", price: 0 }] },
  { id: 102, category_id: 1, name: "French Fries",    base_price: 20, barcode: "FOOD-002" },
  { id: 201, category_id: 2, name: "Iced Coffee",     base_price: 25, barcode: "DRINK-001",
    modifiers: [{ id: 2001, name: "Less Sugar", price: 0 }, { id: 2002, name: "Extra Cream", price: 3 }] },
  { id: 301, category_id: 3, name: "Cheesecake Slice", base_price: 30, barcode: "DESSERT-001" },
];

export function useMenu(isLoggedIn: boolean) {
  const [categories, setCategories] = useState<Category[]>(fallbackCategories);
  const [items, setItems] = useState<Item[]>(fallbackItems);
  const [selectedCategoryId, setSelectedCategoryId] = useState(fallbackCategories[0].id);
  const [isLoading, setIsLoading] = useState(false);
  const [dataError, setDataError] = useState("");

  useEffect(() => {
    if (!isLoggedIn) return;

    setIsLoading(true);
    setDataError("");

    Promise.all([fetchCategories(), fetchItems()])
      .then(([cats, its]) => {
        const categoriesData = cats.length > 0 ? cats : fallbackCategories;
        const itemsData = its.length > 0 ? its : fallbackItems;
        setCategories(categoriesData);
        setItems(itemsData);
        setSelectedCategoryId(categoriesData[0]?.id ?? fallbackCategories[0].id);
      })
      .catch(() => {
        setDataError("Unable to load menu. Using offline cache.");
        setCategories(fallbackCategories);
        setItems(fallbackItems);
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
    fallbackItems,
  };
}
