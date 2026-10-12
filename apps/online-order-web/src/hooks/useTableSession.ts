import { useEffect, useState } from "react";
import { lookupTableByQr } from "../api/orders";

/**
 * "I scanned the QR on my table."
 *
 * The token arrives once, in the URL the QR encodes, and has to survive the
 * rest of the visit: the customer browses the menu, logs in, and reaches
 * checkout minutes later, by which time the query string is long gone. So it
 * is kept in sessionStorage — the tab, not the device, because a table is a
 * sitting rather than a preference, and the next person to pick up the phone
 * should not inherit table 4.
 *
 * The name is confirmed with the server before anything is shown. A QR that
 * has been rotated, or belongs to a table taken out of service, must say so
 * on the menu screen rather than at the end of an order.
 *
 * Runs once for the whole app, in `TableSessionProvider` (owner, 2026-10-12:
 * a scan landed on the home page, and by checkout the table was gone because
 * only the checkout page read the link). `useCheckout` reads the provider and
 * falls back to its own copy only where no provider is mounted (tests).
 */
const KEY = "bg_table_token";

export type TableSession = {
  token: string | null;
  name: string | null;
  /** True while the token is being checked, so nothing flashes the wrong state. */
  checking: boolean;
  /** Set when the token is not in use — the customer needs to ask staff. */
  error: string;
  clear: () => void;
};

function readStored(): string | null {
  try {
    const value = sessionStorage.getItem(KEY);

    return value && value.length === 24 ? value : null;
  } catch {
    // Private mode, or storage disabled. Ordering still works, just not
    // scoped to the table.
    return null;
  }
}

export function useTableSession(opts: { skip?: boolean } = {}): TableSession {
  const skip = opts.skip === true;
  const [token, setToken] = useState<string | null>(null);
  const [name, setName] = useState<string | null>(null);
  const [checking, setChecking] = useState(!skip);
  const [error, setError] = useState("");

  useEffect(() => {
    if (skip) return;
    let cancelled = false;

    // A token in the URL wins over a stored one: scanning a different table
    // is how somebody moves seats.
    const fromUrl = new URLSearchParams(window.location.search).get("table");
    const candidate = (fromUrl && fromUrl.length === 24 ? fromUrl : null) ?? readStored();

    if (!candidate) {
      setChecking(false);

      return;
    }

    void (async () => {
      try {
        const res = await lookupTableByQr(candidate);
        if (cancelled) return;
        setToken(candidate);
        setName(res.table.name);
        try { sessionStorage.setItem(KEY, candidate); } catch { /* storage disabled */ }
      } catch {
        if (cancelled) return;
        // Say so now, on the menu, rather than at the end of an order.
        setError("That table code is not in use. Ask a member of staff.");
        setToken(null);
        setName(null);
        try { sessionStorage.removeItem(KEY); } catch { /* storage disabled */ }
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();

    return () => { cancelled = true; };
  }, [skip]);

  const clear = () => {
    setToken(null);
    setName(null);
    setError("");
    try { sessionStorage.removeItem(KEY); } catch { /* storage disabled */ }
  };

  return { token, name, checking, error, clear };
}
