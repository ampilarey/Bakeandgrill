import { render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MenuItem } from '../../api';
import { setViewportWidth } from '../../__tests__/viewport';
import { channelWarning, offOrderingChannels } from './channelState';
import { itemToForm } from './menuItemForm';
import { MenuItemTable } from './MenuItemTable';

/**
 * Owner, 2026-09-05: "I have 2 item in one category. Blade menu shows it. But
 * order all doesnt show it."
 *
 * The item was switched off for the order app's channel. Nothing on the menu
 * list said so — the row looked identical to a healthy one, green on both
 * badges — so the only way to find out was a customer failing to order it.
 * These tests hold the row to saying it.
 */

type Row = { channel: string; is_enabled: boolean };

const allOn: Row[] = [
  { channel: 'dine_in', is_enabled: true },
  { channel: 'takeaway', is_enabled: true },
  { channel: 'online_pickup', is_enabled: true },
  { channel: 'delivery', is_enabled: true },
  { channel: 'catering', is_enabled: false },
];

function item(over: Partial<MenuItem> = {}): MenuItem {
  return {
    id: 1,
    name: 'Bajiya',
    base_price: 10,
    is_available: true,
    is_active: true,
    category_id: 1,
    category: { id: 1, name: 'Snacks' },
    tax_code: 'standard_8',
    sort_order: 0,
    ...over,
  } as MenuItem;
}

function withChannels(over: Partial<Record<string, boolean>>): MenuItem {
  return item({
    channel_availabilities: allOn.map((r) => ({
      ...r,
      is_enabled: over[r.channel] ?? r.is_enabled,
    })),
  });
}

describe('offOrderingChannels', () => {
  it('is quiet when every ordering channel is on', () => {
    expect(offOrderingChannels(withChannels({}))).toEqual([]);
  });

  it('ignores catering, which is off for nearly everything', () => {
    // Counting it would put a warning on every ordinary dish, and a warning on
    // everything is a warning on nothing.
    expect(offOrderingChannels(withChannels({ catering: false }))).toEqual([]);
  });

  it('names the channels that are switched off', () => {
    expect(offOrderingChannels(withChannels({ online_pickup: false, delivery: false })))
      .toEqual(['Online pickup', 'Delivery']);
  });

  it('counts a missing row as off, the same as the backend does', () => {
    // KitchenMenuResolver::isItemVisibleForChannel returns false for a null
    // row. An item with no rows at all is orderable nowhere.
    expect(offOrderingChannels(item({ channel_availabilities: [] })))
      .toEqual(['Dine-in', 'Takeaway (POS)', 'Online pickup', 'Delivery']);
  });

  it('stays silent when the payload carried no channel data', () => {
    // Not the same as "off": a list that never asked for the rows must not
    // accuse every item of being broken.
    expect(offOrderingChannels(item())).toEqual([]);
  });
});

describe('channelWarning', () => {
  it('is null for a healthy item', () => {
    expect(channelWarning(withChannels({}))).toBeNull();
  });

  it('lists the dead channels', () => {
    expect(channelWarning(withChannels({ delivery: false }))?.label).toBe('Off: Delivery');
  });

  it('escalates when the item is orderable nowhere', () => {
    const warning = channelWarning(withChannels({
      dine_in: false, takeaway: false, online_pickup: false, delivery: false,
    }));

    expect(warning?.label).toBe('Nowhere to order');
    expect(warning?.severe).toBe(true);
    expect(warning?.title).toMatch(/cannot order it anywhere/);
  });
});

// ── The list itself ───────────────────────────────────────────────────────────

function renderTable(items: MenuItem[]) {
  render(
    <MenuItemTable
      categories={[{ id: 1, name: 'Snacks', is_active: true }]}
      items={items}
      loading={false}
      canManage
      canSeeCost={false}
      menuGroups={[{ id: 1, name: 'Evening', slug: 'evening', sort_order: 0, is_active: true }]}
      activeMenuGroupIds={[1]}
      kitchenSaving={false}
      selectedCat={null}
      search=""
      cateringOnly={false}
      sort="menu"
      page={1}
      lastPage={1}
      perPage={25}
      onSelectedCatChange={vi.fn()}
      onSearchChange={vi.fn()}
      onCateringOnlyChange={vi.fn()}
      onSortChange={vi.fn()}
      onPerPageChange={vi.fn()}
      onPageChange={vi.fn()}
      onToggleKitchenGroup={vi.fn()}
      onSaveKitchenDuty={vi.fn()}
      onToggleAvail={vi.fn()}
      onSnoozeItem={vi.fn()}
      onEditItem={vi.fn()}
      onDeleteItem={vi.fn()}
      onBarcodeLabel={vi.fn()}
      onViewRecipe={vi.fn()}
    />,
  );
}

beforeEach(() => setViewportWidth(1280));
afterEach(() => setViewportWidth(1280));

describe('the menu list marks channel-hidden items', () => {
  it('tags the row that customers cannot order online', () => {
    renderTable([withChannels({ online_pickup: false, delivery: false })]);

    const row = screen.getByTestId('menu-item-row-1');
    expect(within(row).getByTestId('menu-item-channel-tag-1'))
      .toHaveTextContent('Off: Online pickup, Delivery');
  });

  it('leaves a healthy row unmarked', () => {
    renderTable([withChannels({})]);

    expect(screen.queryByTestId('menu-item-channel-tag-1')).not.toBeInTheDocument();
  });

  it('explains the fix on hover rather than only flagging a problem', () => {
    renderTable([withChannels({ delivery: false })]);

    expect(screen.getByTestId('menu-item-channel-tag-1'))
      .toHaveAttribute('title', expect.stringContaining('Where can this be ordered?'));
  });

  it('marks it on a phone card too', () => {
    // The owner reported this from a phone; a desktop-only warning would have
    // been no warning at all.
    setViewportWidth(390);
    renderTable([withChannels({ online_pickup: false })]);

    const card = screen.getByTestId('menu-item-card-1');
    expect(within(card).getByTestId('menu-item-channel-tag-1'))
      .toHaveTextContent('Off: Online pickup');
  });
});

describe('the item editor shows the channels as they really are', () => {
  it('does not tick a channel that has no row', () => {
    // The old default ticked all four for a rowless item, so the editor
    // described an item nobody could order as available everywhere.
    expect(itemToForm(item({ channel_availabilities: [] })).channels).toEqual({
      dine_in: false, takeaway: false, online_pickup: false, delivery: false, catering: false,
    });
  });

  it('still reflects the rows that do exist', () => {
    expect(itemToForm(withChannels({ delivery: false })).channels).toEqual({
      dine_in: true, takeaway: true, online_pickup: true, delivery: false, catering: false,
    });
  });
});
