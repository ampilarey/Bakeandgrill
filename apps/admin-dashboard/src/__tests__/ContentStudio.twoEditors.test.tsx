import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
vi.mock('../hooks/useIsMobile', () => ({ useIsMobile: () => false, useIsCompactAdmin: () => false, useIsWideDesktop: () => true }));
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
  });

  it('editing a dual-app field publishes to the current destination scope', async () => {
    render(
      <MemoryRouter initialEntries={['/content/website?group=Contact']}>
        <ContentHubPage />
      </MemoryRouter>,
    );

    await screen.findByTestId('edit-business_phone');
    fireEvent.click(screen.getByTestId('edit-business_phone'));
    const sheet = await screen.findByTestId('block-editor-sheet-business_phone');
    await waitFor(
      () => {
        expect(within(sheet).getByDisplayValue('+960 912 0011')).toBeTruthy();
      },
      { timeout: 8000 },
    );

    fireEvent.change(within(sheet).getByDisplayValue('+960 912 0011'), {
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
  }, 15000);

  it('hero visual editor drafts persist to the order_app scope in the order app hub', async () => {
    render(
      <MemoryRouter initialEntries={['/content/order-app?group=Hero']}>
        <ContentHubPage />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByTestId('edit-hero_slides'));
    const sheet = await screen.findByTestId('hero-editor-sheet');
    expect(within(sheet).queryByTestId('scope-tabs-hero_slides')).toBeNull();
    fireEvent.click(await within(sheet).findByTestId('hero-slide-overview-0'));
    const slideSheet = await screen.findByTestId('hero-slide-editor-sheet');

    await waitFor(() => {
      expect(within(slideSheet).getByDisplayValue('Order eyebrow')).toBeTruthy();
    });

    fireEvent.change(within(slideSheet).getByDisplayValue('Order eyebrow'), {
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
      <MemoryRouter initialEntries={['/content/website?group=Contact']}>
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
      <MemoryRouter initialEntries={['/content/website?group=Contact']}>
        <ContentHubPage />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByTestId('edit-business_phone'));
    let sheet = await screen.findByTestId('block-editor-sheet-business_phone');
    await waitFor(() => {
      expect(within(sheet).getByDisplayValue('+960 912 0011')).toBeTruthy();
    });

    fireEvent.change(within(sheet).getByDisplayValue('+960 912 0011'), {
      target: { value: '+960 EN DRAFT' },
    });
    expect(within(sheet).getByDisplayValue('+960 EN DRAFT')).toBeTruthy();
    fireEvent.click(within(sheet).getByTestId('content-editor-sheet-close'));

    fireEvent.click(screen.getByRole('button', { name: /^DV$/i }));
    fireEvent.click(await screen.findByTestId('edit-business_phone'));
    sheet = await screen.findByTestId('block-editor-sheet-business_phone');
    await waitFor(() => {
      expect(within(sheet).getByDisplayValue('+960 DV LIVE')).toBeTruthy();
    });
    fireEvent.click(within(sheet).getByTestId('content-editor-sheet-close'));

    fireEvent.click(screen.getByRole('button', { name: /^EN$/i }));
    fireEvent.click(await screen.findByTestId('edit-business_phone'));
    sheet = await screen.findByTestId('block-editor-sheet-business_phone');
    await waitFor(() => {
      expect(within(sheet).getByDisplayValue('+960 EN DRAFT')).toBeTruthy();
    });
  });
});
