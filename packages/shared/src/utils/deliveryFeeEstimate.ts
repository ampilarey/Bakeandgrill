/** Optional overrides — prefer values from site_settings / delivery-fee-preview. */
export type DeliveryFeeEstimateOptions = {
  freeThresholdMvr?: number;
  defaultFeeMvr?: number;
  zoneFeesMvr?: Record<string, number>;
};

const DEFAULT_FREE_THRESHOLD_MVR = 200;
const DEFAULT_FEE_MVR = 30;
const DEFAULT_ZONE_FEES_MVR: Record<string, number> = {
  male: 20,
  hulhumale: 30,
  hulhumalé: 30,
  vilimale: 30,
  maafushi: 50,
};

/** Fallback delivery fee when the preview API is unreachable. */
export function estimateDeliveryFeeLaar(
  island: string,
  subtotalLaar: number,
  options?: DeliveryFeeEstimateOptions,
): number {
  const thresholdMvr = options?.freeThresholdMvr ?? DEFAULT_FREE_THRESHOLD_MVR;
  const thresholdLaar = Math.round(Math.max(0, thresholdMvr) * 100);
  if (thresholdLaar > 0 && subtotalLaar >= thresholdLaar) return 0;

  const key = island.trim().toLowerCase();
  const zones = options?.zoneFeesMvr ?? DEFAULT_ZONE_FEES_MVR;
  for (const [zone, feeMvr] of Object.entries(zones)) {
    if (zone.trim().toLowerCase() === key) {
      return Math.round(Math.max(0, feeMvr) * 100);
    }
  }

  const defaultFeeMvr = options?.defaultFeeMvr ?? DEFAULT_FEE_MVR;
  return Math.round(Math.max(0, defaultFeeMvr) * 100);
}

export function estimateDeliveryFeeMvr(
  island: string,
  subtotalMvr: number,
  options?: DeliveryFeeEstimateOptions,
): number {
  return estimateDeliveryFeeLaar(island, Math.round(subtotalMvr * 100), options) / 100;
}
