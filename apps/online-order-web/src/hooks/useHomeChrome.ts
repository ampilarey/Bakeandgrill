import { useEffect, useState } from 'react';
import { fetchPageBlocks, type PageBlockRow } from '../api';

export type HomeChrome = {
  prayerHeaderDesktop: boolean;
  prayerHeaderMobile: boolean;
  prayerHomeDesktop: boolean;
  prayerHomeMobile: boolean;
  announcementHeader: boolean;
  announcementHome: boolean;
  ready: boolean;
};

function settingsOf(block: PageBlockRow | undefined): Record<string, unknown> {
  return (block?.settings ?? {}) as Record<string, unknown>;
}

function bool(v: unknown, fallback: boolean): boolean {
  if (typeof v === 'boolean') return v;
  if (v === undefined || v === null) return fallback;
  return Boolean(v);
}

function placement(settings: Record<string, unknown>, device: 'desktop' | 'mobile', fallback: string): string {
  const key = device === 'desktop' ? 'placement_desktop' : 'placement_mobile';
  const v = settings[key];
  return v === 'header' || v === 'home' ? v : fallback;
}

function resolveChrome(blocks: PageBlockRow[]): HomeChrome {
  const prayer = blocks.find((b) => b.block_type === 'prayer_bar' && b.is_enabled);
  const prayerAny = blocks.find((b) => b.block_type === 'prayer_bar');
  const ann = blocks.find((b) => b.block_type === 'announcement' && b.is_enabled);

  // Legacy: no prayer row yet → keep header prayer on.
  if (!prayerAny) {
    return {
      prayerHeaderDesktop: true,
      prayerHeaderMobile: false,
      prayerHomeDesktop: false,
      prayerHomeMobile: true,
      announcementHeader: false,
      announcementHome: false,
      ready: true,
    };
  }

  const ps = settingsOf(prayer);
  const showDesk = prayer ? bool(ps.show_desktop, true) : false;
  const showMob = prayer ? bool(ps.show_mobile, true) : false;
  const placeDesk = placement(ps, 'desktop', 'header');
  const placeMob = placement(ps, 'mobile', 'home');

  const as = settingsOf(ann);
  const annShowDesk = ann ? bool(as.show_desktop, true) : false;
  const annShowMob = ann ? bool(as.show_mobile, true) : false;
  const annPlaceDesk = placement(as, 'desktop', 'header');
  const annPlaceMob = placement(as, 'mobile', 'header');

  return {
    prayerHeaderDesktop: Boolean(prayer && showDesk && placeDesk === 'header'),
    prayerHeaderMobile: Boolean(prayer && showMob && placeMob === 'header'),
    prayerHomeDesktop: Boolean(prayer && showDesk && placeDesk === 'home'),
    prayerHomeMobile: Boolean(prayer && showMob && placeMob === 'home'),
    announcementHeader: Boolean(
      ann && ((annShowDesk && annPlaceDesk === 'header') || (annShowMob && annPlaceMob === 'header')),
    ),
    announcementHome: Boolean(
      ann && ((annShowDesk && annPlaceDesk === 'home') || (annShowMob && annPlaceMob === 'home')),
    ),
    ready: true,
  };
}

/** Shared chrome flags for Order App header + Home (prayer / announcement). */
export function useHomeChrome(): HomeChrome {
  const [chrome, setChrome] = useState<HomeChrome>({
    prayerHeaderDesktop: true,
    prayerHeaderMobile: false,
    prayerHomeDesktop: false,
    prayerHomeMobile: true,
    announcementHeader: false,
    announcementHome: false,
    ready: false,
  });

  useEffect(() => {
    const previewToken = new URLSearchParams(window.location.search).get('previewToken');
    fetchPageBlocks({ app: 'order_app', previewToken })
      .then((res) => setChrome(resolveChrome(res.blocks ?? [])))
      .catch(() => setChrome((c) => ({ ...c, ready: true })));
  }, []);

  return chrome;
}
