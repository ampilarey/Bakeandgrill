import type { MenuCategory, MenuGroupRow, MenuItem } from '../../api';
import { Badge, Btn, Card, EmptyState, Input, Spinner } from '../../components/Layout';
import { menuItemMarginLabel, menuItemMarginLevel, MENU_MARGIN_COLORS } from '../../utils/menuMargin';

type MenuItemTableProps = {
  categories: MenuCategory[];
  items: MenuItem[];
  loading: boolean;
  canManage: boolean;
  menuGroups: MenuGroupRow[];
  activeMenuGroupIds: number[];
  kitchenSaving: boolean;
  selectedCat: number | null;
  search: string;
  page: number;
  lastPage: number;
  perPage: number;
  onSelectedCatChange: (cat: number | null) => void;
  onSearchChange: (search: string) => void;
  onPerPageChange: (perPage: number) => void;
  onPageChange: (page: number) => void;
  onToggleKitchenGroup: (id: number) => void;
  onSaveKitchenDuty: () => void;
  onToggleAvail: (item: MenuItem) => void;
  onEditItem: (item: MenuItem) => void;
  onDeleteItem: (id: number) => void;
  onBarcodeLabel: (itemId: number) => void;
  onViewRecipe: (itemId: number) => void;
};

export function MenuItemTable({
  categories,
  items,
  loading,
  canManage,
  menuGroups,
  activeMenuGroupIds,
  kitchenSaving,
  selectedCat,
  search,
  page,
  lastPage,
  perPage,
  onSelectedCatChange,
  onSearchChange,
  onPerPageChange,
  onPageChange,
  onToggleKitchenGroup,
  onSaveKitchenDuty,
  onToggleAvail,
  onEditItem,
  onDeleteItem,
  onBarcodeLabel,
  onViewRecipe,
}: MenuItemTableProps) {
  const defaultMenuGroups = menuGroups.length ? menuGroups : [{ id: 1, name: 'Default', slug: 'default', sort_order: 0, is_active: true }];

  return (
    <>
      <Card style={{ padding: '16px 18px', marginBottom: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: '#1C1408', marginBottom: 8 }}>Chef menu on duty</div>
        <p style={{ fontSize: 12, color: '#6B5D4F', margin: '0 0 12px', lineHeight: 1.45 }}>
          Only items in the selected menu groups appear on the public menu (per channel rules). Choose one or more groups that are live right now.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px 18px', marginBottom: 12 }}>
          {defaultMenuGroups.map((g) => (
            <label key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: canManage ? 'pointer' : 'default' }}>
              <input
                type="checkbox"
                checked={activeMenuGroupIds.includes(g.id)}
                onChange={() => onToggleKitchenGroup(g.id)}
                disabled={!canManage}
              />
              {g.name}
            </label>
          ))}
        </div>
        {canManage && (
          <Btn small onClick={() => void onSaveKitchenDuty()} disabled={kitchenSaving}>
            {kitchenSaving ? 'Saving…' : 'Save active menus'}
          </Btn>
        )}
      </Card>

      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <select
          value={selectedCat ?? ''}
          onChange={(e) => onSelectedCatChange(e.target.value ? parseInt(e.target.value) : null)}
          style={{ border: '1px solid #E8E0D8', borderRadius: 9, padding: '8px 12px', fontSize: 14, minWidth: 180 }}
        >
          <option value="">All Categories</option>
          {categories.filter((c) => !c.parent_id).map((parent) => (
            <optgroup key={parent.id} label={parent.name}>
              <option value={parent.id}>{parent.name}</option>
              {categories.filter((c) => c.parent_id === parent.id).map((sub) => (
                <option key={sub.id} value={sub.id}>{'↳ ' + sub.name}</option>
              ))}
            </optgroup>
          ))}
        </select>
        <div style={{ flex: 1, minWidth: 180 }}>
          <Input value={search} onChange={onSearchChange} placeholder="Search by name or SKU…" />
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#6B5D4F' }}>
          Per page:
          <select
            value={perPage}
            onChange={(e) => onPerPageChange(Number(e.target.value))}
            style={{ padding: '4px 8px', borderRadius: 8, border: '1px solid #E8E0D8', fontSize: 13, fontFamily: 'inherit' }}
          >
            {[10, 25, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
      </div>

      {loading && items.length === 0 ? <Spinner /> :
      items.length === 0 ? (
        <Card><EmptyState message="No items found." /></Card>
      ) : (
        <>
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            <div className="table-scroll">
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ background: '#F8F6F3', borderBottom: '1px solid #E8E0D8' }}>
                  {['', 'Name', 'Category', 'Price', 'Available', 'Active', ''].map((h, i) => (
                    <th key={i} style={{ padding: '11px 14px', textAlign: 'left', fontWeight: 700, color: '#9C8E7E', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} style={{ borderBottom: '1px solid #F0EBE5', opacity: item.is_active ? 1 : 0.5 }}>
                    <td style={{ padding: '10px 14px', width: 52 }}>
                      {item.image_url ? (
                        <img src={item.image_url} alt={item.name}
                          style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 8 }}
                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                      ) : (
                        <div style={{ width: 40, height: 40, background: '#F0EBE5', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>🍽</div>
                      )}
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <div style={{ fontWeight: 600 }}>{item.name}</div>
                      {item.sku && <div style={{ fontSize: 11, color: '#94a3b8' }}>{item.sku}</div>}
                      {(() => {
                        const price = parseFloat(String(item.base_price));
                        const level = menuItemMarginLevel(price, item.effective_cost ?? item.cost);
                        const label = menuItemMarginLabel(price, item.effective_cost ?? item.cost);
                        if (!label || level === 'unknown' || level === 'ok') return null;
                        const style = MENU_MARGIN_COLORS[level];
                        return (
                          <span style={{
                            display: 'inline-block', marginTop: 4, fontSize: 10, fontWeight: 800,
                            color: style.color, background: style.bg, border: `1px solid ${style.border}`,
                            borderRadius: 4, padding: '2px 6px',
                          }}>
                            ⚠ {label}
                          </span>
                        );
                      })()}
                    </td>
                    <td style={{ padding: '10px 14px', color: '#6B5D4F', fontSize: 13 }}>
                      {item.category ? (() => {
                        const cat = categories.find((c) => c.id === item.category_id);
                        const parent = cat?.parent_id ? categories.find((c) => c.id === cat.parent_id) : null;
                        return parent
                          ? <span>{parent.name} <span style={{ color: '#94a3b8' }}>› {cat?.name}</span></span>
                          : cat?.name ?? item.category.name;
                      })() : <span style={{ color: '#cbd5e1' }}>—</span>}
                    </td>
                    <td style={{ padding: '10px 14px', fontWeight: 700, color: '#D4813A' }}>
                      MVR {parseFloat(String(item.base_price)).toFixed(2)}
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      {canManage ? (
                      <button
                        onClick={() => onToggleAvail(item)}
                        title={item.is_available ? 'Click to mark sold out' : 'Click to mark available'}
                        style={{
                          width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer',
                          background: item.is_available ? '#22c55e' : '#d1d5db',
                          position: 'relative', transition: 'background 0.2s', flexShrink: 0, display: 'inline-block',
                          verticalAlign: 'middle',
                        }}
                      >
                        <span style={{
                          position: 'absolute', top: 2, width: 20, height: 20, borderRadius: '50%',
                          background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                          transition: 'left 0.2s',
                          left: item.is_available ? 22 : 2,
                        }} />
                      </button>
                      ) : (
                        <Badge label={item.is_available ? 'Available' : 'Sold out'} color={item.is_available ? 'green' : 'gray'} />
                      )}
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <Badge label={item.is_active ? 'Active' : 'Hidden'} color={item.is_active ? 'green' : 'gray'} />
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        {canManage && (
                          <>
                        <Btn small variant="secondary" onClick={() => onEditItem(item)}>Edit</Btn>
                        <Btn small variant="secondary" onClick={() => onBarcodeLabel(item.id)} title="Print barcode label">🏷</Btn>
                        <Btn small variant="danger" onClick={() => onDeleteItem(item.id)}>Delete</Btn>
                          </>
                        )}
                        <Btn small variant="secondary" onClick={() => onViewRecipe(item.id)} title="View recipe">📋</Btn>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </Card>

          {lastPage > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 16 }}>
              <Btn small variant="secondary" disabled={page <= 1}
                onClick={() => onPageChange(page - 1)}>
                ← Prev
              </Btn>
              <span style={{ padding: '6px 14px', fontSize: 14, color: '#6B5D4F' }}>
                Page {page} of {lastPage}
              </span>
              <Btn small variant="secondary" disabled={page >= lastPage}
                onClick={() => onPageChange(page + 1)}>
                Next →
              </Btn>
            </div>
          )}
        </>
      )}
    </>
  );
}
