import { useState } from 'react';
import type { MenuCategory } from '../api';
import {
  Badge, Btn, Card, ConfirmDialog, EmptyState, ErrorMsg, Input, Modal, ModalActions, PageHeader, PageShell, Spinner,
} from '../components/Layout';
import { usePageTitle } from '../hooks/usePageTitle';
import { Field, FormTextarea, ImageUploadField } from './MenuPage/menuFormPrimitives';
import { MenuItemEditorModal } from './MenuPage/MenuItemEditorModal';
import { MenuItemTable } from './MenuPage/MenuItemTable';
import { RecipeEditorModal } from './MenuPage/RecipeEditorModal';
import { EMPTY_CAT, type CatForm, useMenuPage, type View } from './MenuPage/useMenuPage';

function BannerLivePreview({
  label,
  maxHeight,
  name,
  description,
  imageUrl,
  compact = false,
}: {
  label: string;
  maxHeight: number;
  name: string;
  description: string;
  imageUrl: string;
  compact?: boolean;
}) {
  const titleSize = compact ? 13 : 15;
  const pad = compact ? '8px 10px' : '10px 12px';
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-text-muted)', letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 6 }}>
        {label}
      </div>
      <div
        style={{
          borderRadius: 10,
          overflow: 'hidden',
          aspectRatio: '7 / 3',
          maxHeight,
          width: '100%',
          position: 'relative',
          background: imageUrl
            ? 'var(--color-text)'
            : 'linear-gradient(135deg, #c2410c 0%, #7c2d12 100%)',
          border: '1px solid var(--color-border)',
        }}
      >
        {imageUrl ? (
          <img
            src={imageUrl}
            alt=""
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center' }}
          />
        ) : null}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'linear-gradient(180deg, rgba(28,20,8,0.05) 0%, rgba(28,20,8,0.55) 100%), linear-gradient(90deg, rgba(28,20,8,0.35) 0%, transparent 55%)',
          }}
        />
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: pad, color: '#fff' }}>
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', opacity: 0.85 }}>
            Category
          </div>
          <div style={{ fontSize: titleSize, fontWeight: 800, lineHeight: 1.2 }}>
            {name.trim() || 'Category name'}
          </div>
          {!compact && description.trim() ? (
            <div style={{ fontSize: 11, marginTop: 3, opacity: 0.92, lineHeight: 1.35 }}>
              {description.trim()}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

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
    width: '100%', border: '1px solid var(--color-border)', borderRadius: 9,
    padding: '9px 12px', fontSize: 14, fontFamily: 'inherit',
    background: 'var(--color-surface)', cursor: 'pointer', boxSizing: 'border-box',
  };

  return (
    <Modal title={title} onClose={onClose} maxWidth={640}>
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
        <Field label="Banner caption (optional)">
          <FormTextarea
            value={form.description}
            onChange={(v) => set('description', v)}
            placeholder="Short line under the title on the order-app banner…"
            rows={2}
          />
        </Field>

        <div
          style={{
            padding: 12,
            borderRadius: 12,
            border: '1px solid var(--color-border)',
            background: 'var(--color-bg)',
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text)', marginBottom: 4 }}>
            Order-app menu banner
          </div>
          <p style={{ margin: '0 0 10px', fontSize: 12, color: 'var(--color-text-secondary)', lineHeight: 1.4 }}>
            Wide 7:3 image shown above this category’s items on mobile and desktop.
            Leave empty for a branded gradient.
          </p>
          <ImageUploadField
            variant="banner"
            value={form.image_url}
            originalValue={form.image_original_url}
            onChange={({ url, original_url, thumb_url, image_webp_url, thumb_webp_url }) => {
              set('image_url', url);
              set('image_original_url', original_url);
              set('thumb_url', thumb_url ?? '');
              set('image_webp_url', image_webp_url ?? '');
              set('thumb_webp_url', thumb_webp_url ?? '');
            }}
          />
          <div
            className="form-grid-2"
            style={{
              marginTop: 12,
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 10,
              alignItems: 'end',
            }}
          >
            <BannerLivePreview
              label="Phone"
              maxHeight={140}
              name={form.name}
              description={form.description}
              imageUrl={form.image_url}
              compact
            />
            <BannerLivePreview
              label="Desktop"
              maxHeight={220}
              name={form.name}
              description={form.description}
              imageUrl={form.image_url}
            />
          </div>
          <p style={{ margin: '8px 0 0', fontSize: 11, color: 'var(--color-text-muted)' }}>
            Live preview — 7:3 crop, height-capped on phone (140px) and desktop (220px).
          </p>
        </div>

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
    <PageShell>
    <>
      <ConfirmDialog state={m.dlg} close={m.closeDlg} />
      <PageHeader section="Manage"
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

      <div style={{ display: 'flex', gap: 0, marginBottom: 24, borderBottom: '2px solid var(--color-border)' }}>
        {(['categories', 'items'] as View[]).map((t) => (
          <button key={t} onClick={() => m.setView(t)} style={{
            padding: '10px 22px', fontSize: 14, fontWeight: m.view === t ? 700 : 400,
            color: m.view === t ? 'var(--color-primary)' : 'var(--color-text-muted)',
            background: 'none', border: 'none', cursor: 'pointer', textTransform: 'capitalize',
            borderBottom: m.view === t ? '2px solid var(--color-primary)' : '2px solid transparent',
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
                      <img src={cat.thumb_url || cat.image_url} alt={cat.name}
                        style={{ width: 84, height: 36, objectFit: 'cover', borderRadius: 8, flexShrink: 0 }}
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 2 }}>
                        <span style={{ fontWeight: 700, fontSize: 15 }}>{cat.name}</span>
                        {cat.name_dv && <span style={{ color: '#94a3b8', fontSize: 13 }}>{cat.name_dv}</span>}
                        <Badge label={cat.is_active ? 'Active' : 'Hidden'} color={cat.is_active ? 'green' : 'gray'} />
                      </div>
                      {cat.description && (
                        <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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
                  <Card key={sub.id} style={{ padding: '12px 18px', marginTop: 6, marginLeft: 28, borderLeft: '3px solid var(--color-border)' }}>
                    <div className="menu-cat-row" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                      <span style={{ fontSize: 16, color: '#94a3b8', flexShrink: 0 }}>↳</span>
                      {sub.image_url && (
                        <img src={sub.thumb_url || sub.image_url} alt={sub.name}
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
          canSeeCost={m.canSeeCost}
          menuGroups={m.menuGroups}
          activeMenuGroupIds={m.activeMenuGroupIds}
          kitchenSaving={m.kitchenSaving}
          selectedCat={m.selectedCat}
          search={m.search}
          cateringOnly={m.cateringOnly}
          page={m.page}
          lastPage={m.lastPage}
          perPage={m.perPage}
          onSelectedCatChange={m.setSelectedCat}
          onSearchChange={m.setSearch}
          onCateringOnlyChange={m.setCateringOnly}
          onPerPageChange={m.handlePerPageChange}
          onPageChange={m.handlePageChange}
          onToggleKitchenGroup={m.toggleKitchenGroup}
          onSaveKitchenDuty={m.saveKitchenDuty}
          onToggleAvail={m.handleToggleAvail}
          onSnoozeItem={m.handleSnoozeItem}
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
            image_original_url: m.editingCat.image_original_url ?? '',
            thumb_url: m.editingCat.thumb_url ?? '',
            image_webp_url: m.editingCat.image_webp_url ?? '',
            thumb_webp_url: m.editingCat.thumb_webp_url ?? '',
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
          snoozedUntil={m.editingItem.snoozed_until}
          reasonNote={m.editingItem.unavailable_reason_note}
          onSnooze={(until, opts) => m.handleSnoozeItem(m.editingItem!, until, opts)}
        />
      )}

      {m.recipeItem && (
        <RecipeEditorModal
          item={m.recipeItem}
          onClose={() => m.setRecipeItem(null)}
          onSaved={m.handleRecipeSaved}
        />
      )}

      {m.barcodeLabel && (
        <Modal
          title="Barcode Label"
          onClose={() => m.setBarcodeLabel(null)}
          maxWidth={360}
          footer={(
            <ModalActions>
              <Btn variant="secondary" onClick={() => m.setBarcodeLabel(null)}>Close</Btn>
              <Btn onClick={() => { window.print(); }}>🖨 Print</Btn>
            </ModalActions>
          )}
        >
            <div style={{ border: '2px solid var(--color-border)', borderRadius: 12, padding: 20, textAlign: 'center' }}>
              <p style={{ margin: '0 0 8px', fontWeight: 700, fontSize: 16 }}>{m.barcodeLabel.name}</p>
              {m.barcodeLabel.barcode && (
                <p style={{ margin: '0 0 4px', fontFamily: 'monospace', fontSize: 18, letterSpacing: 3, color: 'var(--color-text)' }}>{m.barcodeLabel.barcode}</p>
              )}
              {m.barcodeLabel.sku && <p style={{ margin: '0 0 4px', fontSize: 12, color: 'var(--color-text-muted)' }}>SKU: {m.barcodeLabel.sku}</p>}
              <p style={{ margin: 0, fontWeight: 700, fontSize: 20, color: 'var(--color-primary)' }}>
                MVR {Number(m.barcodeLabel.price).toFixed(2)}
              </p>
            </div>
        </Modal>
      )}
    </>

    </PageShell>
  );
}
