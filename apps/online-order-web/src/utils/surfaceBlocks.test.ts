import { describe, expect, it } from 'vitest';
import type { PageBlockRow } from '../api';
import { blocksForSurface, chromeEnabled } from './surfaceBlocks';

function row(partial: Partial<PageBlockRow> & { block_type: string }): PageBlockRow {
  return {
    id: partial.id ?? 1,
    app: 'order_app',
    page: 'home',
    block_type: partial.block_type,
    position: partial.position ?? 0,
    is_enabled: partial.is_enabled ?? true,
    content_mode: 'own',
    settings: partial.settings ?? {},
  };
}

describe('surfaceBlocks', () => {
  it('keeps Website and Order App device placements independent', () => {
    const blocks = [
      row({
        id: 1,
        block_type: 'prayer_bar',
        position: 0,
        settings: {
          show_desktop: true,
          show_mobile: false,
          placement_desktop: 'header',
          placement_mobile: 'home',
        },
      }),
      row({
        id: 2,
        block_type: 'hero',
        position: 1,
        settings: {
          show_desktop: false,
          show_mobile: true,
          placement_desktop: 'home',
          placement_mobile: 'home',
        },
      }),
    ];

    expect(chromeEnabled(blocks, 'prayer_bar', 'desktop', 'header')).toBe(true);
    expect(chromeEnabled(blocks, 'prayer_bar', 'mobile', 'home')).toBe(false);
    expect(blocksForSurface(blocks, 'mobile', 'home').map((b) => b.block_type)).toEqual(['hero']);
    expect(blocksForSurface(blocks, 'desktop', 'home').map((b) => b.block_type)).toEqual([]);
  });

  it('orders by per-device order override', () => {
    const blocks = [
      row({ id: 1, block_type: 'hero', position: 0, settings: { order_mobile: 2 } }),
      row({ id: 2, block_type: 'trust_strip', position: 1, settings: { order_mobile: 0 } }),
    ];
    expect(blocksForSurface(blocks, 'mobile', 'home').map((b) => b.block_type)).toEqual([
      'trust_strip',
      'hero',
    ]);
  });

  it('does not render disabled or not-added components', () => {
    const blocks = [
      row({ id: 1, block_type: 'hero', is_enabled: false }),
      row({ id: 2, block_type: 'trust_strip', settings: { show_mobile: false } }),
    ];
    expect(blocksForSurface(blocks, 'mobile', 'home')).toEqual([]);
  });
});
