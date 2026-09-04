import type { ReactNode } from 'react';
import type { AdminItemSort, MenuCategory, MenuGroupRow, MenuItem, SnoozeUntil } from '../../api';
import { Badge, Btn, Card, EmptyState, Spinner } from '../../components/SharedUI';
import { useIsMobile } from '../../hooks/useIsMobile';
import { menuItemMarginLabel, menuItemMarginLevel, MENU_MARGIN_COLORS } from '../../utils/menuMargin';
import { ItemSnoozeControls } from './ItemSnoozeControls';

type MenuItemTableProps = {
  categories: MenuCategory[];
  items: MenuItem[];
  loading: boolean;
  canManage: boolean;
  /** recipes.manage — owner-only. Gates the recipe editor and margin badge. */
  canSeeCost: boolean;
  menuGroups: MenuGroupRow[];
  activeMenuGroupIds: number[];
  kitchenSaving: boolean;
  selectedCat: number | null;
  search: string;
  cateringOnly: boolean;
  /** Server-side list order (owner, 2026-09-03: "no sort option in menu items"). */
  sort: AdminItemSort;
  page: number;
  lastPage: number;
  perPage: number;
  onSelectedCatChange: (cat: number | null) => void;
  onSearchChange: (search: string) => void;
  onCateringOnlyChange: (v: boolean) => void;
  onSortChange: (sort: AdminItemSort) => void;
  onPerPageChange: (perPage: number) => void;
  onPageChange: (page: number) => void;
  onToggleKitchenGroup: (id: number) => void;
  onSaveKitchenDuty: () => void;
  onToggleAvail: (item: MenuItem) => void;
  onSnoozeItem: (
    item: MenuItem,
    until: SnoozeUntil,
    opts?: { until_date?: string; unavailable_reason_note?: string | null },
  ) => Promise<unknown> | void;
  onEditItem: (item: MenuItem) => void;
  onDeleteItem: (id: number) => void;
  onBarcodeLabel: (itemId: number) => void;
  onViewRecipe: (itemId: number) => void;
};

const PER_PAGE_OPTIONS = [10, 25, 50, 100];

const SORT_OPTIONS: Array<{ value: AdminItemSort; label: string }> = [
  { value: 'menu', label: 'Menu order' },
  { value: 'name', label: 'Name A–Z' },
  { value: 'name_desc', label: 'Name Z–A' },
  { value: 'price', label: 'Price: low to high' },
  { value: 'price_desc', label: 'Price: high to low' },
  { value: 'category', label: 'Category' },
  { value: 'updated', label: 'Recently edited' },
  { value: 'unavailable', label: 'Unavailable first' },
];

function isCateringItem(item: MenuItem): boolean {
  return !!item.is_catering
    || !!item.channel_availabilities?.some((r) => r.channel === 'catering' && r.is_enabled);
}

function price(item: MenuItem): string {
  return `MVR ${parseFloat(String(item.base_price)).toFixed(2)}`;
}

// ── Small pieces shared by the desktop row and the phone card ─────────────────

function Thumb({ item, size }: { item: MenuItem; size: number }) {
  const style = { width: size, height: size, borderRadius: 10, flexShrink: 0 } as const;
  return item.image_url ? (
    <img
      src={item.image_url}
      alt=""
      style={{ ...style, objectFit: 'cover' }}
      onError={(e) => { (e.target as HTMLImageElement).style.visibility = 'hidden'; }}
    />
  ) : (
    <div className="menu-item-thumb-empty" style={{ ...style, fontSize: Math.round(size * 0.45) }} aria-hidden="true">🍽</div>
  );
}

function CateringTag() {
  return <span className="menu-item-tag menu-item-tag--catering">Catering menu</span>;
}

function MarginTag({ item }: { item: MenuItem }) {
  const p = parseFloat(String(item.base_price));
  const cost = item.effective_cost ?? item.cost;
  const level = menuItemMarginLevel(p, cost);
  const label = menuItemMarginLabel(p, cost);
  if (!label || level === 'unknown' || level === 'ok') return null;
  const style = MENU_MARGIN_COLORS[level];
  return (
    <span className="menu-item-tag" style={{ color: style.color, background: style.bg, borderColor: style.border }}>
      ⚠ {label}
    </span>
  );
}

function categoryLabel(item: MenuItem, categories: MenuCategory[]): ReactNode {
  if (!item.category) return <span style={{ color: 'var(--color-text-muted)' }}>—</span>;
  const cat = categories.find((c) => c.id === item.category_id);
  const parent = cat?.parent_id ? categories.find((c) => c.id === cat.parent_id) : null;
  if (parent) {
    return <span>{parent.name} <span style={{ color: 'var(--color-text-muted)' }}>› {cat?.name}</span></span>;
  }
  return cat?.name ?? item.category.name;
}

function AvailabilitySwitch({ item, canManage, onToggle }: { item: MenuItem; canManage: boolean; onToggle: () => void }) {
  if (!canManage) {
    return <Badge label={item.is_available ? 'Selling' : 'Sold out'} color={item.is_available ? 'green' : 'gray'} />;
  }
  return (
    <button
      type="button"
      role="switch"
      aria-checked={item.is_available}
      aria-label={`${item.name}: selling today`}
      title={item.is_available ? 'Click to mark sold out' : 'Click to mark selling'}
      className="menu-avail-switch"
      data-on={item.is_available ? 'true' : 'false'}
      onClick={onToggle}
    >
      <span className="menu-avail-switch-thumb" />
    </button>
  );
}

type ActionProps = {
  item: MenuItem;
  canManage: boolean;
  canSeeCost: boolean;
  onEditItem: (item: MenuItem) => void;
  onDeleteItem: (id: number) => void;
  onBarcodeLabel: (itemId: number) => void;
  onViewRecipe: (itemId: number) => void;
};

function ItemActions({ item, canManage, canSeeCost, onEditItem, onDeleteItem, onBarcodeLabel, onViewRecipe }: ActionProps) {
  return (
    <div className="menu-item-actions">
      {canManage && (
        <>
          <Btn small variant="secondary" onClick={() => onEditItem(item)} aria-label={`Edit ${item.name}`}>Edit</Btn>
          <Btn small variant="secondary" onClick={() => onBarcodeLabel(item.id)} aria-label={`Print barcode label for ${item.name}`} title="Print barcode label">
            <span aria-hidden="true">🏷</span> Label
          </Btn>
        </>
      )}
      {canSeeCost && (
        <Btn small variant="secondary" onClick={() => onViewRecipe(item.id)} aria-label={`Recipe and cost for ${item.name}`} title="Recipe & cost">
          <span aria-hidden="true">📋</span> Recipe
        </Btn>
      )}
      {canManage && (
        <Btn small variant="ghost" className="menu-item-delete" onClick={() => onDeleteItem(item.id)} aria-label={`Delete ${item.name}`}>
          Delete
        </Btn>
      )}
    </div>
  );
}

// ── Chef menu on duty ─────────────────────────────────────────────────────────

function KitchenDutyBar({
  groups, activeIds, canManage, saving, onToggle, onSave,
}: {
  groups: MenuGroupRow[];
  activeIds: number[];
  canManage: boolean;
  saving: boolean;
  onToggle: (id: number) => void;
  onSave: () => void;
}) {
  return (
    <Card className="menu-duty" data-testid="menu-duty" style={{ padding: '10px 14px', marginBottom: 14 }}>
      <div className="menu-duty-heading">
        <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--color-text)' }}>Chef menu on duty</span>
        <span
          className="menu-duty-help"
          title="Only items in the ticked menu groups appear on the public menu, subject to each channel's rules."
        >
          Only ticked groups are live on the public menu
        </span>
      </div>
      <div className="menu-duty-groups" role="group" aria-label="Menu groups on duty">
        {groups.map((g) => {
          const on = activeIds.includes(g.id);
          return (
            <label key={g.id} className="menu-duty-chip" data-on={on ? 'true' : 'false'} data-disabled={canManage ? undefined : 'true'}>
              <input
                type="checkbox"
                checked={on}
                onChange={() => onToggle(g.id)}
                disabled={!canManage}
              />
              {g.name}
            </label>
          );
        })}
      </div>
      {canManage && (
        <Btn small onClick={() => void onSave()} disabled={saving} className="menu-duty-save">
          {saving ? 'Saving…' : 'Save active menus'}
        </Btn>
      )}
    </Card>
  );
}

// ── The list itself ───────────────────────────────────────────────────────────

export function MenuItemTable({
  categories,
  items,
  loading,
  canManage,
  canSeeCost,
  menuGroups,
  activeMenuGroupIds,
  kitchenSaving,
  selectedCat,
  search,
  cateringOnly,
  sort,
  page,
  lastPage,
  perPage,
  onSelectedCatChange,
  onSearchChange,
  onCateringOnlyChange,
  onSortChange,
  onPerPageChange,
  onPageChange,
  onToggleKitchenGroup,
  onSaveKitchenDuty,
  onToggleAvail,
  onSnoozeItem,
  onEditItem,
  onDeleteItem,
  onBarcodeLabel,
  onViewRecipe,
}: MenuItemTableProps) {
  const isMobile = useIsMobile();
  const defaultMenuGroups = menuGroups.length ? menuGroups : [{ id: 1, name: 'Default', slug: 'default', sort_order: 0, is_active: true }];

  const visibleItems = cateringOnly ? items.filter(isCateringItem) : items;

  const actionProps = { canManage, canSeeCost, onEditItem, onDeleteItem, onBarcodeLabel, onViewRecipe };

  // Owner, 2026-09-03: "when I click Item, it changes from A–Z to Z–A".
  // A header click steps asc → desc → back to the menu order; columns with
  // one direction step asc → menu order.
  const sortableTh = (
    label: string,
    asc: AdminItemSort,
    desc: AdminItemSort | null,
    className?: string,
    title?: string,
  ) => {
    const state = sort === asc ? 'ascending' : desc && sort === desc ? 'descending' : 'none';
    const next: AdminItemSort = state === 'none' ? asc : state === 'ascending' && desc ? desc : 'menu';
    const arrow = state === 'ascending' ? '↑' : state === 'descending' ? '↓' : '↕';
    return (
      <th scope="col" className={className} aria-sort={state} title={title}>
        <button
          type="button"
          className={`menu-item-sort-th${state !== 'none' ? ' is-on' : ''}`}
          data-testid={`sort-th-${asc}`}
          onClick={() => onSortChange(next)}
          title={state === 'none' ? `Sort by ${label}` : state === 'ascending' && desc ? `Sort by ${label}, reversed` : 'Back to menu order'}
        >
          {label}
          <span className="menu-item-sort-th__arrow" aria-hidden="true">{arrow}</span>
        </button>
      </th>
    );
  };

  const snooze = (item: MenuItem) => (
    <ItemSnoozeControls
      compact
      canManage={canManage}
      snoozedUntil={item.snoozed_until}
      isAvailable={item.is_available}
      reasonNote={item.unavailable_reason_note}
      onSnooze={(until, opts) => onSnoozeItem(item, until, opts)}
    />
  );

  return (
    <>
      <KitchenDutyBar
        groups={defaultMenuGroups}
        activeIds={activeMenuGroupIds}
        canManage={canManage}
        saving={kitchenSaving}
        onToggle={onToggleKitchenGroup}
        onSave={onSaveKitchenDuty}
      />

      <div className="menu-items-toolbar" data-testid="menu-items-toolbar">
        <input
          type="search"
          className="menu-items-search"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search by name or SKU…"
          aria-label="Search items"
        />
        <select
          className="menu-items-category"
          value={selectedCat ?? ''}
          onChange={(e) => onSelectedCatChange(e.target.value ? parseInt(e.target.value) : null)}
          aria-label="Category"
        >
          <option value="">All categories</option>
          {categories.filter((c) => !c.parent_id).map((parent) => (
            <optgroup key={parent.id} label={parent.name}>
              <option value={parent.id}>{parent.name}</option>
              {categories.filter((c) => c.parent_id === parent.id).map((sub) => (
                <option key={sub.id} value={sub.id}>{'↳ ' + sub.name}</option>
              ))}
            </optgroup>
          ))}
        </select>
        <select
          className="menu-items-sort"
          data-testid="menu-items-sort"
          value={sort}
          onChange={(e) => onSortChange(e.target.value as AdminItemSort)}
          aria-label="Sort items"
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <label className="menu-items-catering" data-on={cateringOnly ? 'true' : 'false'}>
          <input
            type="checkbox"
            checked={cateringOnly}
            onChange={(e) => onCateringOnlyChange(e.target.checked)}
          />
          Catering only
        </label>
      </div>

      {loading && items.length === 0 ? <Spinner /> :
      visibleItems.length === 0 ? (
        <Card><EmptyState message={cateringOnly ? 'No catering-flagged items on this page.' : 'No items found.'} /></Card>
      ) : (
        <>
          {isMobile ? (
            <div className="menu-item-cards" data-testid="menu-item-cards">
              {visibleItems.map((item) => (
                <Card key={item.id} className="menu-item-card" data-testid={`menu-item-card-${item.id}`} style={{ padding: 12, opacity: item.is_active ? 1 : 0.6 }}>
                  <div className="menu-item-card-head">
                    <Thumb item={item} size={56} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="menu-item-name">
                        {item.name}
                        {isCateringItem(item) && <CateringTag />}
                        {canSeeCost && <MarginTag item={item} />}
                      </div>
                      <div className="menu-item-meta">
                        {categoryLabel(item, categories)}
                        {item.sku && <span className="menu-item-sku"> · {item.sku}</span>}
                      </div>
                    </div>
                    <div className="menu-item-price">{price(item)}</div>
                  </div>

                  <div className="menu-item-card-status">
                    <div className="menu-item-avail">
                      <AvailabilitySwitch item={item} canManage={canManage} onToggle={() => onToggleAvail(item)} />
                      {snooze(item)}
                    </div>
                    <Badge label={item.is_active ? 'On menu' : 'Off menu'} color={item.is_active ? 'green' : 'gray'} />
                  </div>

                  <ItemActions item={item} {...actionProps} />
                </Card>
              ))}
            </div>
          ) : (
            <Card style={{ padding: 0, overflow: 'hidden' }}>
              <div className="table-scroll">
                <table className="menu-item-table" data-testid="menu-item-table">
                  <thead>
                    <tr>
                      {sortableTh('Item', 'name', 'name_desc', 'menu-item-col-name')}
                      {sortableTh('Category', 'category', null)}
                      {sortableTh('Price', 'price', 'price_desc', 'menu-item-col-price')}
                      {sortableTh('Selling today', 'unavailable', null, undefined, 'Whether the item can be ordered right now')}
                      <th scope="col" title="Off-menu items are hidden from customers entirely">On menu</th>
                      <th scope="col" className="menu-item-col-actions"><span className="sr-only">Actions</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleItems.map((item) => (
                      <tr key={item.id} data-testid={`menu-item-row-${item.id}`} style={{ opacity: item.is_active ? 1 : 0.55 }}>
                        <td className="menu-item-col-name">
                          <div className="menu-item-card-head">
                            <Thumb item={item} size={40} />
                            <div style={{ minWidth: 0 }}>
                              <div className="menu-item-name">
                                {item.name}
                                {isCateringItem(item) && <CateringTag />}
                                {canSeeCost && <MarginTag item={item} />}
                              </div>
                              {item.sku && <div className="menu-item-sku">{item.sku}</div>}
                            </div>
                          </div>
                        </td>
                        <td className="menu-item-col-category">{categoryLabel(item, categories)}</td>
                        <td className="menu-item-col-price"><span className="menu-item-price">{price(item)}</span></td>
                        <td>
                          <div className="menu-item-avail">
                            <AvailabilitySwitch item={item} canManage={canManage} onToggle={() => onToggleAvail(item)} />
                            {snooze(item)}
                          </div>
                        </td>
                        <td>
                          <Badge label={item.is_active ? 'On menu' : 'Off menu'} color={item.is_active ? 'green' : 'gray'} />
                        </td>
                        <td className="menu-item-col-actions">
                          <ItemActions item={item} {...actionProps} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          <div className="menu-items-footer" data-testid="menu-items-footer">
            <span className="menu-items-count">
              {visibleItems.length} {visibleItems.length === 1 ? 'item' : 'items'}
              {lastPage > 1 ? ` · page ${page} of ${lastPage}` : ''}
            </span>
            {lastPage > 1 && (
              <div className="menu-items-pager">
                <Btn small variant="secondary" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
                  ← Prev
                </Btn>
                <Btn small variant="secondary" disabled={page >= lastPage} onClick={() => onPageChange(page + 1)}>
                  Next →
                </Btn>
              </div>
            )}
            <label className="menu-items-per-page">
              Per page
              <select
                value={perPage}
                onChange={(e) => onPerPageChange(Number(e.target.value))}
                aria-label="Items per page"
              >
                {PER_PAGE_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
          </div>
        </>
      )}
    </>
  );
}
