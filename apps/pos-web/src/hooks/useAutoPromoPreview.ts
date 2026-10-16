import { useEffect, useRef, useState } from "react";
import { previewAutoPromo, type PromoPreviewLine } from "../api/loyalty";

export type AutoPromo = {
  /** The offer's name, as the Promotions page calls it. */
  name: string;
  promotionId: number | null;
  /** MVR off the cart. */
  discount: number;
  /** ISO time the offer ends, when it has one. */
  endsAt: string | null;
};

const DEBOUNCE_MS = 350;
const POLL_MS = 5 * 60_000;

/**
 * What the automatic offers take off the cart right now, asked of the server
 * as the cart changes (owner, 2026-10-16: show the discount before Charge).
 * Re-asked the moment the offer ends and every few minutes in case one
 * starts. Off for a resumed ticket, whose discount the server already holds.
 */
export function useAutoPromoPreview(opts: {
  lines: PromoPreviewLine[];
  customerId: number | null;
  enabled: boolean;
}): AutoPromo | null {
  const [promo, setPromo] = useState<AutoPromo | null>(null);
  const seq = useRef(0);
  const [tick, setTick] = useState(0);
  const key = opts.enabled && opts.lines.length > 0
    ? JSON.stringify({ l: opts.lines, c: opts.customerId })
    : "";

  useEffect(() => {
    if (!key) {
      seq.current += 1;
      setPromo(null);
      return;
    }
    const mine = ++seq.current;
    const handle = window.setTimeout(() => {
      const parsed = JSON.parse(key) as { l: PromoPreviewLine[]; c: number | null };
      previewAutoPromo({ items: parsed.l, customerId: parsed.c })
        .then((res) => {
          if (mine !== seq.current) return;
          const first = res.promotions[0];
          setPromo(res.discount_laar > 0 && first
            ? { name: first.name, promotionId: first.id, discount: res.discount_laar / 100, endsAt: res.ends_at }
            : null);
        })
        .catch(() => {
          // Not sure means not shown: the saved order is what decides.
          if (mine === seq.current) setPromo(null);
        });
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
  }, [key, tick]);

  // Re-ask when the offer shown ends, and now and then for one that starts.
  useEffect(() => {
    if (!key) return;
    const timers: number[] = [window.setInterval(() => setTick((t) => t + 1), POLL_MS)];
    if (promo?.endsAt) {
      const wait = new Date(promo.endsAt).getTime() - Date.now() + 1000;
      if (wait > 0 && wait < 2_000_000_000) {
        timers.push(window.setTimeout(() => setTick((t) => t + 1), wait));
      }
    }
    return () => timers.forEach((t) => { window.clearInterval(t); window.clearTimeout(t); });
  }, [key, promo?.endsAt]);

  return promo;
}
