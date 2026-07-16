import { useState } from 'react';
import type { MenuCategory } from '../api';
import {
  Badge, Btn, Card, ConfirmDialog, EmptyState, ErrorMsg, Input, Modal, PageHeader, Spinner,
} from '../components/Layout';
import { usePageTitle } from '../hooks/usePageTitle';
import { Field, FormTextarea, ImageUploadField } from './MenuPage/menuFormPrimitives';
import { MenuItemEditorModal } from './MenuPage/MenuItemEditorModal';
import { MenuItemTable } from './MenuPage/MenuItemTable';
import { EMPTY_CAT, type CatForm, useMenuPage, type View } from './MenuPage/useMenuPage';

function CategoryFormModal({
  initial, title, onSave, onClose, categories, editingId,
}: {
  initial: CatForm;
  title: string;
  onSave: (f: CatForm) => Promise<void>;
  onClose: () => void;
  categories: MenuCategory[];
  editingId?: number;
}) {
  const [form, setForm] = useState<CatForm>(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const set = <K extends keyof CatForm>(k: K, v: CatForm[K]) => setForm((f) => ({ ...f, [k]: v }));

  const parentOptions = categories.filter(
    (c) => !c.parent_id && c.id !== editingId
  );

  const handleSave = async () => {
    if (!form.name.trim()) { setError('Category name is required.'); return; }
    setError(''); setLoading(true);
    try { await onSave(form); }
    catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  };

  const selectStyle: React.CSSProperties = {
    width: '100%', border: '1px solid #E8E0D8', borderRadius: 9,
    padding: '9px 12px', fontSize: 14, fontFamily: 'inherit',
    background: '#fff', cursor: 'pointer', boxSizing: 'border-box',
  };

  return (
    <Modal title={title} onClose={onClose}>
      {error && <ErrorMsg message={error} />}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Name (English)">
            <Input value={form.name} onChange={(v) => set('name', v)} placeholder="e.g. Grills" />
          </Field>
          <Field label="Name (Dhivehi) — optional">
            <Input value={form.name_dv} onChange={(v) => set('name_dv', v)} placeholder="ދިވެހި" />
          </Field>
        </div>
        <Field label="Parent Category — optional">
          <select value={form.parent_id} onChange={(e) => set('parent_id', e.target.value)} style={selectStyle}>
            <option value="">— None (top-level category) —</option>
            {parentOptions.map((c) => (
              <option key={c.id} value={String(c.id)}>{c.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Description">
          <FormTextarea value={form.description} onChange={(v) => set('description', v)} placeholder="Short description…" rows={2} />
        </Field>
        <Field label="Image">
          <ImageUploadField value={form.image_url} onChange={(v) => set('image_url', v)} />
        </Field>
        <div className="form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Sort Order">
            <Input value={form.sort_order} onChange={(v) => set('sort_order', v)} type="number" placeholder="0" />
          </Field>
          <Field label="Status">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, height: 38, cursor: 'pointer', fontSize: 14 }}>
              <input type="checkbox" checked={form.is_active} onChange={(e) => set('is_active', e.target.checked)} />
              Active (visible to customers)
            </label>
          </Field>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn onClick={handleSave} disabled={loading}>{loading ? 'Saving…' : 'Save Category'}</Btn>
      </div>
    </Modal>
  );
}

export function MenuPage() {
  usePageTitle('Menu');
  const m = useMenuPage();

  return (
    <>
      <ConfirmDialog state={m.dlg} close={m.closeDlg} />
      <PageHeader
        title="Menu Management"
        subtitle="Categories, items, prices and availability"
        action={
          m.canManage
            ? (m.view === 'categories'
              ? <Btn onClick={() => m.setCreatingCat(true)}>+ New Category</Btn>
              : <Btn onClick={() => m.setCreatingItem(true)}>+ New Item</Btn>)
            : undefined
        }
      />

      {m.error && <ErrorMsg message={m.error} />}

      <div style={{ display: 'flex', gap: 0, marginBottom: 24, borderBottom: '2px solid #E8E0D8' }}>
        {(['categories', 'items'] as View[]).map((t) => (
          <button key={t} onClick={() => m.setView(t)} style={{
            padding: '10px 22px', fontSize: 14, fontWeight: m.view === t ? 700 : 400,
            color: m.view === t ? '#D4813A' : '#9C8E7E',
            background: 'none', border: 'none', cursor: 'pointer', textTransform: 'capitalize',
            borderBottom: m.view === t ? '2px solid #D4813A' : '2px solid transparent',
            marginBottom: -2, fontFamily: 'inherit',
          }}>
            {t === 'categories' ? `Categories (${m.categories.length})` : 'Items'}
          </button>
        ))}
      </div>

      {m.view === 'categories' && (
        m.loading && m.categories.length === 0 ? <Spinner /> :
        m.categories.length === 0 ? (
          <Card><EmptyState message="No categories yet. Add your first one." /></Card>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {m.categories.filter((c) => !c.parent_id).map((cat) => (
              <div key={cat.id}>
                <Card style={{ padding: '14px 18px' }}>
                  <div className="menu-cat-row" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    {cat.image_url && (
                      <img src={cat.image_url} alt={cat.name}
                        style={{ width: 52, height: 52, objectFit: 'cover', borderRadius: 10, flexShrink: 0 }}
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 2 }}>
                        <span style={{ fontWeight: 700, fontSize: 15 }}>{cat.name}</span>
                        {cat.name_dv && <span style={{ color: '#94a3b8', fontSize: 13 }}>{cat.name_dv}</span>}
                        <Badge label={cat.is_active ? 'Active' : 'Hidden'} color={cat.is_active ? 'green' : 'gray'} />
                      </div>
                      {cat.description && (
                        <p style={{ fontSize: 13, color: '#6B5D4F', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {cat.description}
                        </p>
                      )}
                      <p style={{ fontSize: 12, color: '#94a3b8', margin: '2px 0 0' }}>
                        Sort: {cat.sort_order ?? 0} · {cat.items?.length ?? '?'} items
                      </p>
                    </div>
                    <div className="menu-cat-actions" style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                      {m.canManage && (
                        <>
                      <Btn small variant="ghost" onClick={() => m.handleToggleCat(cat)}>
                        {cat.is_active ? 'Hide' : 'Show'}
                      </Btn>
                      <Btn small variant="secondary" onClick={() => m.setEditingCat(cat)}>Edit</Btn>
                      <Btn small variant="danger" onClick={() => m.handleDeleteCat(cat.id)}>Delete</Btn>
                        </>
                      )}
                    </div>
                  </div>
                </Card>
                {m.categories.filter((c) => c.parent_id === cat.id).map((sub) => (
                  <div className="menu-subcat-card">
                  <Card key={sub.id} style={{ padding: '12px 18px', marginTop: 6, marginLeft: 28, borderLeft: '3px solid #E8E0D8' }}>
                    <div className="menu-cat-row" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                      <span style={{ fontSize: 16, color: '#94a3b8', flexShrink: 0 }}>↳</span>
                      {sub.image_url && (
                        <img src={sub.image_url} alt={sub.name}
                          style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 8, flexShrink: 0 }}
                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 2 }}>
                          <span style={{ fontWeight: 600, fontSize: 14 }}>{sub.name}</span>
                          {sub.name_dv && <span style={{ color: '#94a3b8', fontSize: 13 }}>{sub.name_dv}</span>}
                          <Badge label={sub.is_active ? 'Active' : 'Hidden'} color={sub.is_active ? 'green' : 'gray'} />
                        </div>
                        <p style={{ fontSize: 12, color: '#94a3b8', margin: 0 }}>
                          Sort: {sub.sort_order ?? 0} · {sub.items?.length ?? '?'} items
                        </p>
                      </div>
                      <div className="menu-cat-actions" style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                        {m.canManage && (
                          <>
                        <Btn small variant="ghost" onClick={() => m.handleToggleCat(sub)}>
                          {sub.is_active ? 'Hide' : 'Show'}
                        </Btn>
                        <Btn small variant="secondary" onClick={() => m.setEditingCat(sub)}>Edit</Btn>
                        <Btn small variant="danger" onClick={() => m.handleDeleteCat(sub.id)}>Delete</Btn>
                          </>
                        )}
                      </div>
                    </div>
                  </Card>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )
      )}

      {m.view === 'items' && (
        <MenuItemTable
          categories={m.categories}
          items={m.items}
          loading={m.loading}
          canManage={m.canManage}
          menuGroups={m.menuGroups}
          activeMenuGroupIds={m.activeMenuGroupIds}
          kitchenSaving={m.kitchenSaving}
          selectedCat={m.selectedCat}
          search={m.search}
          page={m.page}
          lastPage={m.lastPage}
          perPage={m.perPage}
          onSelectedCatChange={m.setSelectedCat}
          onSearchChange={m.setSearch}
          onPerPageChange={m.handlePerPageChange}
          onPageChange={m.handlePageChange}
          onToggleKitchenGroup={m.toggleKitchenGroup}
          onSaveKitchenDuty={m.saveKitchenDuty}
          onToggleAvail={m.handleToggleAvail}
          onEditItem={m.setEditingItem}
          onDeleteItem={m.handleDeleteItem}
          onBarcodeLabel={m.handleBarcodeLabel}
          onViewRecipe={m.handleViewRecipe}
        />
      )}

      {m.creatingCat && (
        <CategoryFormModal
          initial={EMPTY_CAT}
          title="New Category"
          onSave={m.handleCreateCat}
          onClose={() => m.setCreatingCat(false)}
          categories={m.categories}
        />
      )}
      {m.editingCat && (
        <CategoryFormModal
          key={m.editingCat.id}
          initial={{
            name: m.editingCat.name, name_dv: m.editingCat.name_dv ?? '',
            description: m.editingCat.description ?? '', image_url: m.editingCat.image_url ?? '',
            sort_order: m.editingCat.sort_order != null ? String(m.editingCat.sort_order) : '',
            is_active: m.editingCat.is_active,
            parent_id: m.editingCat.parent_id != null ? String(m.editingCat.parent_id) : '',
          }}
          title={`Edit: ${m.editingCat.name}`}
          onSave={m.handleUpdateCat}
          onClose={() => m.setEditingCat(null)}
          categories={m.categories}
          editingId={m.editingCat.id}
        />
      )}
      {m.creatingItem && (
        <MenuItemEditorModal
          initial={m.emptyItemForm}
          title="New Menu Item"
          categories={m.categories}
          menuGroups={m.defaultMenuGroups}
          onSave={m.handleCreateItem}
          onClose={() => m.setCreatingItem(false)}
        />
      )}
      {m.editingItem && (
        <MenuItemEditorModal
          key={m.editingItem.id}
          initial={m.itemToForm(m.editingItem)}
          title={`Edit: ${m.editingItem.name}`}
          categories={m.categories}
          menuGroups={m.defaultMenuGroups}
          onSave={m.handleUpdateItem}
          onClose={() => m.setEditingItem(null)}
          itemId={m.editingItem.id}
        />
      )}

      {m.recipeItem && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 28, maxWidth: 480, width: '90%', boxShadow: '0 20px 60px rgba(0,0,0,0.25)', maxHeight: '80vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>Recipe — {m.recipeItem.name}</h3>
              <button onClick={() => m.setRecipeItem(null)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#9C8E7E' }}>×</button>
            </div>
            {!m.recipeItem.recipe ? (
              <p style={{ color: '#9C8E7E', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>No recipe defined for this item.</p>
            ) : (m.recipeItem.recipe.recipe_items ?? []).length === 0 ? (
              <p style={{ color: '#9C8E7E', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>Recipe exists but has no ingredients.</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>
                  <th style={{ textAlign: 'left', padding: '8px 10px', fontSize: 12, color: '#9C8E7E', borderBottom: '1px solid #F0EAE3' }}>Ingredient</th>
                  <th style={{ textAlign: 'left', padding: '8px 10px', fontSize: 12, color: '#9C8E7E', borderBottom: '1px solid #F0EAE3' }}>Qty</th>
                  <th style={{ textAlign: 'left', padding: '8px 10px', fontSize: 12, color: '#9C8E7E', borderBottom: '1px solid #F0EAE3' }}>Unit</th>
                </tr></thead>
                <tbody>
                  {(m.recipeItem.recipe.recipe_items ?? []).map((ri) => (
                    <tr key={ri.id}>
                      <td style={{ padding: '10px', fontSize: 13, borderBottom: '1px solid #F8F4F0', fontWeight: 600 }}>
                        {ri.inventory_item?.name ?? '—'}
                      </td>
                      <td style={{ padding: '10px', fontSize: 13, borderBottom: '1px solid #F8F4F0' }}>{ri.quantity}</td>
                      <td style={{ padding: '10px', fontSize: 13, borderBottom: '1px solid #F8F4F0', color: '#9C8E7E' }}>
                        {ri.unit ?? ri.inventory_item?.unit ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {m.barcodeLabel && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 32, maxWidth: 360, width: '90%', textAlign: 'center', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
            <h3 style={{ margin: '0 0 20px', fontSize: 16, fontWeight: 800 }}>Barcode Label</h3>
            <div style={{ border: '2px solid #E8E0D8', borderRadius: 12, padding: 20, marginBottom: 20 }}>
              <p style={{ margin: '0 0 8px', fontWeight: 700, fontSize: 16 }}>{m.barcodeLabel.name}</p>
              {m.barcodeLabel.barcode && (
                <p style={{ margin: '0 0 4px', fontFamily: 'monospace', fontSize: 18, letterSpacing: 3, color: '#1C1408' }}>{m.barcodeLabel.barcode}</p>
              )}
              {m.barcodeLabel.sku && <p style={{ margin: '0 0 4px', fontSize: 12, color: '#9C8E7E' }}>SKU: {m.barcodeLabel.sku}</p>}
              <p style={{ margin: 0, fontWeight: 700, fontSize: 20, color: '#D4813A' }}>
                MVR {Number(m.barcodeLabel.price).toFixed(2)}
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
              <button
                onClick={() => { window.print(); }}
                style={{ padding: '10px 20px', background: '#D4813A', color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
              >
                🖨 Print
              </button>
              <button
                onClick={() => m.setBarcodeLabel(null)}
                style={{ padding: '10px 20px', background: 'transparent', border: '1.5px solid #E8E0D8', borderRadius: 10, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
