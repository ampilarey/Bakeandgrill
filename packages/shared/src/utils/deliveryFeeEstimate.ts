/** Fallback delivery fee when the preview API is unreachable (matches POS defaults). */
export function estimateDeliveryFeeLaar(island: string, subtotalLaar: number): number {
  const thresholdLaar = 20000;
  if (subtotalLaar >= thresholdLaar) return 0;
  const key = island.trim().toLowerCase();
  const zones: Record<string, number> = { male: 3000, hulhumale: 3000, hulhumalé: 3000 };
  return zones[key] ?? 3000;
}

export function estimateDeliveryFeeMvr(island: string, subtotalMvr: number): number {
  return estimateDeliveryFeeLaar(island, Math.round(subtotalMvr * 100)) / 100;
}
