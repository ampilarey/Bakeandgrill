import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

/* Owner, 2026-11-08: "when save recipe is clicked, box does not go automatically". */
const api = vi.hoisted(() => ({
  fetchAdminCategories: vi.fn(async () => ({ data: [] })),
  fetchAdminItems: vi.fn(async () => ({ data: [], meta: { current_page: 1, last_page: 1, total: 0 } })),
  fetchMenuGroups: vi.fn(async () => ({ data: [] })),
  getKitchenMenuState: vi.fn(async () => ({ kitchen_menu_state: { active_menu_group_ids: [1] } })),
  getItemWithRecipe: vi.fn(async () => ({ item: { id: 4, name: 'Red Bull', base_price: 50, recipe_cost: 36.25 } })),
  createCategory: vi.fn(), updateCategory: vi.fn(), deleteCategory: vi.fn(), createItem: vi.fn(), updateItem: vi.fn(),
  deleteItem: vi.fn(), toggleItemAvailability: vi.fn(), snoozeItem: vi.fn(), getBarcodeLabel: vi.fn(), updateKitchenMenuState: vi.fn(),
}));
vi.mock('../../api', () => api);
vi.mock('../../hooks/usePermissions', () => ({ useCurrentUserPermissions: () => ({ can: () => true, permissions: [], loading: false }) }));
const toast = vi.hoisted(() => vi.fn());
vi.mock('../../components/ui/Toast', () => ({ useOptionalToast: () => ({ toast }) }));

import { useMenuPage } from './useMenuPage';

const wrapper = ({ children }: { children: ReactNode }) => <MemoryRouter>{children}</MemoryRouter>;

describe('Recipe & cost box', () => {
  it('closes when the recipe is saved and says so with the new cost', async () => {
    const { result } = renderHook(() => useMenuPage(), { wrapper });
    act(() => result.current.handleViewRecipe(4));
    await waitFor(() => expect(result.current.recipeItem?.id).toBe(4));

    act(() => result.current.handleRecipeSaved({ id: 4, name: 'Red Bull', base_price: 50, recipe_cost: 36.25 } as never));

    expect(result.current.recipeItem).toBeNull();
    expect(toast).toHaveBeenCalledWith('success', 'Recipe saved for Red Bull · cost MVR 36.25');
  });
});
