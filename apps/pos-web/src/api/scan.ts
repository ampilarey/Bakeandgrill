import { request } from "./client";
import type { PosCustomer } from "./customers";
import type { Item, Variant } from "../types";

/**
 * What the server made of a scanned code. One shape for the gun, the camera
 * and the search box, so the till routes them all the same way.
 */
export type ScanResolution =
  | { kind: "item"; item: Item; variant: Variant | null; weight_grams: number | null }
  | { kind: "gift_card"; code: string }
  | { kind: "promotion"; code: string; name: string; valid: boolean }
  | { kind: "customer"; customer: PosCustomer }
  | { kind: "unknown"; code: string };

/** A code the till wants the rewards drawer to apply, from a scan. */
export type ScanRequest = { kind: "promo" | "gift"; code: string; nonce: number };

const GIFT_CARD = /\bGC-\d{6,8}-\d{4}\b/i;

/**
 * Tidy a raw scan before it goes anywhere: trim, and pull a gift card code
 * out of a link so a QR that opens the card's page still applies the card.
 */
export function normalizeScannedCode(raw: string): string {
  const trimmed = raw.trim();
  const gift = trimmed.match(GIFT_CARD);
  if (gift) return gift[0].toUpperCase();
  return trimmed;
}

/** Whether typed text is a code for the scan router rather than a menu search. */
export function looksLikeScanCode(text: string): boolean {
  const t = text.trim();
  if (t.length < 4 || /\s/.test(t)) return false;
  return /^(GC|DC)-/i.test(t) || /^BG-?C/i.test(t) || /^[A-Z0-9][A-Z0-9\-_]{5,}$/.test(t);
}

export async function resolveScan(code: string): Promise<ScanResolution> {
  return request<ScanResolution>(`/pos/scan?code=${encodeURIComponent(code)}`);
}
