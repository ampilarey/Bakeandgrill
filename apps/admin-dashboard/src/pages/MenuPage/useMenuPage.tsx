import { useEffect, useState } from 'react';
import {
  fetchAdminCategories, createCategory, updateCategory, deleteCategory,
  fetchAdminItems, createItem, updateItem, deleteItem, toggleItemAvailability,
  getBarcodeLabel, getItemWithRecipe,
  fetchMenuGroups, getKitchenMenuState, updateKitchenMenuState,
  type MenuCategory, type MenuItem, type BarcodeLabel, type ItemWithRecipe,
  type MenuGroupRow,
} from '../../api';
import { useConfirmDialog } from '../../components/Layout';
import { useCurrentUserPermissions } from '../../hooks/usePermissions';
import { emptyItemForm, formToPayload, itemToForm, type ItemForm } from './menuItemForm';

export type CatForm = {
  name: string; name_dv: string; description: string;
  image_url: string; sort_order: string; is_active: boolean;
  parent_id: string;
};

export const EMPTY_CAT: CatForm = { name: '', name_dv: '', description: '', image_url: '', sort_order: '', is_active: true, parent_id: '' };

export type View = 'categories' | 'items';

export function useMenuPage() {
  const { can } = useCurrentUserPermissions();
  const canManage = can('menu.manage');
  const [view, setView] = useState<View>('categories');
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [selectedCat, setSelectedCat] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [perPage, setPerPage] = useState(25);

  const { state: dlg, ask: askConfirm, close: closeDlg } = useConfirmDialog();
  const [editingCat, setEditingCat] = useState<MenuCategory | null>(null);
  const [creatingCat, setCreatingCat] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [creatingItem, setCreatingItem] = useState(false);
  const [barcodeLabel, setBarcodeLabel] = useState<BarcodeLabel | null>(null);
  const [recipeItem, setRecipeItem] = useState<ItemWithRecipe | null>(null);
  const [menuGroups, setMenuGroups] = useState<MenuGroupRow[]>([]);
  const [activeMenuGroupIds, setActiveMenuGroupIds] = useState<number[]>([1]);
  const [kitchenSaving, setKitchenSaving] = useState(false);

  const loadCategories = async () => {
    setLoading(true);
    try {
      const res = await fetchAdminCategories();
      setCategories(res.data ?? []);
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  };

  const loadItems = async (p = page) => {
    setLoading(true);
    try {
      const res = await fetchAdminItems({
        category_id: selectedCat ?? undefined,
        search: search || undefined,
        page: p,
        per_page: perPage,
      });
      setItems(res.data ?? []);
      setLastPage(res.meta?.last_page ?? 1);
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  };

  useEffect(() => { void loadCategories(); }, []);
  useEffect(() => {
    if (view !== 'items') return;
    void (async () => {
      try {
        const [mg, ks] = await Promise.all([fetchMenuGroups(), getKitchenMenuState()]);
        setMenuGroups(mg.data);
        setActiveMenuGroupIds(ks.kitchen_menu_state.active_menu_group_ids?.length ? ks.kitchen_menu_state.active_menu_group_ids : [1]);
      } catch { /* ignore */ }
    })();
  }, [view]);
  useEffect(() => {
    if (view === 'items') { setPage(1); void loadItems(1); }
  }, [view, selectedCat, search, perPage]);

  const handleCreateCat = async (form: CatForm) => {
    try {
      await createCategory({
        name: form.name.trim(), name_dv: form.name_dv.trim() || null,
        description: form.description.trim() || null,
        image_url: form.image_url.trim() || null,
        sort_order: form.sort_order !== '' ? parseInt(form.sort_order) : null,
        parent_id: form.parent_id !== '' ? parseInt(form.parent_id) : null,
      });
      setCreatingCat(false);
      await loadCategories();
    } catch (e) { setError((e as Error).message); }
  };

  const handleUpdateCat = async (form: CatForm) => {
    if (!editingCat) return;
    try {
      await updateCategory(editingCat.id, {
        name: form.name.trim(), name_dv: form.name_dv.trim() || null,
        description: form.description.trim() || null,
        image_url: form.image_url.trim() || null,
        sort_order: form.sort_order !== '' ? parseInt(form.sort_order) : null,
        is_active: form.is_active,
        parent_id: form.parent_id !== '' ? parseInt(form.parent_id) : null,
      });
      setEditingCat(null);
      await loadCategories();
    } catch (e) { setError((e as Error).message); }
  };

  const handleDeleteCat = (id: number) => {
    askConfirm({
      title: 'Delete Category',
      message: 'Delete this category? It must have no items assigned.',
      confirmLabel: 'Delete',
      danger: true,
      onConfirm: async () => {
        try { await deleteCategory(id); await loadCategories(); }
        catch (e) { setError((e as Error).message); }
      },
    });
  };

  const handleToggleCat = async (cat: MenuCategory) => {
    try {
      await updateCategory(cat.id, { is_active: !cat.is_active });
      await loadCategories();
    } catch (e) { setError((e as Error).message); }
  };

  const handleCreateItem = async (form: ItemForm) => {
    try {
      await createItem(formToPayload(form, false));
      setCreatingItem(false);
      await loadItems();
    } catch (e) { setError((e as Error).message); }
  };

  const handleUpdateItem = async (form: ItemForm) => {
    if (!editingItem) return;
    try {
      await updateItem(editingItem.id, formToPayload(form, true));
      setEditingItem(null);
      await loadItems();
    } catch (e) { setError((e as Error).message); }
  };

  const toggleKitchenGroup = (id: number) => {
    setActiveMenuGroupIds((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      return next.length ? next : prev;
    });
  };

  const saveKitchenDuty = async () => {
    setKitchenSaving(true);
    try {
      await updateKitchenMenuState(activeMenuGroupIds);
    } catch (e) { setError((e as Error).message); }
    finally { setKitchenSaving(false); }
  };

  const handleDeleteItem = (id: number) => {
    askConfirm({
      title: 'Delete Item',
      message: 'Delete this menu item? This cannot be undone.',
      confirmLabel: 'Delete',
      danger: true,
      onConfirm: async () => {
        try { await deleteItem(id); await loadItems(); }
        catch (e) { setError((e as Error).message); }
      },
    });
  };

  const handleToggleAvail = async (item: MenuItem) => {
    try {
      await toggleItemAvailability(item.id);
      await loadItems();
    } catch (e) { setError((e as Error).message); }
  };

  const handlePerPageChange = (nextPerPage: number) => {
    setPerPage(nextPerPage);
    setPage(1);
    void loadItems(1);
  };

  const handlePageChange = (p: number) => {
    setPage(p);
    void loadItems(p);
  };

  const handleBarcodeLabel = (itemId: number) => {
    getBarcodeLabel(itemId)
      .then((res) => setBarcodeLabel(res.label))
      .catch((e: Error) => setError(e.message));
  };

  const handleViewRecipe = (itemId: number) => {
    getItemWithRecipe(itemId)
      .then((res) => setRecipeItem(res.item))
      .catch((e: Error) => setError(e.message));
  };

  const defaultMenuGroups = menuGroups.length ? menuGroups : [{ id: 1, name: 'Default', slug: 'default', sort_order: 0, is_active: true }];

  return {
    canManage,
    view,
    setView,
    categories,
    items,
    loading,
    error,
    selectedCat,
    setSelectedCat,
    search,
    setSearch,
    page,
    lastPage,
    perPage,
    dlg,
    closeDlg,
    editingCat,
    setEditingCat,
    creatingCat,
    setCreatingCat,
    editingItem,
    setEditingItem,
    creatingItem,
    setCreatingItem,
    barcodeLabel,
    setBarcodeLabel,
    recipeItem,
    setRecipeItem,
    menuGroups,
    activeMenuGroupIds,
    kitchenSaving,
    defaultMenuGroups,
    emptyItemForm: emptyItemForm(selectedCat),
    handleCreateCat,
    handleUpdateCat,
    handleDeleteCat,
    handleToggleCat,
    handleCreateItem,
    handleUpdateItem,
    toggleKitchenGroup,
    saveKitchenDuty,
    handleDeleteItem,
    handleToggleAvail,
    handlePerPageChange,
    handlePageChange,
    handleBarcodeLabel,
    handleViewRecipe,
    itemToForm,
  };
}
