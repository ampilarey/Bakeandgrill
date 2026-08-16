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
          type: 'announcement',
          label: 'Announcement banner',
          description: 'Announcement',
          apps: ['website', 'order_app'],
          removable: true,
          supports_shared_content: false,
        },
        {
          type: 'greeting',
          label: 'Greeting',
          description: 'Greeting',
          apps: ['website', 'order_app'],
          removable: true,
          supports_shared_content: false,
        },
        {
          type: 'opening_status',
          label: 'Opening status',
          description: 'Open/closed',
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

  it('moves the row you pressed, not whichever row shares its number', async () => {
    // Owner, 2026-08-15: "reorder does not work correctly i think" — he was
    // right. The arrows carried the position of a row in the ON-SCREEN list
    // into the FULL list of blocks, which also holds everything sitting on the
    // header, the footer and the bottom bar. One announcement in the header
    // was enough to make every arrow move the wrong thing.
    fetchAdminPageBlocks.mockImplementation(async (app: string) => ({
      app,
      page: 'home',
      blocks: [
        // Not on Home — lives in the header, and is invisible in this list.
        {
          id: 13, app: 'website', page: 'home', block_type: 'announcement', position: 0,
          is_enabled: true, content_mode: 'own', settings: { placement_desktop: 'header' },
          label: 'Announcement banner', description: '', removable: true, supports_shared_content: false,
        },
        {
          id: 10, app: 'website', page: 'home', block_type: 'hero', position: 1,
          is_enabled: true, content_mode: 'own', settings: {},
          label: 'Hero banner', description: '', removable: false, supports_shared_content: false,
        },
        {
          id: 11, app: 'website', page: 'home', block_type: 'trust_strip', position: 2,
          is_enabled: true, content_mode: 'own', settings: {},
          label: 'Trust strip', description: '', removable: true, supports_shared_content: false,
        },
        {
          id: 14, app: 'website', page: 'home', block_type: 'greeting', position: 3,
          is_enabled: true, content_mode: 'own', settings: {},
          label: 'Greeting', description: '', removable: true, supports_shared_content: false,
        },
      ],
      available_types: [],
      unknown_types: [],
      draft: false,
      version: 4,
      saved_at: null,
    }));
    reorderPageBlocks.mockResolvedValue({ version: 5 });

    render(
      <HomeLayoutEditor
        initialApp="website"
        surfaceFilter={{ app: 'website', device: 'desktop', slot: 'home' }}
      />,
    );
    await waitFor(() => expect(screen.getByTestId('home-components-overview')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('home-layout-reorder-toggle'));

    // Hero is first on screen. Send it down — it should end up below the
    // trust strip.
    fireEvent.click(screen.getByTestId('home-layout-move-down-10'));

    await waitFor(() => expect(reorderPageBlocks).toHaveBeenCalled());
    const sent = reorderPageBlocks.mock.calls[0][0].blocks as Array<{ id: number; position: number }>;
    const positionOf = (id: number) => sent.find((b) => b.id === id)!.position;

    expect(positionOf(10)).toBeGreaterThan(positionOf(11));
    // And the header block nobody touched stays exactly where it was.
    expect(positionOf(13)).toBe(0);
  });

  it('leaves rows on other surfaces alone when reordering Home', async () => {
    fetchAdminPageBlocks.mockImplementation(async (app: string) => ({
      app,
      page: 'home',
      blocks: [
        {
          id: 13, app: 'website', page: 'home', block_type: 'announcement', position: 0,
          is_enabled: true, content_mode: 'own', settings: { placement_desktop: 'header' },
          label: 'Announcement banner', description: '', removable: true, supports_shared_content: false,
        },
        {
          id: 10, app: 'website', page: 'home', block_type: 'hero', position: 1,
          is_enabled: true, content_mode: 'own', settings: {},
          label: 'Hero banner', description: '', removable: false, supports_shared_content: false,
        },
        {
          id: 11, app: 'website', page: 'home', block_type: 'trust_strip', position: 2,
          is_enabled: true, content_mode: 'own', settings: {},
          label: 'Trust strip', description: '', removable: true, supports_shared_content: false,
        },
      ],
      available_types: [],
      unknown_types: [],
      draft: false,
      version: 4,
      saved_at: null,
    }));
    reorderPageBlocks.mockResolvedValue({ version: 5 });

    render(
      <HomeLayoutEditor
        initialApp="website"
        surfaceFilter={{ app: 'website', device: 'desktop', slot: 'home' }}
      />,
    );
    await waitFor(() => expect(screen.getByTestId('home-components-overview')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('home-layout-reorder-toggle'));

    // The trust strip is last on screen, so Down is not offered.
    expect(screen.getByTestId('home-layout-move-down-11').hasAttribute('disabled')).toBe(true);
    // Hero is first, so Up is not offered either.
    expect(screen.getByTestId('home-layout-move-up-10').hasAttribute('disabled')).toBe(true);

    fireEvent.click(screen.getByTestId('home-layout-move-up-11'));
    await waitFor(() => expect(reorderPageBlocks).toHaveBeenCalled());
    const sent = reorderPageBlocks.mock.calls[0][0].blocks as Array<{ id: number; position: number }>;
    const positionOf = (id: number) => sent.find((b) => b.id === id)!.position;
    expect(positionOf(11)).toBeLessThan(positionOf(10));
    expect(positionOf(13)).toBe(0);
  });

  it('never lets the toolbar buttons stretch beside the text', async () => {
    // Owner sent a screenshot, 2026-08-15: on a phone, Reorder / Publish
    // changes / Discard draft had become three full-height columns with the
    // heading text crushed to one character per line beside them.
    //
    // Two causes, both assertable without a layout engine: the row let its
    // buttons stretch to the height of the text (no alignItems), and the text
    // was allowed to shrink to nothing (minWidth 0) so the row never wrapped.
    render(<HomeLayoutEditor initialApp="website" />);
    await waitFor(() => expect(screen.getByTestId('home-components-overview')).toBeInTheDocument());

    const actions = screen.getByTestId('home-layout-reorder-toggle').parentElement as HTMLElement;
    expect(actions.className).toContain('home-layout-head-actions');
    expect(actions.style.alignItems).toBe('flex-start');

    const head = actions.parentElement as HTMLElement;
    expect(head.className).toContain('home-layout-head');
    expect(head.style.alignItems).toBe('flex-start');
    expect(head.style.flexWrap).toBe('wrap');

    // The text beside them keeps a floor, so the row wraps instead of crushing it.
    const text = head.firstElementChild as HTMLElement;
    expect(Number.parseInt(text.style.minWidth, 10)).toBeGreaterThanOrEqual(200);

    // …and it must be reachable from CSS, because that floor is a WIDTH only
    // while the header is a row. Stacked into a column the same flex-basis
    // becomes a height, which opened a gap between "Draft saved" and Reorder.
    expect(text.className).toContain('home-layout-head-text');
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
    expect(screen.getByTestId('home-layout-surface-count').textContent).toMatch(/2 configured/);
    expect(screen.getByTestId('home-components-overview').getAttribute('data-surface-component-count')).toBe('2');

    // Exactly the two enabled header instances — not the type library / Not added rows.
    const rows = screen.getByTestId('home-components-overview').querySelectorAll('[data-testid^="home-layout-block-"]');
    expect(rows).toHaveLength(2);
    expect(screen.getByTestId('home-layout-block-website.mobile.header.12')).toBeTruthy();
    expect(screen.getByTestId('home-layout-block-website.mobile.header.13')).toBeTruthy();
    expect(screen.queryByText('Not added')).toBeNull();
    expect(screen.queryByTestId('home-layout-block-hero')).toBeNull();
    expect(screen.queryByTestId('home-layout-block-mode_cards')).toBeNull();
    expect(screen.getByTestId('home-layout-hidden-website.mobile.header.14')).toBeTruthy();
    expect(screen.getByTestId('home-layout-app-label').textContent).toMatch(/Website/);
  });

  it('add picker lists only allowed types not already configured', async () => {
    render(
      <HomeLayoutEditor
        surfaceFilter={{ app: 'website', device: 'mobile', slot: 'header' }}
      />,
    );
    await waitFor(() => expect(screen.getByTestId('home-layout-add-component')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('home-layout-add-component'));
    const picker = await screen.findByTestId('home-layout-add-picker-list');
    expect(within(picker).queryByTestId('home-layout-add-type-prayer_bar')).toBeNull();
    expect(within(picker).queryByTestId('home-layout-add-type-announcement')).toBeNull();
    expect(within(picker).getByTestId('home-layout-add-type-opening_status')).toBeTruthy();
  });

  it('shows empty state when a surface has zero components', async () => {
    render(
      <HomeLayoutEditor
        surfaceFilter={{ app: 'website', device: 'mobile', slot: 'bottom_navigation' }}
      />,
    );
    await waitFor(() => expect(screen.getByTestId('home-layout-surface-empty')).toBeInTheDocument());
    expect(screen.getByTestId('home-layout-surface-count').textContent).toMatch(/0 configured/);
  });

  it('keeps Website mobile header components off home and desktop header unless placed there', async () => {
    render(
      <HomeLayoutEditor
        surfaceFilter={{ app: 'website', device: 'mobile', slot: 'home' }}
      />,
    );
    await waitFor(() => expect(screen.getByTestId('home-components-overview')).toBeInTheDocument());
    expect(screen.queryByTestId('home-layout-block-website.mobile.header.12')).toBeNull();
    expect(screen.queryByTestId('home-layout-block-website.mobile.header.13')).toBeNull();
    // Default placement home: hero + trust_strip
    expect(screen.getByTestId('home-layout-block-website.mobile.home.10')).toBeTruthy();
    expect(screen.getByTestId('home-layout-block-website.mobile.home.11')).toBeTruthy();
  });

  it('loads only Website blocks for Website surfaces — never Order App instances', async () => {
    render(
      <HomeLayoutEditor
        surfaceFilter={{ app: 'website', device: 'mobile', slot: 'header' }}
      />,
    );
    await waitFor(() => expect(screen.getByTestId('home-components-overview')).toBeInTheDocument());
    expect(fetchAdminPageBlocks).toHaveBeenCalledWith('website');
    expect(fetchAdminPageBlocks).not.toHaveBeenCalledWith('order_app');
    expect(screen.queryByText('Order mode cards')).toBeNull();
  });

  it('adds a component to the selected surface and refreshes the configured count', async () => {
    createPageBlock.mockResolvedValue({
      block: {
        id: 99,
        block_type: 'opening_status',
        is_enabled: true,
        settings: { show_mobile: true, placement_mobile: 'header' },
      },
      draft: true,
      version: 1,
    });
    fetchAdminPageBlocks
      .mockResolvedValueOnce({
        app: 'website',
        page: 'home',
        blocks: blocksFor('website'),
        available_types: [
          { type: 'opening_status', label: 'Opening status', description: '', apps: ['website'], removable: true, supports_shared_content: false },
          { type: 'prayer_bar', label: 'Prayer', description: '', apps: ['website'], removable: true, supports_shared_content: false },
          { type: 'announcement', label: 'Announcement', description: '', apps: ['website'], removable: true, supports_shared_content: false },
          { type: 'greeting', label: 'Greeting', description: '', apps: ['website'], removable: true, supports_shared_content: false },
        ],
        draft: false,
        version: 0,
      })
      .mockResolvedValueOnce({
        app: 'website',
        page: 'home',
        blocks: [
          ...blocksFor('website'),
          {
            id: 99,
            app: 'website',
            page: 'home',
            block_type: 'opening_status',
            position: 5,
            is_enabled: true,
            content_mode: 'own',
            settings: { show_mobile: true, placement_mobile: 'header', show_desktop: false, placement_desktop: 'home' },
            label: 'Opening status',
            description: '',
            removable: true,
            supports_shared_content: false,
          },
        ],
        available_types: [
          { type: 'opening_status', label: 'Opening status', description: '', apps: ['website'], removable: true, supports_shared_content: false },
        ],
        draft: true,
        version: 1,
      });

    render(
      <HomeLayoutEditor
        surfaceFilter={{ app: 'website', device: 'mobile', slot: 'header' }}
      />,
    );
    await waitFor(() => expect(screen.getByTestId('home-layout-surface-count').textContent).toMatch(/2 configured/));
    fireEvent.click(screen.getByTestId('home-layout-add-component'));
    fireEvent.click(await screen.findByTestId('home-layout-add-type-opening_status'));
    await waitFor(() => expect(createPageBlock).toHaveBeenCalledWith(
      expect.objectContaining({
        app: 'website',
        block_type: 'opening_status',
        settings: expect.objectContaining({
          show_mobile: true,
          placement_mobile: 'header',
          show_desktop: false,
        }),
      }),
    ));
    await waitFor(() => expect(screen.getByTestId('home-layout-surface-count').textContent).toMatch(/3 configured/));
    expect(screen.getByTestId('home-layout-block-website.mobile.header.99')).toBeTruthy();
  });

  it('rejects adding a singleton already on the surface', async () => {
    render(
      <HomeLayoutEditor
        surfaceFilter={{ app: 'website', device: 'mobile', slot: 'header' }}
      />,
    );
    await waitFor(() => expect(screen.getByTestId('home-layout-add-component')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('home-layout-add-component'));
    expect(screen.queryByTestId('home-layout-add-type-prayer_bar')).toBeNull();
  });

  it('shows singleton duplicate warning with component ids', async () => {
    fetchAdminPageBlocks.mockImplementation(async () => ({
      app: 'website',
      page: 'home',
      blocks: [
        ...blocksFor('website'),
        {
          id: 88,
          app: 'website',
          page: 'home',
          block_type: 'prayer_bar',
          position: 6,
          is_enabled: true,
          content_mode: 'own',
          settings: { show_mobile: true, placement_mobile: 'header' },
          label: 'Prayer dup',
          description: '',
          removable: true,
          supports_shared_content: false,
        },
      ],
      available_types: [
        { type: 'prayer_bar', label: 'Prayer', description: '', apps: ['website'], removable: true, supports_shared_content: false },
      ],
      draft: false,
      version: 0,
    }));
    render(
      <HomeLayoutEditor
        surfaceFilter={{ app: 'website', device: 'mobile', slot: 'header' }}
      />,
    );
    await waitFor(() => expect(screen.getByTestId('home-layout-singleton-warning')).toBeInTheDocument());
    expect(screen.getByTestId('home-layout-singleton-warning').textContent).toMatch(/Duplicate components need review/);
    expect(screen.getByTestId('home-layout-singleton-warning').textContent).toMatch(/website\.mobile\.header\.12/);
    expect(screen.getByTestId('home-layout-singleton-warning').textContent).toMatch(/website\.mobile\.header\.88/);
  });

  it('keep-this resolution hides other duplicate instances without deleting', async () => {
    fetchAdminPageBlocks.mockImplementation(async () => ({
      app: 'website',
      page: 'home',
      blocks: [
        ...blocksFor('website'),
        {
          id: 88,
          app: 'website',
          page: 'home',
          block_type: 'prayer_bar',
          position: 6,
          is_enabled: true,
          content_mode: 'own',
          settings: { show_mobile: true, placement_mobile: 'header' },
          label: 'Prayer dup',
          description: '',
          removable: true,
          supports_shared_content: false,
        },
      ],
      available_types: [
        { type: 'prayer_bar', label: 'Prayer', description: '', apps: ['website'], removable: true, supports_shared_content: false },
      ],
      draft: false,
      version: 0,
    }));
    updatePageBlock.mockResolvedValue({
      block: { id: 88, is_enabled: false, block_type: 'prayer_bar' },
      draft: true,
      version: 1,
    });
    render(
      <HomeLayoutEditor
        surfaceFilter={{ app: 'website', device: 'mobile', slot: 'header' }}
      />,
    );
    await waitFor(() => expect(screen.getByTestId('home-layout-keep-singleton-12')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('home-layout-keep-singleton-12'));
    await waitFor(() => expect(updatePageBlock).toHaveBeenCalledWith(
      88,
      expect.objectContaining({ is_enabled: false, app: 'website' }),
    ));
    expect(deletePageBlock).not.toHaveBeenCalled();
  });
});
