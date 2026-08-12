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

describe('HomeLayoutEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchAdminPageBlocks.mockImplementation(async (app: string) => ({
      app,
      page: 'home',
      blocks: app === 'order_app'
        ? [
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
              removable: false,
              non_removable_reason: 'These cards are the only way into ordering. Removing them would remove checkout.',
              supports_shared_content: false,
            },
          ]
        : [
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
              block_type: 'rich_text',
              position: 1,
              is_enabled: true,
              content_mode: 'own',
              settings: { heading: 'Our story', body: 'Baked daily.' },
              label: 'Text block',
              description: 'A heading and a paragraph',
              removable: true,
              supports_shared_content: true,
              allows_multiple: true,
            },
          ],
      available_types: [
        {
          type: 'rich_text',
          label: 'Text block',
          description: 'A heading and a paragraph',
          apps: ['website', 'order_app'],
          removable: true,
          supports_shared_content: true,
          allows_multiple: true,
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

  it('keeps overview cards simple — no permanent Up/Down/Hide/Remove', async () => {
    render(<HomeLayoutEditor />);
    await waitFor(() => expect(screen.getByTestId('home-layout-block-hero')).toBeInTheDocument());

    expect(screen.queryByTestId('home-layout-move-up-10')).toBeNull();
    expect(screen.queryByTestId('home-layout-move-down-10')).toBeNull();
    expect(screen.queryByRole('button', { name: /^Hide$/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Remove$/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /Customise for Website/i })).toBeNull();

    expect(screen.getByTestId('home-layout-visibility-10').textContent).toMatch(/Showing/);
    expect(screen.getByTestId('home-layout-edit-10')).toBeTruthy();
    expect(screen.getByTestId('home-layout-fixed-modules')).toBeTruthy();
    expect(screen.getByTestId('home-fixed-website_prayer_header')).toBeTruthy();
    expect(screen.getByTestId('home-fixed-website_trust_strip')).toBeTruthy();
  });

  it('shows move controls only in Reorder mode', async () => {
    render(<HomeLayoutEditor />);
    await waitFor(() => expect(screen.getByTestId('home-layout-block-hero')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('home-layout-reorder-toggle'));
    expect(screen.getByTestId('home-layout-editor').getAttribute('data-reorder')).toBe('true');
    expect(screen.getByTestId('home-layout-move-up-10')).toBeTruthy();
    expect(screen.getByTestId('home-layout-move-down-10')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Hide$/i })).toBeNull();
  });

  it('opens a focused editor sheet with Show/Hide, sharing, and Remove section', async () => {
    render(<HomeLayoutEditor />);
    await waitFor(() => expect(screen.getByTestId('home-layout-edit-10')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('home-layout-edit-10'));
    const sheet = await screen.findByTestId('home-layout-section-editor');
    expect(sheet.textContent).toMatch(/Edit Hero banner/);
    expect(within(sheet).getByTestId('home-layout-visibility-switch-10')).toBeTruthy();
    expect(within(sheet).getByRole('button', { name: /Customise for Website/i })).toBeTruthy();
    expect(within(sheet).getByTestId('home-layout-remove-10')).toBeTruthy();
  });

  it('explains why mode cards cannot be removed inside the editor', async () => {
    render(<HomeLayoutEditor />);
    fireEvent.click(screen.getByTestId('home-layout-tab-order_app'));
    await waitFor(() => {
      expect(screen.getByTestId('home-layout-block-mode_cards')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('home-layout-edit-1'));
    const sheet = await screen.findByTestId('home-layout-section-editor');
    expect(sheet.textContent).toMatch(/only way into ordering/i);
    expect(within(sheet).getByTestId('home-layout-remove-1')).toBeDisabled();
  });

  it('loads each app independently when tabs are clicked', async () => {
    render(<HomeLayoutEditor />);
    await waitFor(() => expect(fetchAdminPageBlocks).toHaveBeenCalledWith('website'));
    fireEvent.click(screen.getByTestId('home-layout-tab-order_app'));
    await waitFor(() => expect(fetchAdminPageBlocks).toHaveBeenCalledWith('order_app'));
  });

  it('edits and saves a generic block’s content in the focused editor', async () => {
    render(<HomeLayoutEditor />);
    await waitFor(() => expect(screen.getByTestId('home-layout-edit-11')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('home-layout-edit-11'));
    const heading = await screen.findByLabelText('Heading');
    expect(heading).toHaveValue('Our story');

    fireEvent.change(heading, { target: { value: 'Our newer story' } });
    fireEvent.click(screen.getByTestId('home-layout-save-settings-rich_text'));

    await waitFor(() =>
      expect(updatePageBlock).toHaveBeenCalledWith(11, {
        app: 'website',
        page: 'home',
        version: 0,
        settings: { heading: 'Our newer story', body: 'Baked daily.' },
      }),
    );
  });

  it('opens on Order App tab when initialApp is order_app', async () => {
    render(<HomeLayoutEditor initialApp="order_app" />);
    await waitFor(() => expect(fetchAdminPageBlocks).toHaveBeenCalledWith('order_app'));
    await waitFor(() => expect(screen.getByTestId('home-layout-block-mode_cards')).toBeInTheDocument());
  });

  it('keeps repeatable types in the add list once they are already used', async () => {
    render(<HomeLayoutEditor />);
    await waitFor(() => expect(screen.getByTestId('home-layout-block-rich_text')).toBeInTheDocument());

    expect(screen.getByRole('option', { name: 'Text block' })).toBeInTheDocument();
  });

  it('shouts when a home page has no sections at all', async () => {
    fetchAdminPageBlocks.mockResolvedValue({
      app: 'website',
      page: 'home',
      blocks: [],
      available_types: [],
      unknown_types: [],
      draft: false,
      version: 0,
      saved_at: null,
    });
    render(<HomeLayoutEditor />);

    const warning = await screen.findByTestId('home-layout-empty-warning');
    expect(warning.textContent).toMatch(/no sections/i);
    expect(warning.textContent).toMatch(/required chrome/i);
  });

  it('does not shout when the page has sections', async () => {
    render(<HomeLayoutEditor />);
    await waitFor(() => expect(screen.getByTestId('home-layout-block-hero')).toBeInTheDocument());

    expect(screen.queryByTestId('home-layout-empty-warning')).not.toBeInTheDocument();
  });

  it('uses truthful draft wording — never mixes All published with layout draft', async () => {
    fetchAdminPageBlocks.mockResolvedValue({
      app: 'website',
      page: 'home',
      blocks: [
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
      ],
      available_types: [],
      unknown_types: [],
      draft: true,
      version: 1,
      saved_at: '2026-08-12T00:00:00Z',
    });
    render(<HomeLayoutEditor />);
    await screen.findByTestId('home-layout-draft-status');
    expect(screen.getByTestId('home-layout-draft-status').textContent).toMatch(/Draft saved — not live/);
    expect(screen.getByTestId('home-layout-draft-status').textContent).not.toMatch(/All published/);
    expect(screen.queryByText(/Unpublished layout draft/i)).toBeNull();
  });
});
