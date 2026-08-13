import { describe, expect, it } from 'vitest';
import {
  addableTypesOnSurface,
  countComponentsOnSurface,
  findSingletonDuplicatesOnSurface,
  listConfiguredOnSurface,
  listHiddenOnSurface,
  placementSettingsForSurface,
  surfaceCountLabel,
} from './canonicalCatalog';
import { countBlocksOnSurface } from './surfaceCatalog';

const headerBlocks = [
  {
    id: 1,
    block_type: 'prayer_bar',
    is_enabled: true,
    position: 0,
    label: 'Prayer',
    settings: { show_mobile: true, placement_mobile: 'header' },
  },
  {
    id: 2,
    block_type: 'announcement',
    is_enabled: true,
    position: 1,
    label: 'Announcement',
    settings: { show_mobile: true, placement_mobile: 'header' },
  },
  {
    id: 3,
    block_type: 'hero',
    is_enabled: true,
    position: 2,
    label: 'Hero',
    settings: {},
  },
  {
    id: 4,
    block_type: 'greeting',
    is_enabled: false,
    position: 3,
    label: 'Greeting',
    settings: { show_mobile: true, placement_mobile: 'header' },
  },
];

describe('canonicalCatalog', () => {
  const filter = { app: 'website' as const, device: 'mobile' as const, slot: 'header' as const };

  it('lists only enabled configured components on the surface', () => {
    const list = listConfiguredOnSurface(headerBlocks, filter);
    expect(list.map((c) => c.component_id)).toEqual([
      'website.mobile.header.1',
      'website.mobile.header.2',
    ]);
    expect(countComponentsOnSurface(headerBlocks, filter)).toBe(2);
    expect(countBlocksOnSurface(headerBlocks, 'mobile', 'header')).toBe(2);
  });

  it('keeps card count and listed IDs in set equality', () => {
    const list = listConfiguredOnSurface(headerBlocks, filter);
    const ids = new Set(list.map((c) => c.component_id));
    expect(ids.size).toBe(list.length);
    expect(list.length).toBe(countComponentsOnSurface(headerBlocks, filter));
    expect(surfaceCountLabel(headerBlocks, filter).label).toBe('2 showing · 1 hidden');
  });

  it('lists hidden separately and never in the live count', () => {
    const hidden = listHiddenOnSurface(headerBlocks, filter);
    expect(hidden.map((c) => c.block_id)).toEqual([4]);
    expect(countComponentsOnSurface(headerBlocks, filter)).toBe(2);
  });

  it('suggests addable types excluding configured and hidden singletons', () => {
    expect(
      addableTypesOnSurface(
        headerBlocks,
        filter,
        ['prayer_bar', 'announcement', 'greeting', 'opening_status', 'stat_chips'],
      ),
    ).toEqual(['opening_status', 'stat_chips']);
  });

  it('keeps multi-instance types addable on footer when already present', () => {
    const footerFilter = { app: 'website' as const, device: 'mobile' as const, slot: 'footer' as const };
    const footerBlocks = [
      {
        id: 5,
        block_type: 'rich_text',
        is_enabled: true,
        position: 0,
        label: 'Text',
        settings: { show_mobile: true, placement_mobile: 'footer' },
      },
    ];
    expect(
      addableTypesOnSurface(footerBlocks, footerFilter, ['rich_text', 'site_footer'], (t) => t === 'rich_text'),
    ).toEqual(['rich_text', 'site_footer']);
  });

  it('builds placement settings for the selected surface only', () => {
    expect(placementSettingsForSurface(filter)).toEqual({
      show_desktop: false,
      show_mobile: true,
      placement_desktop: 'home',
      placement_mobile: 'header',
    });
  });

  it('reports singleton duplicates on a surface for admin review', () => {
    const dupes = findSingletonDuplicatesOnSurface([
      ...headerBlocks,
      {
        id: 9,
        block_type: 'prayer_bar',
        is_enabled: true,
        position: 0,
        label: 'Prayer dup',
        settings: { show_mobile: true, placement_mobile: 'header' },
      },
    ], filter);
    expect(dupes).toEqual([
      { type: 'prayer_bar', component_ids: ['website.mobile.header.1', 'website.mobile.header.9'] },
    ]);
  });

  it('does not place home-only blocks on header', () => {
    const ids = listConfiguredOnSurface(headerBlocks, filter).map((c) => c.component_type);
    expect(ids).not.toContain('hero');
  });

  it('keeps Website and Order App lists independent for the same slot', () => {
    const websiteHeader = listConfiguredOnSurface(headerBlocks, filter);
    const orderHeader = listConfiguredOnSurface(
      [
        {
          id: 50,
          block_type: 'prayer_bar',
          is_enabled: true,
          position: 0,
          label: 'Order prayer',
          settings: { show_mobile: true, placement_mobile: 'header' },
        },
      ],
      { app: 'order_app', device: 'mobile', slot: 'header' },
    );
    expect(websiteHeader.map((c) => c.block_id)).toEqual([1, 2]);
    expect(orderHeader.map((c) => c.block_id)).toEqual([50]);
    expect(orderHeader[0]?.component_id).toBe('order_app.mobile.header.50');
  });

  it('does not list a mobile-header block on desktop header without desktop placement', () => {
    const mobileOnly = [
      {
        id: 7,
        block_type: 'announcement',
        is_enabled: true,
        position: 0,
        label: 'Announcement',
        settings: {
          show_desktop: false,
          show_mobile: true,
          placement_desktop: 'home',
          placement_mobile: 'header',
        },
      },
    ];
    expect(countComponentsOnSurface(mobileOnly, filter)).toBe(1);
    expect(
      countComponentsOnSurface(mobileOnly, { app: 'website', device: 'desktop', slot: 'header' }),
    ).toBe(0);
    expect(
      countComponentsOnSurface(mobileOnly, { app: 'website', device: 'mobile', slot: 'home' }),
    ).toBe(0);
  });
});
