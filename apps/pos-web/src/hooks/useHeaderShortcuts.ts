import { useCallback, useEffect, useState } from "react";
import type { Pane } from "../app/types";

const STORAGE_KEY = "pos-header-shortcuts";

/**
 * How many shortcuts fit beside the title before the header starts fighting
 * the status pill for room. Four is what a phone in portrait can carry without
 * the title truncating; an iPad has space to spare either way.
 */
export const MAX_HEADER_SHORTCUTS = 4;

/** Panes a shortcut may point at — every destination the drawer can reach. */
const PANES: readonly Pane[] = [
  "sales", "receipts", "shift", "open_tickets", "events", "shift_history",
  "sales_report", "ops", "expenses", "my_requests", "buying_list", "to_receive",
  "kitchen_receiving", "wholesale_dispatch", "wholesale_reconcile",
];

export function isPane(id: string): id is Pane {
  return (PANES as readonly string[]).includes(id);
}

function read(): Pane[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((id): id is string => typeof id === "string")
      .filter(isPane)
      .slice(0, MAX_HEADER_SHORTCUTS);
  } catch {
    // Private browsing, cleared storage, someone else's junk under the key —
    // an unreadable preference is no shortcuts, never a broken header.
    return [];
  }
}

/**
 * The cashier's own header shortcuts, kept on the device.
 *
 * Per-device rather than per-user on purpose: which shortcuts earn their place
 * depends on what the till in front of you is for. The counter iPad wants
 * Receipts and Active Orders; the one in the kitchen passage wants Kitchen
 * receive. Tying them to a login would make each cashier re-pin them on every
 * machine they touch.
 */
export function useHeaderShortcuts() {
  const [shortcuts, setShortcuts] = useState<Pane[]>(read);

  // Another tab on the same device — rare on a till, but a second POS window
  // left open should not quietly disagree about the header.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setShortcuts(read());
    };
    window.addEventListener("storage", onStorage);

    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const persist = useCallback((next: Pane[]) => {
    setShortcuts(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Storage full or blocked: the shortcuts still work for this session,
      // they just will not survive a reload. Not worth an error at the till.
    }
  }, []);

  const add = useCallback((pane: Pane) => {
    setShortcuts((current) => {
      if (current.includes(pane) || current.length >= MAX_HEADER_SHORTCUTS) return current;
      const next = [...current, pane];
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch { /* see persist */ }

      return next;
    });
  }, []);

  const remove = useCallback((pane: Pane) => {
    setShortcuts((current) => {
      const next = current.filter((p) => p !== pane);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch { /* see persist */ }

      return next;
    });
  }, []);

  const isFull = shortcuts.length >= MAX_HEADER_SHORTCUTS;

  return { shortcuts, add, remove, isFull, persist };
}
