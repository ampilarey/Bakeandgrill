import { request } from './client';

// Public "social proof" counters — owner-enabled in admin Settings.
// Values arrive pre-rounded ("12,500+"); an empty list means disabled.

export interface PublicStat {
  key: string;
  label: string;
  value: number;
  display: string;
}

export interface PublicStatsResponse {
  enabled: boolean;
  stats: PublicStat[];
}

export async function fetchPublicStats(): Promise<PublicStatsResponse> {
  // The order app has its own per-surface toggles in admin Settings.
  return request<PublicStatsResponse>('/public-stats?surface=order');
}
