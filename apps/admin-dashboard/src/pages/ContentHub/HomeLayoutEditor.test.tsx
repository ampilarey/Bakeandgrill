import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HomeLayoutEditor } from './HomeLayoutEditor';

const fetchAdminPageBlocks = vi.fn();
const reorderPageBlocks = vi.fn();
const updatePageBlock = vi.fn();
const deletePageBlock = vi.fn();
const createPageBlock = vi.fn();
const createPageBlockPreviewToken = vi.fn();
const publishPageBlocks = vi.fn();
const discardPageBlockDraft = vi.fn();

vi.mock('../../api/pageBlocks', () => ({
  fetchAdminPageBlocks: (...args: unknown[]) => fetchAdminPageBlocks(...args),
  reorderPageBlocks: (...args: unknown[]) => reorderPageBlocks(...args),
  updatePageBlock: (...args: unknown[]) => updatePageBlock(...args),
  deletePageBlock: (...args: unknown[]) => deletePageBlock(...args),
  createPageBlock: (...args: unknown[]) => createPageBlock(...args),
  createPageBlockPreviewToken: (...args: unknown[]) => createPageBlockPreviewToken(...args),
  publishPageBlocks: (...args: unknown[]) => publishPageBlocks(...args),
  discardPageBlockDraft: (...args: unknown[]) => discardPageBlockDraft(...args),
}));

function blocksFor(app: string) {
  if (app === 'order_app') {
    return [
      {
        id: 1,
        app: 'order_app',
        page: 'home',
        block_type: 'mode_cards',
        position: 0,
        is_enabled: true,
        content_mode: 'own',
        settings: {},
        label: 'Order mode cards',
        description: 'Delivery, Pickup, and Dine-in',
        removable: true,
        supports_shared_content: false,
        flow_warning: 'Without these cards, customers need another path into ordering.',
      },
      {
        id: 2,
        app: 'order_app',
        page: 'home',
        block_type: 'prayer_bar',
        position: 1,
        is_enabled: true,
        content_mode: 'own',
        settings: { placement_mobile: 'home', placement_desktop: 'header' },
        label: 'Prayer Time Banner',
        description: 'Prayer banner',
        removable: true,
        supports_shared_content: false,
      },
    ];
  }
  return [
    {
      id: 10,
      app: 'website',
      page: 'home',
      block_type: 'hero',
      position: 0,
      is_enabled: true,
      content_mode: 'own',
      settings: {},
      label: 'Hero banner',
      description: 'Top slideshow',
      removable: true,
      supports_shared_content: false,
    },
    {
      id: 11,
      app: 'website',
      page: 'home',
      block_type: 'trust_strip',
      position: 1,
      is_enabled: true,
      content_mode: 'own',
      settings: {},
      label: 'Trust strip',
      description: 'Trust signals',
      removable: true,
      supports_shared_content: false,
    },
    {
      id: 12,
      app: 'website',
      page: 'home',
      block_type: 'prayer_bar',
      position: 2,
      is_enabled: true,
      content_mode: 'own',
      settings: {
        show_desktop: true,
        show_mobile: true,
        placement_desktop: 'header',
        placement_mobile: 'header',
      },
      label: 'Prayer Time Banner',
      description: 'Prayer banner',
      removable: true,
      supports_shared_content: false,
    },
    {
      id: 13,
      app: 'website',
      page: 'home',
      block_type: 'announcement',
      position: 3,
      is_enabled: true,
      content_mode: 'own',
      settings: {
        show_desktop: true,
        show_mobile: true,
        placement_desktop: 'header',
        placement_mobile: 'header',
      },
      label: 'Announcement banner',
      description: 'Announcement',
      removable: true,
      supports_shared_content: false,
    },
    {
      id: 14,
      app: 'website',
      page: 'home',
      block_type: 'greeting',
      position: 4,
      is_enabled: false,
      content_mode: 'own',
      settings: {
        show_mobile: true,
        placement_mobile: 'header',
      },
      label: 'Greeting',
      description: 'Greeting',
      removable: true,
      supports_shared_content: false,
    },
  ];
}

describe('HomeLayoutEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchAdminPageBlocks.mockImplementation(async (app: string) => ({
      app,
      page: 'home',
      blocks: blocksFor(app),
      available_types: [
        {
          type: 'rich_text',
          label: 'Custom text',
          description: 'A heading and a paragraph',
          apps: ['website', 'order_app'],
          removable: true,
          supports_shared_content: false,
          allows_multiple: true,
        },
        {
          type: 'prayer_bar',
          label: 'Prayer Time Banner',
          description: 'Prayer banner',
          apps: ['website', 'order_app'],
          removable: true,
          supports_shared_content: false,
        },
        {
          type: 'featured',
          label: 'Featured items',
          description: 'Featured',
          apps: ['website', 'order_app'],
          removable: true,
          supports_shared_content: false,
        },
      ],
      unknown_types: [],
      draft: false,
      version: 0,
      saved_at: null,
    }));
    createPageBlock.mockResolvedValue({ block: { id: 99, block_type: 'rich_text' }, draft: true, version: 1 });
    updatePageBlock.mockImplementation(async (id: number, payload: Record<string, unknown>) => ({
      block: { id, ...payload },
      draft: true,
      version: 1,
    }));
    deletePageBlock.mockResolvedValue({ blocks: [], draft: true, version: 1 });
  });

  it('loads only the initial app and shows single-app overview cards', async () => {
    render(<HomeLayoutEditor initialApp="website" />);
    await waitFor(() => expect(screen.getByTestId('home-components-overview')).toBeInTheDocument());

    expect(fetchAdminPageBlocks).toHaveBeenCalledTimes(1);
    expect(fetchAdminPageBlocks).toHaveBeenCalledWith('website');

    expect(screen.getByTestId('home-layout-block-hero')).toBeTruthy();
    expect(screen.getByTestId('home-comp-status-hero').textContent).toMatch(/Added/);
    expect(screen.getByTestId('home-comp-status-prayer_bar').textContent).toMatch(/Added/);

    expect(screen.queryByTestId('home-layout-move-up-10')).toBeNull();
    expect(screen.queryByRole('button', { name: /^Hide$/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Remove$/i })).toBeNull();
    expect(screen.queryByTestId('home-layout-fixed-modules')).toBeNull();
  });

  it('loads order_app when initialApp is order_app', async () => {
    render(<HomeLayoutEditor initialApp="order_app" />);
    await waitFor(() => expect(screen.getByTestId('home-layout-block-prayer_bar')).toBeInTheDocument());

    expect(fetchAdminPageBlocks).toHaveBeenCalledWith('order_app');
    expect(screen.getByTestId('home-comp-status-prayer_bar').textContent).toMatch(/Added/);
    expect(screen.getByTestId('home-comp-status-hero').textContent).toMatch(/Not added/);
  });

  it('opens editor with controls for the active app only', async () => {
    render(<HomeLayoutEditor initialApp="website" />);
    await waitFor(() => expect(screen.getByTestId('home-layout-block-hero')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('home-layout-edit-10'));
    const sheet = await screen.findByTestId('home-layout-section-editor');
    expect(within(sheet).getByTestId('home-comp-editor-website')).toBeTruthy();
    expect(within(sheet).queryByTestId('home-comp-editor-order_app')).toBeNull();
    expect(within(sheet).getByTestId('home-layout-visibility-switch-10')).toBeTruthy();
  });

  it('shows move controls only in Reorder mode', async () => {
    render(<HomeLayoutEditor initialApp="website" />);
    await waitFor(() => expect(screen.getByTestId('home-components-overview')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('home-layout-reorder-toggle'));
    expect(screen.getByTestId('home-layout-editor').getAttribute('data-reorder')).toBe('true');
    expect(screen.getByTestId('home-layout-move-up-10')).toBeTruthy();
  });

  it('can add featured items from the editor', async () => {
    render(<HomeLayoutEditor initialApp="order_app" />);
    await waitFor(() => expect(screen.getByTestId('home-layout-block-featured')).toBeInTheDocument());
    fireEvent.click(within(screen.getByTestId('home-layout-block-featured')).getByRole('button'));
    const sheet = await screen.findByTestId('home-layout-section-editor');
    fireEvent.click(within(sheet).getByTestId('home-comp-add-order_app'));
    await waitFor(() => expect(createPageBlock).toHaveBeenCalledWith(
      expect.objectContaining({ app: 'order_app', block_type: 'featured', content_mode: 'own' }),
    ));
  });

  it('opens only the components counted on the surface card', async () => {
    render(
      <HomeLayoutEditor
        surfaceFilter={{ app: 'website', device: 'mobile', slot: 'header' }}
      />,
    );
    await waitFor(() => expect(screen.getByTestId('home-components-overview')).toBeInTheDocument());

    expect(fetchAdminPageBlocks).toHaveBeenCalledWith('website');
    expect(screen.getByTestId('home-layout-surface-breadcrumb').textContent).toMatch(/Website · Mobile · Header/);
    expect(screen.getByTestId('home-layout-surface-count').textContent).toMatch(/2 components/);
    expect(screen.getByTestId('home-components-overview').getAttribute('data-surface-component-count')).toBe('2');

    // Exactly the two enabled header instances — not the full type library, not home hero/trust, not disabled greeting.
    const rows = screen.getByTestId('home-components-overview').querySelectorAll('[data-testid^="home-layout-block-"]');
    expect(rows).toHaveLength(2);
    expect(screen.getByTestId('home-layout-block-website.mobile.header.12')).toBeTruthy();
    expect(screen.getByTestId('home-layout-block-website.mobile.header.13')).toBeTruthy();
    expect(screen.queryByTestId('home-layout-block-hero')).toBeNull();
    expect(screen.queryByTestId('home-layout-block-greeting')).toBeNull();
    expect(screen.queryByTestId('home-layout-block-mode_cards')).toBeNull();
    expect(screen.getByTestId('home-layout-app-label').textContent).toMatch(/Website/);
  });

  it('shows empty state when a surface has zero components', async () => {
    render(
      <HomeLayoutEditor
        surfaceFilter={{ app: 'website', device: 'mobile', slot: 'bottom_navigation' }}
      />,
    );
    await waitFor(() => expect(screen.getByTestId('home-layout-surface-empty')).toBeInTheDocument());
    expect(screen.getByTestId('home-layout-surface-count').textContent).toMatch(/0 components/);
  });
});
