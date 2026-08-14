import { describe, expect, it } from 'vitest';
import { summarizeBlockValue, blockDisplayName } from '../pages/ContentHub/summarizeBlockValue';
import { buildWebsiteDesktopPageRows } from '../pages/ContentHub/WebsiteDesktopPageList';
import type { ContentBlock } from '../api/content';

function blk(partial: Partial<ContentBlock> & { key: string }): ContentBlock {
  return {
    label: partial.label ?? partial.key,
    group: partial.group ?? 'Home',
    type: partial.type ?? 'text',
    apps: partial.apps ?? ['website'],
    shareable: true,
    public: true,
    shared: partial.shared ?? null,
    website: partial.website ?? null,
    order_app: partial.order_app ?? null,
    resolved_website: partial.resolved_website ?? partial.shared ?? '',
    resolved_order_app: partial.resolved_order_app ?? '',
    state: 'shared',
    ...partial,
  } as ContentBlock;
}

describe('summarizeBlockValue (Stage B)', () => {
  it('summarizes hero with title — not the key name', () => {
    const block = blk({
      key: 'hero_slides',
      label: 'Hero banners',
      editor: 'hero',
      type: 'json',
      shared: JSON.stringify([
        { title: 'What we\'re known for', showing: true },
        { title: 'Hidden slide', showing: false },
      ]),
    });
    const s = summarizeBlockValue(block, 'website', {});
    expect(s.line).toMatch(/What we're known for/);
    expect(s.line).not.toMatch(/hero_slides/);
    expect(s.visibility).toBe('Showing');
  });

  it('treats empty JSON arrays as Empty/Hidden — not a default', () => {
    const block = blk({
      key: 'trust_items',
      label: 'Trust strip',
      editor: 'trust',
      type: 'json',
      shared: '[]',
    });
    const s = summarizeBlockValue(block, 'website', {});
    expect(s.line).toBe('Empty');
    expect(s.visibility).toBe('Hidden');
  });

  it('shows trust first item plus count', () => {
    const block = blk({
      key: 'trust_items',
      label: 'Trust strip',
      editor: 'trust',
      type: 'json',
      shared: JSON.stringify([
        { heading: 'Fresh daily' },
        { heading: 'Local' },
      ]),
    });
    const s = summarizeBlockValue(block, 'website', {});
    expect(s.line).toMatch(/Fresh daily/);
    expect(s.line).toMatch(/2 items/);
  });

  it('ops-owned keys are Managed elsewhere with current value', () => {
    const block = blk({
      key: 'business_phone',
      label: 'Business phone',
      managed_by: {
        owner_label: 'Business Details',
        owner_path: '/admin/business-details',
        note: 'Shared ops',
        current_value: '912 0011',
      },
    });
    const s = summarizeBlockValue(block, 'website', {});
    expect(s.visibility).toBe('Managed elsewhere');
    expect(s.line).toBe('912 0011');
  });

  it('blockDisplayName prefers label over key', () => {
    expect(blockDisplayName(blk({ key: 'home_proof_eyebrow', label: "What we're known for" }))).toBe(
      "What we're known for",
    );
  });
});

describe('buildWebsiteDesktopPageRows', () => {
  it('puts hero first and keeps subgroup headings', () => {
    const blocks = [
      blk({ key: 'order_mode_delivery_title', label: 'Delivery', group: 'Home' }),
      blk({
        key: 'hero_slides',
        label: 'Hero banners',
        editor: 'hero',
        type: 'json',
        shared: '[]',
      }),
      blk({ key: 'trust_items', label: 'Trust strip', editor: 'trust', type: 'json', shared: '[]' }),
    ];
    const rows = buildWebsiteDesktopPageRows('Home', blocks, 'website', {});
    const blockIds = rows.filter((r) => r.kind === 'block').map((r) => r.id);
    expect(blockIds[0]).toBe('hero_slides');
    expect(rows.some((r) => r.kind === 'heading' && r.label === 'Order buttons')).toBe(true);
  });
});
