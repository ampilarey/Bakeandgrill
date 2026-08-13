import { describe, expect, it } from 'vitest';
import {
  addableTypesOnSurface,
  countComponentsOnSurface,
  findDuplicateIdentities,
  listComponentsOnSurface,
  placementSettingsForSurface,
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

  it('lists only enabled components on the surface', () => {
    const list = listComponentsOnSurface(headerBlocks, filter);
    expect(list.map((c) => c.component_id)).toEqual([
      'website.mobile.header.1',
      'website.mobile.header.2',
    ]);
    expect(countComponentsOnSurface(headerBlocks, filter)).toBe(2);
    expect(countBlocksOnSurface(headerBlocks, 'mobile', 'header')).toBe(2);
  });

  it('keeps card count and listed IDs in set equality', () => {
    const list = listComponentsOnSurface(headerBlocks, filter);
    const ids = new Set(list.map((c) => c.component_id));
    expect(ids.size).toBe(list.length);
    expect(list.length).toBe(countComponentsOnSurface(headerBlocks, filter));
    for (const c of list) {
      expect(c.app).toBe('website');
      expect(c.surface).toBe('header');
      expect(c.viewport).toBe('mobile');
      expect(c.owner).toBe('content_branding');
    }
  });

  it('suggests addable types not already on the surface', () => {
    expect(addableTypesOnSurface(headerBlocks, filter, ['prayer_bar', 'announcement', 'greeting', 'opening_status']))
      .toEqual(['greeting', 'opening_status']);
  });

  it('builds placement settings for the selected surface only', () => {
    expect(placementSettingsForSurface(filter)).toEqual({
      show_desktop: false,
      show_mobile: true,
      placement_desktop: 'home',
      placement_mobile: 'header',
    });
  });

  it('flags duplicate active identities', () => {
    const list = listComponentsOnSurface([
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
    const dupes = findDuplicateIdentities(list);
    expect(dupes.length).toBeGreaterThan(0);
  });
});
