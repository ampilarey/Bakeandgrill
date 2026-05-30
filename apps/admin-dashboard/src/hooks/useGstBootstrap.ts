import { useEffect, useState } from 'react';
import { req } from '../api/client';

export interface GstBootstrap {
  default_tax_rate_bp: number;
  tax_rate_percent: number;
  tax_inclusive: boolean;
  gst_registered: boolean;
  currency: string;
  sector: string;
}

let cached: GstBootstrap | null = null;

export function useGstBootstrap(): GstBootstrap | null {
  const [bootstrap, setBootstrap] = useState<GstBootstrap | null>(cached);

  useEffect(() => {
    if (cached) return;
    req<GstBootstrap>('/gst/bootstrap')
      .then((data) => {
        cached = data;
        setBootstrap(data);
      })
      .catch(() => setBootstrap({ default_tax_rate_bp: 800, tax_rate_percent: 8, tax_inclusive: false, gst_registered: false, currency: 'MVR', sector: 'general' }));
  }, []);

  return bootstrap;
}
