import { describe, expect, it } from 'vitest';
import type { PageBlockRow } from '../../api';
import { resolveBottomNavTabs, SHELL_NAV_TABS } from './navTabs';

function shellBlock(settings: Record<string, unknown> = {}): PageBlockRow {
  return {
    id: 1,
    app: 'order_app',
    page: 'home',
    block_type: 'bottom_nav',
    position: 0,
    is_enabled: true,
    content_mode: 'own',
    settings,
  };
}

describe('resolveBottomNavTabs', () => {
  it('falls back to default shell tabs when no bottom_nav block exists', () => {
    expect(resolveBottomNavTabs([])).toEqual(SHELL_NAV_TABS);
  });

  it('filters hidden tabs and maps known ids to shell routes', () => {
    const tabs = resolveBottomNavTabs([
      shellBlock({
        tabs: [
          { id: 'home', label: 'Start', href: '/', visible: true },
          { id: 'menu', visible: true },
          { id: 'orders', href: '/orders', visible: true },
          { id: 'events', visible: false },
          { id: 'gift_cards', visible: true },
        ],
      }),
    ]);

    expect(tabs.map((t) => t.to)).toEqual(['/', '/menu', '/order-history', '/gift-cards']);
    expect(tabs[0].displayLabel).toBe('Start');
    expect(tabs.find((t) => t.to === '/events')).toBeUndefined();
  });
});
