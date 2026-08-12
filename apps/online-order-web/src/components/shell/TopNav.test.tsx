import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { PageBlockRow } from '../../api';

const authState = vi.hoisted(() => ({
  isAuthenticated: true,
  customerName: '7123456' as string | null,
}));

const pageBlocksState = vi.hoisted(() => ({
  blocks: [] as PageBlockRow[],
  loading: true,
}));

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({
    isAuthenticated: authState.isAuthenticated,
    customerName: authState.customerName,
    authReady: true,
    setAuth: () => undefined,
    clearAuth: () => undefined,
  }),
}));

vi.mock('../../context/ShellNavContext', () => ({
  useShellNav: () => ({ hideNav: false }),
}));

vi.mock('../../context/SiteSettingsContext', () => ({
  useSiteSettingsContext: () => ({
    settings: { site_name: 'Bake & Grill', logo: '/logo.png' },
  }),
}));

vi.mock('../../context/PageBlocksContext', () => ({
  usePageBlocks: () => ({
    blocks: pageBlocksState.blocks,
    loading: pageBlocksState.loading,
    reload: async () => {},
  }),
}));

vi.mock('../../hooks/useActiveOrder', () => ({
  useActiveOrder: () => ({ hasActiveOrder: false }),
}));

vi.mock('../PrayerBar', () => ({
  PrayerBar: () => <div data-testid="prayer-bar" />,
}));

import { TopNav } from './TopNav';
import { LanguageProvider } from '../../context/LanguageContext';

function mount() {
  return render(
    <MemoryRouter>
      <LanguageProvider>
        <TopNav />
      </LanguageProvider>
    </MemoryRouter>,
  );
}

function shellBlock(
  blockType: string,
  settings: Record<string, unknown> = {},
): PageBlockRow {
  return {
    id: 1,
    app: 'order_app',
    page: 'home',
    block_type: blockType,
    position: 0,
    is_enabled: true,
    content_mode: 'own',
    settings,
  };
}

describe('TopNav account chip', () => {
  beforeEach(() => {
    pageBlocksState.loading = true;
    pageBlocksState.blocks = [];
  });

  it('shows local phone + person control, not Account/name', () => {
    authState.isAuthenticated = true;
    authState.customerName = '7123456';
    mount();

    expect(screen.getByText('7123456')).toBeTruthy();
    expect(screen.queryByText('Account')).toBeNull();
    const link = screen.getByRole('link', { name: /My account|Account 7123456/i });
    expect(link.getAttribute('href')).toBe('/account');
  });

  it('signed-out shows Sign in, not a phone chip', () => {
    authState.isAuthenticated = false;
    authState.customerName = null;
    mount();

    expect(screen.getByRole('link', { name: /Sign in/i })).toBeTruthy();
    expect(screen.queryByText('7123456')).toBeNull();
  });
});

describe('TopNav prayer bar gating', () => {
  it('hides prayer bar when prayer_bar is not placed in the desktop header', () => {
    pageBlocksState.loading = false;
    pageBlocksState.blocks = [
      shellBlock('prayer_bar', {
        show_desktop: true,
        placement_desktop: 'home',
      }),
    ];
    mount();

    expect(screen.queryByTestId('prayer-bar')).toBeNull();
    expect(document.querySelector('.top-nav__prayer')).toBeNull();
  });

  it('shows prayer bar when prayer_bar is in the desktop header', () => {
    pageBlocksState.loading = false;
    pageBlocksState.blocks = [
      shellBlock('prayer_bar', {
        show_desktop: true,
        placement_desktop: 'header',
      }),
    ];
    mount();

    expect(screen.getByTestId('prayer-bar')).toBeTruthy();
  });
});
