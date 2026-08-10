import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HomeLayoutEditor } from './HomeLayoutEditor';

const fetchAdminPageBlocks = vi.fn();
const reorderPageBlocks = vi.fn();
const updatePageBlock = vi.fn();
const deletePageBlock = vi.fn();
const createPageBlock = vi.fn();
const createPageBlockPreviewToken = vi.fn();

vi.mock('../../api/pageBlocks', () => ({
  fetchAdminPageBlocks: (...args: unknown[]) => fetchAdminPageBlocks(...args),
  reorderPageBlocks: (...args: unknown[]) => reorderPageBlocks(...args),
  updatePageBlock: (...args: unknown[]) => updatePageBlock(...args),
  deletePageBlock: (...args: unknown[]) => deletePageBlock(...args),
  createPageBlock: (...args: unknown[]) => createPageBlock(...args),
  createPageBlockPreviewToken: (...args: unknown[]) => createPageBlockPreviewToken(...args),
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
    }));
    createPageBlock.mockResolvedValue({ block: { id: 99, block_type: 'rich_text' } });
    updatePageBlock.mockImplementation(async (id: number, payload: Record<string, unknown>) => ({
      block: { id, ...payload },
    }));
  });

  it('explains why mode cards cannot be removed', async () => {
    render(<HomeLayoutEditor />);
    fireEvent.click(screen.getByTestId('home-layout-tab-order_app'));
    await waitFor(() => {
      expect(screen.getByTestId('home-layout-block-mode_cards').textContent).toMatch(/only way into ordering/i);
    });
    expect(screen.getByRole('button', { name: 'Remove' })).toBeDisabled();
  });

  it('loads each app independently when tabs are clicked', async () => {
    render(<HomeLayoutEditor />);
    await waitFor(() => expect(fetchAdminPageBlocks).toHaveBeenCalledWith('website'));
    fireEvent.click(screen.getByTestId('home-layout-tab-order_app'));
    await waitFor(() => expect(fetchAdminPageBlocks).toHaveBeenCalledWith('order_app'));
  });

  it('edits and saves a generic block’s content in place', async () => {
    render(<HomeLayoutEditor />);
    await waitFor(() => expect(screen.getByTestId('home-layout-edit-11')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('home-layout-edit-11'));
    const heading = await screen.findByLabelText('Heading');
    expect(heading).toHaveValue('Our story');

    fireEvent.change(heading, { target: { value: 'Our newer story' } });
    fireEvent.click(screen.getByTestId('home-layout-save-settings-rich_text'));

    await waitFor(() =>
      expect(updatePageBlock).toHaveBeenCalledWith(11, {
        settings: { heading: 'Our newer story', body: 'Baked daily.' },
      }),
    );
  });

  it('keeps repeatable types in the add list once they are already used', async () => {
    render(<HomeLayoutEditor />);
    await waitFor(() => expect(screen.getByTestId('home-layout-block-rich_text')).toBeInTheDocument());

    expect(screen.getByRole('option', { name: 'Text block' })).toBeInTheDocument();
  });

  it('does not offer a content form for named sections', async () => {
    render(<HomeLayoutEditor />);
    await waitFor(() => expect(screen.getByTestId('home-layout-block-hero')).toBeInTheDocument());

    expect(screen.queryByTestId('home-layout-edit-10')).not.toBeInTheDocument();
  });

  it('shouts when a home page has no sections at all', async () => {
    fetchAdminPageBlocks.mockResolvedValue({
      app: 'website',
      page: 'home',
      blocks: [],
      available_types: [],
      unknown_types: [],
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
});
