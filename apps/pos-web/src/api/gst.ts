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

let _gstBootstrapCache: GstBootstrap | null = null;

/** Authoritative GST rate for cart preview — server still calculates on order create. */
export async function fetchGstBootstrap(): Promise<GstBootstrap> {
  if (_gstBootstrapCache) return _gstBootstrapCache;
  try {
    const data = await request<GstBootstrap>("/gst/bootstrap");
    _gstBootstrapCache = data;
    return data;
  } catch {
    return {
      default_tax_rate_bp: 800,
      tax_rate_percent: 8,
      tax_inclusive: false,
      gst_registered: false,
      currency: "MVR",
      packaging_fee_taxable: true,
    };
  }
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
