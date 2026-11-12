import { request } from "./client";

export type GstBootstrap = {
  default_tax_rate_bp: number;
  tax_rate_percent: number;
  tax_inclusive: boolean;
  gst_registered: boolean;
  currency: string;
  sector?: string;
  /** When true, packaging principal is GST-rated (standard rate). */
  packaging_fee_taxable?: boolean;
};

/**
 * The GST rate the cart previews with; the server still works the order out.
 *
 * Asked fresh each time and failing loudly (owner, 2026-11-12: a cashier saved a
 * ticket and Charge asked for less than the cart showed). It used to be kept
 * for the whole session, so a till open while Charge GST on sales was switched
 * off went on adding 8% to the cart, and a failed request answered a made-up
 * 8% that was then saved as the till's offline copy. The caller keeps its own
 * last good answer for when this throws.
 */
export async function fetchGstBootstrap(): Promise<GstBootstrap> {
  return request<GstBootstrap>("/gst/bootstrap");
}

/**
 * Server-side delivery fee preview — matches DeliveryFeeCalculator.
 * Returns null when the API is unreachable so callers can use a local estimate.
 * fee_mvr === 0 means free delivery (do not treat as failure).
 */
export async function previewDeliveryFeeMvr(
  island: string,
  subtotalLaar: number,
): Promise<number | null> {
  try {
    const params = new URLSearchParams({
      island: island.trim() || "Male",
      subtotal_laar: String(Math.max(0, subtotalLaar)),
    });
    const data = await request<{ fee_mvr: number }>(
      `/ordering/delivery-fee-preview?${params}`,
    );
    return Number.isFinite(data.fee_mvr) ? data.fee_mvr : null;
  } catch {
    return null;
  }
}
