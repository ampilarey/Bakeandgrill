import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ContentHubPage } from '../pages/ContentHub/ContentHubPage';
import type { ContentBlock } from '../api/content';
import * as contentApi from '../api/content';

vi.mock('../api/content', () => ({
  getContentBlocks: vi.fn(),
  getContentSchedules: vi.fn(async () => ({ schedules: [] })),
  getContentDrafts: vi.fn(async () => ({ drafts: {}, saved_at: null })),
  saveContentDrafts: vi.fn(async () => ({ drafts: {}, saved_at: null })),
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
vi.mock('../hooks/useIsMobile', () => ({ useIsMobile: () => false }));
vi.mock('../components/ui', async () => {
  const actual = await vi.importActual<typeof import('../components/ui')>('../components/ui');
  return {
    ...actual,
    useToast: () => ({ success: vi.fn(), error: vi.fn() }),
  };
});
vi.mock('../components/MediaPicker', () => ({
  MediaPicker: () => null,
}));

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
    link_state: 'same',
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
    link_state: 'different',
  };
}

const allBlocks = () => [phoneBlock(), heroBlock()];

describe('Content Hub dual-app editing', () => {
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
        if (c.scope === 'shared') {
          return { ...b, shared: String(c.value), resolved_website: String(c.value), resolved_order_app: String(c.value), state: 'shared' as const };
        }
        return b;
      }),
    }));
    vi.mocked(contentApi.splitContentBlock).mockImplementation(async () => ({
      blocks: [
        {
          ...phoneBlock(),
          state: 'split',
          link_state: 'different',
          website: '+960 912 0011',
          order_app: '+960 912 0011',
          shared: null,
        },
        heroBlock(),
      ],
    }));
  });

  it('editing a shared field publishes to the shared scope', async () => {
    render(
      <MemoryRouter initialEntries={['/content?group=Contact']}>
        <ContentHubPage />
      </MemoryRouter>,
    );

    await waitFor(
      () => {
        expect(screen.getByDisplayValue('+960 912 0011')).toBeTruthy();
      },
      { timeout: 8000 },
    );

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
      { key: 'business_phone', scope: 'shared', value: '+960 WEB EDIT', locale: 'en' },
    ]);
  }, 15000);

  it('hero visual editor drafts persist to the order_app scope on publish when split', async () => {
    render(
      <MemoryRouter initialEntries={['/content?group=Hero']}>
        <ContentHubPage />
      </MemoryRouter>,
    );

    await screen.findByTestId('scope-tabs-hero_slides');
    // Default tab is Website — switch to Order app to edit that scope.
    fireEvent.click(screen.getByTestId('scope-tab-hero_slides-order_app'));

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
    const heroChange = changes.find((c) => c.key === 'hero_slides' && c.scope === 'order_app');
    expect(heroChange).toBeTruthy();
    expect(String(heroChange?.value)).toContain('Edited order eyebrow');
  });

  it('locale switch reloads blocks for that locale', async () => {
    render(
      <MemoryRouter initialEntries={['/content?group=Contact']}>
        <ContentHubPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(contentApi.getContentBlocks).toHaveBeenCalledWith('en');
    });

    fireEvent.click(screen.getByRole('button', { name: /^DV$/i }));

    await waitFor(() => {
      expect(contentApi.getContentBlocks).toHaveBeenCalledWith('dv');
    });
  });

  it('keeps unsynced drafts when switching away from and back to a locale', async () => {
    vi.mocked(contentApi.getContentBlocks).mockImplementation(async (loc = 'en') => ({
      locale: loc,
      locales: ['en', 'dv'],
      blocks: [
        loc === 'dv'
          ? {
            ...phoneBlock(),
            shared: '+960 DV LIVE',
            resolved_website: '+960 DV LIVE',
            resolved_order_app: '+960 DV LIVE',
          }
          : phoneBlock(),
      ],
    }));

    render(
      <MemoryRouter initialEntries={['/content?group=Contact']}>
        <ContentHubPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByDisplayValue('+960 912 0011')).toBeTruthy();
    });

    fireEvent.change(screen.getByDisplayValue('+960 912 0011'), {
      target: { value: '+960 EN DRAFT' },
    });
    expect(screen.getByDisplayValue('+960 EN DRAFT')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /^DV$/i }));
    await waitFor(() => {
      expect(screen.getByDisplayValue('+960 DV LIVE')).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('button', { name: /^EN$/i }));
    await waitFor(() => {
      expect(screen.getByDisplayValue('+960 EN DRAFT')).toBeTruthy();
    });
  });
});
