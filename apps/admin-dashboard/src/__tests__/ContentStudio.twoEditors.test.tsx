import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppContentEditor } from '../pages/ContentStudio/AppContentEditor';
import type { ContentBlock } from '../api/content';
import * as contentApi from '../api/content';

vi.mock('../api/content', () => ({
  getContentBlocks: vi.fn(),
  getContentSchedules: vi.fn(async () => ({ schedules: [] })),
  getContentDrafts: vi.fn(async () => ({ drafts: {}, saved_at: null })),
  saveContentDrafts: vi.fn(async () => ({ drafts: {}, saved_at: null })),
  getContentMedia: vi.fn(async () => ({ items: [] })),
  updateContent: vi.fn(async () => ({ blocks: [] })),
  shareContentBlock: vi.fn(),
  splitContentBlock: vi.fn(),
  copyContentBlock: vi.fn(),
  copyContentSection: vi.fn(),
  uploadContentImage: vi.fn(),
  exportContent: vi.fn(),
  importContent: vi.fn(),
  getContentRevisions: vi.fn(async () => ({ revisions: [] })),
  restoreContentRevision: vi.fn(),
  scheduleContent: vi.fn(),
  cancelContentSchedule: vi.fn(),
  createContentPreviewToken: vi.fn(async () => ({
    token: 't', website_url: '/p', order_app_url: '/o', expires_in: 900,
  })),
  uploadContentVideo: vi.fn(),
}));

vi.mock('../hooks/usePageTitle', () => ({ usePageTitle: () => {} }));
vi.mock('../components/ui', async () => {
  const actual = await vi.importActual<typeof import('../components/ui')>('../components/ui');
  return {
    ...actual,
    useToast: () => ({ success: vi.fn(), error: vi.fn() }),
  };
});

const heroShared = JSON.stringify({
  image: '/images/a.jpg',
  eyebrow: 'Shared eyebrow',
  title: 'Shared title',
  subtitle: 'Sub',
  cta_text: 'Order',
  cta_url: '/order/',
  cta2_text: 'Menu',
  cta2_url: '/menu',
});

const heroOrder = JSON.stringify({
  image: '/images/o.jpg',
  eyebrow: 'Order eyebrow',
  title: 'Order title',
  subtitle: 'Order sub',
  cta_text: 'Order',
  cta_url: '/order/',
  cta2_text: 'Menu',
  cta2_url: '/menu',
});

function phoneBlock(): ContentBlock {
  return {
    key: 'business_phone',
    label: 'Phone number',
    group: 'Contact',
    type: 'text',
    apps: ['website', 'order_app'],
    shareable: true,
    public: true,
    shared: '+960 912 0011',
    website: null,
    order_app: null,
    resolved_website: '+960 912 0011',
    resolved_order_app: '+960 912 0011',
    state: 'shared',
  };
}

function websiteOnlyBlock(): ContentBlock {
  return {
    key: 'meta_title',
    label: 'Meta title',
    group: 'SEO',
    type: 'text',
    apps: ['website'],
    shareable: false,
    public: true,
    shared: 'Bake & Grill',
    website: null,
    order_app: null,
    resolved_website: 'Bake & Grill',
    resolved_order_app: null,
    state: 'shared',
  };
}

function orderOnlyBlock(): ContentBlock {
  return {
    key: 'order_app_welcome',
    label: 'Welcome banner',
    group: 'Order App',
    type: 'text',
    apps: ['order_app'],
    shareable: false,
    public: true,
    shared: 'Welcome',
    website: null,
    order_app: null,
    resolved_website: null,
    resolved_order_app: 'Welcome',
    state: 'shared',
  };
}

function heroBlock(): ContentBlock {
  const websiteArr = JSON.stringify([JSON.parse(heroShared)]);
  const orderArr = JSON.stringify([JSON.parse(heroOrder)]);
  return {
    key: 'hero_slides',
    label: 'Hero Slides',
    group: 'Hero',
    type: 'json',
    editor: 'hero',
    apps: ['website', 'order_app'],
    shareable: true,
    public: true,
    shared: websiteArr,
    website: null,
    order_app: orderArr,
    resolved_website: websiteArr,
    resolved_order_app: orderArr,
    state: 'split',
  };
}

const allBlocks = () => [phoneBlock(), websiteOnlyBlock(), orderOnlyBlock(), heroBlock()];

describe('Content Studio two app editors', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(contentApi.getContentBlocks).mockResolvedValue({
      locale: 'en',
      locales: ['en', 'dv'],
      blocks: allBlocks(),
    });
    vi.mocked(contentApi.updateContent).mockImplementation(async (changes) => ({
      blocks: allBlocks().map((b) => {
        const c = changes.find((ch) => ch.key === b.key);
        if (!c) return b;
        if (c.scope === 'website') {
          return { ...b, website: String(c.value), resolved_website: String(c.value), state: 'split' as const };
        }
        if (c.scope === 'order_app') {
          return { ...b, order_app: String(c.value), resolved_order_app: String(c.value), state: 'split' as const };
        }
        return b;
      }),
    }));
    vi.mocked(contentApi.copyContentBlock).mockResolvedValue({
      blocks: allBlocks().map((b) =>
        b.key === 'business_phone'
          ? { ...b, website: '+960 FROM ORDER', resolved_website: '+960 FROM ORDER', state: 'split' as const }
          : b,
      ),
    });
  });

  it('website editor lists only website-app blocks', async () => {
    render(
      <MemoryRouter>
        <AppContentEditor app="website" />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('Phone number')).toBeTruthy();
    });
    expect(screen.getByText('Meta title')).toBeTruthy();
    expect(screen.getAllByText('Hero Slides').length).toBeGreaterThan(0);
    expect(screen.queryByText('Welcome banner')).toBeNull();
    expect(screen.queryByText(/Make different per app/i)).toBeNull();
    expect(screen.queryByText(/Reset to shared/i)).toBeNull();
  });

  it('order app editor lists only order_app blocks', async () => {
    render(
      <MemoryRouter>
        <AppContentEditor app="order_app" />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('Welcome banner')).toBeTruthy();
    });
    expect(screen.getByText('Phone number')).toBeTruthy();
    expect(screen.queryByText('Meta title')).toBeNull();
  });

  it('editing a field publishes to the current app scope only', async () => {
    render(
      <MemoryRouter>
        <AppContentEditor app="website" />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByDisplayValue('+960 912 0011')).toBeTruthy();
    });

    fireEvent.change(screen.getByDisplayValue('+960 912 0011'), {
      target: { value: '+960 WEB EDIT' },
    });
    fireEvent.click(screen.getAllByRole('button', { name: /Publish/i })[0]);

    await waitFor(() => {
      expect(contentApi.updateContent).toHaveBeenCalled();
    });

    const [changes, locale] = vi.mocked(contentApi.updateContent).mock.calls[0];
    expect(locale).toBe('en');
    expect(changes).toEqual([
      { key: 'business_phone', scope: 'website', value: '+960 WEB EDIT', locale: 'en' },
    ]);
    expect(changes.every((c) => c.scope !== 'order_app' && c.scope !== 'shared')).toBe(true);
  });

  it('copy from other app calls copyContentBlock(key, other, current)', async () => {
    render(
      <MemoryRouter>
        <AppContentEditor app="website" />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('Phone number')).toBeTruthy();
    });

    fireEvent.click(screen.getAllByRole('button', { name: /Copy from Order App/i })[0]);

    await waitFor(() => {
      expect(contentApi.copyContentBlock).toHaveBeenCalledWith(
        'business_phone',
        'order_app',
        'website',
        'en',
      );
    });
  });

  it('hero visual editor drafts persist to the current app on publish', async () => {
    render(
      <MemoryRouter>
        <AppContentEditor app="order_app" />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByDisplayValue('Order eyebrow')).toBeTruthy();
    });

    fireEvent.change(screen.getByDisplayValue('Order eyebrow'), {
      target: { value: 'Edited order eyebrow' },
    });
    fireEvent.click(screen.getAllByRole('button', { name: /Publish/i })[0]);

    await waitFor(() => {
      expect(contentApi.updateContent).toHaveBeenCalled();
    });

    const [changes] = vi.mocked(contentApi.updateContent).mock.calls[0];
    expect(changes[0].scope).toBe('order_app');
    expect(changes[0].key).toBe('hero_slides');
    expect(String(changes[0].value)).toContain('Edited order eyebrow');
  });

  it('locale switch reloads blocks for that locale', async () => {
    render(
      <MemoryRouter>
        <AppContentEditor app="website" />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(contentApi.getContentBlocks).toHaveBeenCalledWith('en');
    });

    fireEvent.click(screen.getByRole('button', { name: /Dhivehi/i }));

    await waitFor(() => {
      expect(contentApi.getContentBlocks).toHaveBeenCalledWith('dv');
    });
  });
});
