import type { PageBlockRow } from '../api';

export type SurfaceDevice = 'desktop' | 'mobile';
export type SurfaceSlot = 'header' | 'home' | 'footer' | 'bottom_navigation';

function boolSetting(settings: Record<string, unknown>, key: string, fallback = true): boolean {
  if (!(key in settings)) return fallback;
  return Boolean(settings[key]);
}

function slotSetting(settings: Record<string, unknown>, key: string, fallback: SurfaceSlot): SurfaceSlot {
  const v = settings[key];
  if (v === 'header' || v === 'home' || v === 'footer' || v === 'bottom_navigation') return v;
  return fallback;
}

export function blockVisibleOnDevice(block: PageBlockRow, device: SurfaceDevice): boolean {
  const s = block.settings ?? {};
  return device === 'desktop'
    ? boolSetting(s, 'show_desktop', true)
    : boolSetting(s, 'show_mobile', true);
}

export function blockPlacementOnDevice(block: PageBlockRow, device: SurfaceDevice): SurfaceSlot {
  const s = block.settings ?? {};
  return device === 'desktop'
    ? slotSetting(s, 'placement_desktop', 'home')
    : slotSetting(s, 'placement_mobile', 'home');
}

export function blockOrderOnDevice(block: PageBlockRow, device: SurfaceDevice): number {
  const s = block.settings ?? {};
  const key = device === 'desktop' ? 'order_desktop' : 'order_mobile';
  const v = s[key];
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return block.position;
}

/** Enabled blocks for one surface, ordered for that device. */
export function blocksForSurface(
  blocks: PageBlockRow[],
  device: SurfaceDevice,
  slot: SurfaceSlot,
  enabledOnly = true,
): PageBlockRow[] {
  return blocks
    .filter((b) => {
      if (enabledOnly && !b.is_enabled) return false;
      if (!blockVisibleOnDevice(b, device)) return false;
      return blockPlacementOnDevice(b, device) === slot;
    })
    .slice()
    .sort((a, b) => {
      const oa = blockOrderOnDevice(a, device);
      const ob = blockOrderOnDevice(b, device);
      if (oa !== ob) return oa - ob;
      return a.id - b.id;
    });
}

export function chromeEnabled(
  blocks: PageBlockRow[],
  type: string,
  device: SurfaceDevice,
  slot: SurfaceSlot,
): boolean {
  return blocksForSurface(blocks, device, slot, true).some((b) => b.block_type === type);
}
