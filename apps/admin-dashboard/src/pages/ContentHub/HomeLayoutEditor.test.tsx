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
          ],
      available_types: [],
      unknown_types: [],
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
});
