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
        supports_shared_content: true,
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
      content_mode: 'shared',
      settings: {},
      label: 'Hero banner',
      description: 'Top slideshow',
      removable: true,
      supports_shared_content: true,
    },
    {
      id: 11,
      app: 'website',
      page: 'home',
      block_type: 'trust_strip',
      position: 1,
      is_enabled: true,
      content_mode: 'shared',
      settings: {},
      label: 'Trust strip',
      description: 'Trust signals',
      removable: true,
      supports_shared_content: true,
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
          supports_shared_content: true,
          allows_multiple: true,
        },
        {
          type: 'prayer_bar',
          label: 'Prayer Time Banner',
          description: 'Prayer banner',
          apps: ['website', 'order_app'],
          removable: true,
          supports_shared_content: true,
        },
        {
          type: 'featured',
          label: 'Featured items',
          description: 'Featured',
          apps: ['website', 'order_app'],
          removable: true,
          supports_shared_content: true,
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

  it('shows dual-app overview cards without Up/Down/Hide/Remove on each card', async () => {
    render(<HomeLayoutEditor />);
    await waitFor(() => expect(screen.getByTestId('home-components-overview')).toBeInTheDocument());

    expect(screen.getByTestId('home-layout-block-hero')).toBeTruthy();
    expect(screen.getByTestId('home-layout-block-prayer_bar')).toBeTruthy();
    expect(screen.getByTestId('home-comp-website-status-hero').textContent).toMatch(/Website: Added/);
    expect(screen.getByTestId('home-comp-order-status-prayer_bar').textContent).toMatch(/Order App: Added/);

    expect(screen.queryByTestId('home-layout-move-up-10')).toBeNull();
    expect(screen.queryByRole('button', { name: /^Hide$/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Remove$/i })).toBeNull();
    expect(screen.queryByTestId('home-layout-fixed-modules')).toBeNull();
  });

  it('shows prayer banner in the library for both apps', async () => {
    render(<HomeLayoutEditor />);
    await waitFor(() => expect(screen.getByTestId('home-layout-block-prayer_bar')).toBeInTheDocument());
    expect(screen.getByTestId('home-comp-website-status-prayer_bar').textContent).toMatch(/Not added|Hidden|Added/);
    expect(screen.getByTestId('home-comp-order-status-prayer_bar').textContent).toMatch(/Added/);
  });

  it('opens editor with independent Website and Order App controls', async () => {
    render(<HomeLayoutEditor />);
    await waitFor(() => expect(screen.getByTestId('home-layout-block-hero')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('home-layout-edit-10'));
    const sheet = await screen.findByTestId('home-layout-section-editor');
    expect(within(sheet).getByTestId('home-comp-editor-website')).toBeTruthy();
    expect(within(sheet).getByTestId('home-comp-editor-order_app')).toBeTruthy();
    expect(within(sheet).getByTestId('home-comp-add-order_app')).toBeTruthy();
    expect(within(sheet).getByTestId('home-layout-visibility-switch-10')).toBeTruthy();
  });

  it('shows move controls only in Reorder mode', async () => {
    render(<HomeLayoutEditor />);
    await waitFor(() => expect(screen.getByTestId('home-components-overview')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('home-layout-reorder-toggle'));
    expect(screen.getByTestId('home-layout-editor').getAttribute('data-reorder')).toBe('true');
    expect(screen.getByTestId('home-layout-move-up-10')).toBeTruthy();
  });

  it('can add featured items to Order App from the editor', async () => {
    render(<HomeLayoutEditor />);
    await waitFor(() => expect(screen.getByTestId('home-layout-block-featured')).toBeInTheDocument());
    fireEvent.click(within(screen.getByTestId('home-layout-block-featured')).getByRole('button'));
    const sheet = await screen.findByTestId('home-layout-section-editor');
    fireEvent.click(within(sheet).getByTestId('home-comp-add-order_app'));
    await waitFor(() => expect(createPageBlock).toHaveBeenCalledWith(
      expect.objectContaining({ app: 'order_app', block_type: 'featured' }),
    ));
  });
});
