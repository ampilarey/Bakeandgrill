import { useEffect, useMemo, useState } from "react";
import type { Category, Item, Modifier, Variant } from "../types";
import { effectiveItemPrice, originalItemPrice } from "../hooks/useCart";
import { z } from "../theme";

type Props = {
  categories: Category[];
  /** null = "All items" tab (no category filter applied). */
  selectedCategoryId: number | null;
  setSelectedCategoryId: (id: number | null) => void;
  filteredItems: Item[];
  isLoading: boolean;
  dataError: string;

  selectedItem: Item | null;
  selectedModifiers: Modifier[];
  handleSelectItem: (item: Item) => void;
  toggleModifier: (mod: Modifier) => void;
  addToCart: (
    item: Item,
    opts?: {
      variant?: Variant | null;
      modifiers?: Modifier[];
      packagingOptionId?: number | null;
    },
  ) => void;
  clearSelectedItem: () => void;

  barcode: string;
  setBarcode: (v: string) => void;
  onBarcodeSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  /** When true the grid is dimmed and item taps are blocked — set
   *  while a held ticket is in "resumed" mode (cart is read-only). */
  readOnly?: boolean;

  /** Manual menu refresh — cashier tap pulls fresh categories + items
   *  from the server (useful when the owner adds a menu item mid-shift
   *  and the cashier can't wait for the 5-min auto-poll). */
  onRefreshMenu?: () => void;
  /** True while the manual refresh is in flight, so the button can
   *  spin and we can avoid stacking concurrent requests. */
  isRefreshingMenu?: boolean;
  /** Unix-ms timestamp of the last successful menu fetch, used for the
   *  "Updated 2m ago" status text next to the refresh button. */
  lastRefreshedAt?: number | null;
};

// Per-category colour swatches. Loyverse-style highly-saturated chips
// felt loud against the slate POS chrome (per audit). Instead we use
// muted modern tones — still distinct enough for fast scanning while
// reading as "one product" with the rest of the UI. `fg` is the
// readable accent text colour for that swatch; tiles render the
// category name in slate ink so contrast stays comfortable on white.
const TILE_PALETTE = [
  { bg: '#FEE2E2', fg: '#B91C1C' }, // soft red
  { bg: '#FFEDD5', fg: '#C2410C' }, // soft orange
  { bg: '#FEF3C7', fg: '#A16207' }, // soft amber
  { bg: '#ECFCCB', fg: '#3F6212' }, // soft lime
  { bg: '#D1FAE5', fg: '#047857' }, // soft green
  { bg: '#CCFBF1', fg: '#0F766E' }, // soft teal
  { bg: '#CFFAFE', fg: '#0E7490' }, // soft cyan
  { bg: '#DBEAFE', fg: '#1D4ED8' }, // soft blue
  { bg: '#E0E7FF', fg: '#4338CA' }, // soft indigo
  { bg: '#EDE9FE', fg: '#6D28D9' }, // soft violet
  { bg: '#FCE7F3', fg: '#BE185D' }, // soft pink
  { bg: '#E2E8F0', fg: '#334155' }, // soft slate
];

function tileColor(categoryId: number | null | undefined) {
  if (!categoryId) return TILE_PALETTE[0];
  return TILE_PALETTE[Math.abs(categoryId) % TILE_PALETTE.length];
}

type SaleFilter = 'all' | 'discount' | 'special';

function isPercentDiscountItem(item: Item): boolean {
  if (item.special?.discount_pct != null && item.special.discount_pct > 0) return true;
  return (item.variants ?? []).some(
    (v) => v.effective_price != null && v.original_price != null && v.effective_price < v.original_price,
  );
}

function isFixedSpecialItem(item: Item): boolean {
  if (item.special?.effective_price != null && (item.special.discount_pct == null || item.special.discount_pct <= 0)) {
    return true;
  }
  return !!item.special && !isPercentDiscountItem(item);
}

const pillRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: 6,
  overflowX: 'auto',
  paddingBottom: 4,
  flexShrink: 0,
  scrollbarWidth: 'thin',
};

function CategoryPill({
  label,
  active,
  onClick,
  caret = false,
  subtle = false,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  caret?: boolean;
  subtle?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: subtle ? '6px 12px' : '8px 16px',
        borderRadius: 999,
        // Active pill uses the brand orange — same accent the cart's
        // primary CTA and login hero use, so the "current selection"
        // language is consistent across the whole POS.
        border: `1px solid ${active ? '#B86820' : '#E2E8F0'}`,
        background: active ? '#D4813A' : subtle ? '#F1F5F9' : '#FFFFFF',
        color: active ? '#FFFFFF' : '#0F172A',
        fontSize: subtle ? 11 : 13,
        fontWeight: 700,
        cursor: 'pointer',
        whiteSpace: 'nowrap',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        minHeight: subtle ? 30 : 36,
        boxShadow: active ? '0 1px 3px rgba(212,129,58,0.35)' : 'none',
        transition: 'background 0.12s, box-shadow 0.12s',
      }}
    >
      <span>{label}</span>
      {caret && (
        <span
          aria-hidden="true"
          style={{
            fontSize: 9,
            opacity: 0.65,
            transform: 'translateY(1px)',
          }}
        >
          ▾
        </span>
      )}
    </button>
  );
}

const C = {
  panel: '#FFFFFF',
  border: '#E2E8F0',
  border2: '#CBD5E1',
  text: '#0F172A',
  muted: '#64748B',
  subtle: '#94A3B8',
  bg: '#F8FAFC',
  primary: '#D4813A',
  primaryDark: '#B86820',
};

/**
 * Human-readable "Updated X ago" string for the menu refresh hint.
 * Kept short so it doesn't overflow the topbar on narrow tablets.
 */
function formatAgo(ts: number | null | undefined): string {
  if (!ts) return '';
  const seconds = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (seconds < 10) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

/**
 * Bug-024: the freshness label used to live inside MenuGrid with a
 * 20s `setTick` interval at the top of the component — which meant
 * the ENTIRE menu grid (categories, items, modifier sheet, search
 * memos) was re-rendered every 20s just so a six-character string
 * ("2m ago") could advance. On a 200+ item menu that's a noticeable
 * jank on iPad. Now the tick lives inside this tiny component, so
 * only this <span> re-renders.
 */
function FreshnessLabel({ ts, busy }: { ts: number | null; busy: boolean }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!ts) return;
    const id = window.setInterval(() => setTick((n) => n + 1), 20_000);
    return () => window.clearInterval(id);
  }, [ts]);
  return <>{busy ? 'Refreshing…' : ts ? `Updated ${formatAgo(ts)}` : 'Refresh'}</>;
}

export function MenuGrid({
  categories, selectedCategoryId, setSelectedCategoryId, filteredItems,
  isLoading, dataError, selectedItem, selectedModifiers,
  handleSelectItem, toggleModifier, addToCart, clearSelectedItem,
  barcode, setBarcode, onBarcodeSubmit, readOnly = false,
  onRefreshMenu, isRefreshingMenu = false, lastRefreshedAt = null,
}: Props) {
  // Bug-024: the per-20s freshness tick lives inside <FreshnessLabel>
  // now, NOT here at the top of MenuGrid. Re-rendering the entire
  // menu (300+ items, modifier sheets, search memos) every 20s just
  // to advance a "2m ago" string was visible jank on iPad. The label
  // self-rotates without involving the rest of the grid.
  const [search, setSearch] = useState("");
  const [saleFilter, setSaleFilter] = useState<SaleFilter>("all");

  // ── Category hierarchy ─────────────────────────────────────────────────────
  // The DB supports `parent_id` on categories (one level of nesting). The old
  // POS rendered them as a flat pill row, so parents and children sat next
  // to each other with no visual relationship — and an item under a sub-
  // category was unreachable unless you knew which leaf to tap. We now
  // render:
  //   1. A primary pill row with "All" + every TOP-LEVEL category, sorted
  //      by sort_order then name.
  //   2. A secondary pill row showing the children of the currently-selected
  //      top-level (only when that top-level has children). Includes an
  //      "All ‹parent›" pill so the cashier can opt back into the parent
  //      view.
  // Items belonging to a sub-category are mapped up to the parent for
  // filtering purposes — selecting the parent shows everything under it,
  // selecting a child narrows to that leaf only.
  const childrenByParent = useMemo(() => {
    const map = new Map<number, Category[]>();
    for (const c of categories) {
      if (c.parent_id != null) {
        const arr = map.get(c.parent_id) ?? [];
        arr.push(c);
        map.set(c.parent_id, arr);
      }
    }
    const sortFn = (a: Category, b: Category) =>
      (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name);
    for (const [k, arr] of map) map.set(k, [...arr].sort(sortFn));
    return map;
  }, [categories]);

  const topLevelCategories = useMemo(() => {
    const sortFn = (a: Category, b: Category) =>
      (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name);
    return categories.filter((c) => c.parent_id == null).sort(sortFn);
  }, [categories]);

  // Map every category id → its top-level ancestor (itself if already a root).
  const ancestorOf = useMemo(() => {
    const map = new Map<number, number>();
    const byId = new Map(categories.map((c) => [c.id, c]));
    for (const c of categories) {
      let cur: Category | undefined = c;
      // Walk up the chain (defensive guard against accidental cycles).
      for (let i = 0; i < 16 && cur && cur.parent_id != null; i++) {
        const parent = byId.get(cur.parent_id);
        if (!parent) break;
        cur = parent;
      }
      map.set(c.id, cur?.id ?? c.id);
    }
    return map;
  }, [categories]);

  // Determine which top-level pill should be marked active, and what
  // children (if any) to show in the secondary row.
  const activeTopLevelId = useMemo(() => {
    if (selectedCategoryId == null) return null;
    return ancestorOf.get(selectedCategoryId) ?? selectedCategoryId;
  }, [selectedCategoryId, ancestorOf]);

  const activeChildren = useMemo(() => {
    if (activeTopLevelId == null) return [];
    return childrenByParent.get(activeTopLevelId) ?? [];
  }, [activeTopLevelId, childrenByParent]);

  const discountCount = useMemo(
    () => filteredItems.filter(isPercentDiscountItem).length,
    [filteredItems],
  );
  const specialCount = useMemo(
    () => filteredItems.filter(isFixedSpecialItem).length,
    [filteredItems],
  );

  const saleScopedItems = useMemo(() => {
    if (saleFilter === 'discount') return filteredItems.filter(isPercentDiscountItem);
    if (saleFilter === 'special') return filteredItems.filter(isFixedSpecialItem);
    return filteredItems;
  }, [filteredItems, saleFilter]);

  // Cross-category text search: when the cashier types in the search box we
  // ignore the category filter so common items can be reached quickly. The
  // search box doubles as the barcode input — form submit looks up the SKU.
  const visibleItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return saleScopedItems;
    // Fall back to saleScopedItems when nothing matches — that's the right
    // behaviour when the search field is being used as a barcode buffer.
    return saleScopedItems.filter((it) => it.name.toLowerCase().includes(q));
  }, [saleScopedItems, search]);

  return (
    <section className="pos-menu">
      {/* Top bar: search + barcode form */}
      <div className="pos-menu-toolbar">
        <form
          className="pos-menu-search-form"
          onSubmit={(e) => {
            if (barcode.trim()) { onBarcodeSubmit(e); return; }
            e.preventDefault();
          }}
        >
          <div style={{ position: 'relative', flex: 1 }}>
            <span style={{
              position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
              color: C.subtle, fontSize: 14, pointerEvents: 'none',
            }}>🔍</span>
            <input
              value={search || barcode}
              onChange={(e) => {
                const v = e.target.value;
                // Treat purely numeric / dash entries as a barcode (so a scanner
                // can dump straight into this single field). Anything else is
                // free-text search across the visible category.
                if (/^[0-9\- ]+$/.test(v)) {
                  setBarcode(v);
                  setSearch("");
                } else {
                  setSearch(v);
                  setBarcode("");
                }
              }}
              placeholder="Search items or scan barcode…"
              style={{
                width: '100%', padding: '10px 12px 10px 36px',
                borderRadius: 8, border: `1px solid ${C.border2}`,
                fontSize: 14, background: '#FFFFFF', color: C.text,
                boxSizing: 'border-box', outline: 'none',
              }}
            />
          </div>
          {barcode.trim() && (
            <button
              type="submit"
              style={{
                padding: '0 16px', borderRadius: 8, border: 'none',
                background: C.primary, color: '#fff', fontSize: 13, fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Add
            </button>
          )}
        </form>

        {/* Manual menu refresh — for when the owner adds an item mid-
            shift and the cashier wants it now rather than waiting for
            the 5-min auto-poll. The button is intentionally subtle:
            most cashiers will never need it because of the silent
            background poll + tab-focus refetch already running. */}
        {onRefreshMenu && (
          <button
            type="button"
            className="pos-menu-refresh-btn"
            onClick={() => onRefreshMenu()}
            disabled={isRefreshingMenu}
            title={lastRefreshedAt ? `Tap to refresh the menu` : 'Refresh menu now'}
            aria-label="Refresh menu"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '0 12px',
              height: 40,
              borderRadius: 8,
              border: `1px solid ${C.border2}`,
              background: '#FFFFFF',
              color: C.muted,
              fontSize: 12,
              fontWeight: 700,
              cursor: isRefreshingMenu ? 'wait' : 'pointer',
              whiteSpace: 'nowrap',
              flexShrink: 0,
              transition: 'background 0.12s',
            }}
          >
            <span
              aria-hidden
              style={{
                display: 'inline-block',
                fontSize: 14,
                lineHeight: 1,
                // Spin while a refresh is in flight so the cashier sees
                // something is happening even on a slow connection.
                animation: isRefreshingMenu ? 'pos-spin 0.8s linear infinite' : undefined,
              }}
            >
              ↻
            </span>
            <span
              className="pos-refresh-label"
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: C.subtle,
                // Hidden on narrow viewports via index.css media query;
                // visible on tablets/desktop where there's room.
                display: 'none',
              }}
            >
              <FreshnessLabel ts={lastRefreshedAt} busy={isRefreshingMenu} />
            </span>
          </button>
        )}
      </div>

      {/* Category + sale filters in one row (avoids duplicate "All items"). */}
      {(topLevelCategories.length > 0 || discountCount > 0 || specialCount > 0) && (
        <div style={pillRowStyle}>
          <CategoryPill
            label="All items"
            active={selectedCategoryId == null && saleFilter === 'all'}
            onClick={() => {
              setSelectedCategoryId(null);
              setSaleFilter('all');
            }}
          />
          {topLevelCategories.map((cat) => (
            <CategoryPill
              key={cat.id}
              label={cat.name}
              active={activeTopLevelId === cat.id && saleFilter === 'all'}
              onClick={() => {
                setSelectedCategoryId(cat.id);
                setSaleFilter('all');
              }}
              caret={(childrenByParent.get(cat.id)?.length ?? 0) > 0}
            />
          ))}
          {discountCount > 0 && (
            <CategoryPill
              label={`% Off (${discountCount})`}
              active={saleFilter === 'discount'}
              onClick={() => setSaleFilter((f) => (f === 'discount' ? 'all' : 'discount'))}
            />
          )}
          {specialCount > 0 && (
            <CategoryPill
              label={`Specials (${specialCount})`}
              active={saleFilter === 'special'}
              onClick={() => setSaleFilter((f) => (f === 'special' ? 'all' : 'special'))}
            />
          )}
        </div>
      )}

      {/* Secondary pill row: sub-categories of the active parent. Hidden
          when the active selection has no children. */}
      {activeChildren.length > 0 && (
        <div style={{ ...pillRowStyle, marginTop: -2 }}>
          <CategoryPill
            label={`All ${
              topLevelCategories.find((c) => c.id === activeTopLevelId)?.name ?? ''
            }`}
            active={selectedCategoryId === activeTopLevelId}
            onClick={() => setSelectedCategoryId(activeTopLevelId)}
            subtle
          />
          {activeChildren.map((cat) => (
            <CategoryPill
              key={cat.id}
              label={cat.name}
              active={selectedCategoryId === cat.id}
              onClick={() => setSelectedCategoryId(cat.id)}
              subtle
            />
          ))}
        </div>
      )}

      {/* Errors / loading */}
      {dataError && (
        <div style={{
          background: '#FEF3C7', border: '1px solid #FDE68A',
          borderRadius: 8, padding: '10px 12px', fontSize: 13, color: '#92400E',
        }}>
          {dataError}
        </div>
      )}
      {isLoading && (
        <div style={{
          background: '#FFFFFF', border: `1px solid ${C.border}`,
          borderRadius: 8, padding: '10px 12px', fontSize: 13, color: C.muted,
        }}>
          Loading menu…
        </div>
      )}

      {/* Item tile grid */}
      <div style={{
        flex: 1, minHeight: 0, overflow: 'auto',
        background: C.panel, borderRadius: 12,
        border: `1px solid ${C.border}`, padding: 12,
        boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
      }}>
        {visibleItems.length === 0 ? (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', padding: 40, color: C.subtle, textAlign: 'center',
          }}>
            <div style={{ fontSize: 48, marginBottom: 12, opacity: 0.5 }}>🍽️</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: C.muted }}>
              {search ? 'No items match your search' : 'No items in this category'}
            </div>
          </div>
        ) : (
          <div className="pos-menu-grid">
            {visibleItems.map((item) => {
              const c = tileColor(item.category_id);
              const price = effectiveItemPrice(item);
              const wasPrice = originalItemPrice(item);
              const hasMods = (item.modifiers?.length ?? 0) > 0;
              const hasVariants = item.has_variants;
              const hasPackagingChoices = (item.packaging_options?.length ?? 0) > 1;
              // For items without modifiers, variants, or packaging choices,
              // tap = direct add to cart. Otherwise open configure.
              const onClick = () => {
                if (readOnly) return;
                if (hasMods || hasVariants || hasPackagingChoices) handleSelectItem(item);
                else addToCart(item);
              };
              return (
                <button
                  key={item.id}
                  onClick={onClick}
                  disabled={readOnly}
                  title={readOnly ? 'Resumed ticket is view-only. Cancel resume to edit.' : undefined}
                  style={{
                    aspectRatio: '1 / 1',
                    position: 'relative',
                    background: c.bg,
                    color: c.fg,
                    border: 'none',
                    borderRadius: 12,
                    padding: '12px 12px 10px 14px',
                    cursor: readOnly ? 'not-allowed' : 'pointer',
                    opacity: readOnly ? 0.45 : 1,
                    textAlign: 'left',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    boxShadow: '0 1px 2px rgba(15,23,42,0.06)',
                    transition: 'transform 0.05s, box-shadow 0.12s',
                    overflow: 'hidden',
                  }}
                  onMouseDown={(e) => (e.currentTarget.style.transform = 'scale(0.97)')}
                  onMouseUp={(e) => (e.currentTarget.style.transform = 'scale(1)')}
                  onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
                  onMouseEnter={(e) => (e.currentTarget.style.boxShadow = '0 4px 12px rgba(15,23,42,0.10)')}
                  onMouseOut={(e) => (e.currentTarget.style.boxShadow = '0 1px 2px rgba(15,23,42,0.06)')}
                >
                  {/* Category accent strip — keeps category visible
                      even though the tile body is muted. */}
                  <div style={{
                    position: 'absolute',
                    left: 0, top: 0, bottom: 0, width: 4,
                    background: c.fg,
                    opacity: 0.85,
                  }} />
                  <span style={{
                    fontSize: 14, fontWeight: 700, lineHeight: 1.2,
                    color: '#0F172A',
                    display: '-webkit-box', WebkitLineClamp: 3,
                    WebkitBoxOrient: 'vertical', overflow: 'hidden',
                  }}>
                    {item.name}
                  </span>
                  <span style={{
                    fontSize: 13, fontWeight: 800,
                    color: c.fg,
                    display: 'flex', alignItems: 'baseline', gap: 4, flexWrap: 'wrap',
                  }}>
                    {hasVariants && <span style={{ fontSize: 10, opacity: 0.75, fontWeight: 600 }}>from</span>}
                    MVR {price.toFixed(2)}
                    {wasPrice != null && wasPrice > price && (
                      <span style={{ fontSize: 10, fontWeight: 600, opacity: 0.65, textDecoration: 'line-through' }}>
                        {wasPrice.toFixed(2)}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Configure modal — modifiers / variants / packaging choices */}
      {selectedItem && (
        <ConfigurePanel
          item={selectedItem}
          selectedModifiers={selectedModifiers}
          toggleModifier={toggleModifier}
          onAdd={(variant, packagingOptionId) => {
            addToCart(selectedItem, {
              variant: variant ?? undefined,
              packagingOptionId,
            });
            clearSelectedItem();
          }}
          onClose={clearSelectedItem}
        />
      )}
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Centered modal for choosing size/variant + modifiers before adding to cart.
// Centered (not a bottom sheet) so it stays in the thumb/eye zone on iPad
// portrait and phone — the old flex-end dock sat under the cart dock.

function ConfigurePanel({
  item,
  selectedModifiers,
  toggleModifier,
  onAdd,
  onClose,
}: {
  item: Item;
  selectedModifiers: Modifier[];
  toggleModifier: (m: Modifier) => void;
  /** When the item has variants, the chosen variant is passed back so
   *  the cart can record the correct id/name/price. For items without
   *  variants we pass `null` and `addToCart` falls back to base_price. */
  onAdd: (variant: Variant | null, packagingOptionId?: number | null) => void;
  onClose: () => void;
}) {
  const c = tileColor(item.category_id);
  const mods = item.modifiers ?? [];
  const packagingOptions = useMemo(
    () => (item.packaging_options ?? []).slice().sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
    [item],
  );
  const showPackagingPicker = packagingOptions.length > 1;
  const variants = useMemo(
    () => (item.has_variants ? (item.variants ?? []).filter((v) => v.is_active) : []),
    [item],
  );

  // When modifiers exist alongside variants we pre-select the default
  // variant so the cashier can flip through modifier chips and then
  // tap the bottom Add button to commit. In the one-tap-add case
  // (variants but NO modifiers and no packaging choice) we deliberately
  // leave the choice empty — the first variant tap IS the add.
  const oneTapMode = item.has_variants && mods.length === 0 && !showPackagingPicker;
  const [chosenVariantId, setChosenVariantId] = useState<number | null>(() => {
    if (!item.has_variants) return null;
    if (oneTapMode) return null;
    const def = variants[0];
    return def?.id ?? null;
  });
  const [chosenPackagingId, setChosenPackagingId] = useState<number | null>(() => {
    if (!showPackagingPicker) {
      return packagingOptions.find((o) => o.is_default)?.id ?? packagingOptions[0]?.id ?? null;
    }
    return packagingOptions.find((o) => o.is_default)?.id ?? packagingOptions[0]?.id ?? null;
  });

  const chosenVariant = variants.find((v) => v.id === chosenVariantId) ?? null;

  // Headline price reflects the currently-chosen variant (or base price
  // when there are no variants). Keeps the modal honest about what will
  // hit the receipt. In one-tap mode with nothing yet chosen we show
  // "from X" using the cheapest variant so the cashier sees the price
  // range up-front.
  const headlinePrice = chosenVariant
    ? Number(chosenVariant.effective_price ?? chosenVariant.price)
    : oneTapMode && variants.length > 0
      ? Math.min(...variants.map((v) => Number(v.effective_price ?? v.price)))
      : effectiveItemPrice(item);
  const headlineOriginal = chosenVariant
    ? (chosenVariant.effective_price != null && chosenVariant.original_price != null
      ? Number(chosenVariant.original_price)
      : null)
    : originalItemPrice(item);

  const needsVariant = item.has_variants && variants.length > 0 && chosenVariantId == null;
  const canAdd = !needsVariant;

  return (
    <div
      className="pos-configure-backdrop"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        background: 'rgba(15,23,42,0.45)',
        zIndex: z.modalBackdrop,
      }}
      role="dialog"
      aria-modal="true"
      aria-label={`Configure ${item.name}`}
    >
      <div
        className="pos-configure-panel"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#FFFFFF',
          boxShadow: '0 20px 48px rgba(15,23,42,0.22)',
        }}
      >
        {/* Header tile */}
        <div style={{
          background: c.bg, color: c.fg, padding: '18px 20px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          flexShrink: 0,
        }}>
          <div style={{ minWidth: 0, paddingRight: 12 }}>
            <div style={{ fontSize: 16, fontWeight: 700 }}>{item.name}</div>
            <div style={{ fontSize: 13, opacity: 0.9, marginTop: 2 }}>
              {oneTapMode && !chosenVariant ? 'from ' : ''}MVR {headlinePrice.toFixed(2)}
              {headlineOriginal != null && headlineOriginal > headlinePrice && (
                <span style={{ marginLeft: 6, textDecoration: 'line-through', opacity: 0.75, fontSize: 12 }}>
                  {headlineOriginal.toFixed(2)}
                </span>
              )}
              {chosenVariant && (
                <span style={{ marginLeft: 8, opacity: 0.85 }}>· {chosenVariant.name}</span>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              background: 'rgba(255,255,255,0.55)',
              color: c.fg,
              border: 'none', width: 44, height: 44, borderRadius: 999,
              fontSize: 22, lineHeight: 1, cursor: 'pointer',
              fontWeight: 700, flexShrink: 0,
            }}
          >×</button>
        </div>

        <div style={{ padding: 20, overflow: 'auto', flex: 1, display: 'grid', gap: 18 }}>
          {/* Variant picker — radio-style. Mandatory when the item has
              variants; otherwise the section is omitted entirely.
              Previously this block just said "the default variant will
              be added", which meant cashiers physically could not ring
              up Medium or Large.

              UX shortcut: when the item has variants but NO modifiers,
              tapping a variant adds the line straight to the ticket
              (no second "Add" tap). When modifiers also exist we just
              select the variant — the cashier still needs to pick
              their mods before the Add button completes the line. */}
          {item.has_variants && (
            <div>
              <div style={sectionLabel}>
                Size / Option
                {mods.length === 0 && variants.length > 0 && (
                  <span style={{
                    marginLeft: 8,
                    fontSize: 11,
                    fontWeight: 600,
                    color: C.subtle,
                    textTransform: 'none',
                    letterSpacing: 0,
                  }}>
                    · tap to add
                  </span>
                )}
              </div>
              {variants.length === 0 ? (
                <div style={{ fontSize: 13, color: C.muted }}>
                  No active variants — ask a manager to enable at least one.
                </div>
              ) : (
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
                  gap: 8,
                }}>
                  {variants.map((v) => {
                    const active = chosenVariantId === v.id;
                    return (
                      <button
                        key={v.id}
                        onClick={() => {
                          setChosenVariantId(v.id);
                          if (oneTapMode) onAdd(v, chosenPackagingId);
                        }}
                        style={{
                          padding: '14px 14px',
                          borderRadius: 10,
                          border: `2px solid ${active ? C.text : C.border2}`,
                          background: active ? C.text : '#FFFFFF',
                          color: active ? '#FFFFFF' : C.text,
                          cursor: 'pointer',
                          textAlign: 'left',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 4,
                          minHeight: 64,
                          transition: 'transform 60ms ease, box-shadow 120ms ease',
                          boxShadow: active ? '0 2px 8px rgba(15,23,42,0.18)' : 'none',
                        }}
                        onMouseDown={(e) => (e.currentTarget.style.transform = 'scale(0.98)')}
                        onMouseUp={(e) => (e.currentTarget.style.transform = '')}
                        onMouseLeave={(e) => (e.currentTarget.style.transform = '')}
                      >
                        <span style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.2 }}>
                          {v.name}
                        </span>
                        <span style={{
                          fontSize: 13, fontWeight: 700,
                          opacity: active ? 0.95 : 0.85,
                          fontVariantNumeric: 'tabular-nums',
                        }}>
                          MVR {Number(v.effective_price ?? v.price).toFixed(2)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Modifier picker — toggle chips. Hidden when there are no
              modifiers, so a variant-only item gets a clean variant
              picker with no awkward empty section underneath. */}
          {mods.length > 0 && (
            <div>
              <div style={sectionLabel}>Modifiers</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {mods.map((m) => {
                  const active = selectedModifiers.some((x) => x.id === m.id);
                  return (
                    <button
                      key={m.id}
                      onClick={() => toggleModifier(m)}
                      style={{
                        padding: '10px 14px', borderRadius: 999,
                        border: `1px solid ${active ? C.text : C.border2}`,
                        background: active ? C.text : '#FFFFFF',
                        color: active ? '#FFFFFF' : C.text,
                        fontSize: 13, fontWeight: 600, cursor: 'pointer',
                      }}
                    >
                      {m.name}{Number(m.price) > 0 ? ` +${Number(m.price).toFixed(2)}` : ''}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {showPackagingPicker && (
            <div>
              <div style={sectionLabel}>Packaging</div>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
                gap: 8,
              }}>
                {packagingOptions.map((opt) => {
                  const active = chosenPackagingId === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setChosenPackagingId(opt.id)}
                      style={{
                        padding: '14px 14px',
                        borderRadius: 10,
                        border: `2px solid ${active ? C.text : C.border2}`,
                        background: active ? C.text : '#FFFFFF',
                        color: active ? '#FFFFFF' : C.text,
                        cursor: 'pointer',
                        textAlign: 'left',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 4,
                        minHeight: 64,
                      }}
                    >
                      <span style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.2 }}>
                        {opt.name}
                      </span>
                      <span style={{
                        fontSize: 13, fontWeight: 700,
                        opacity: active ? 0.95 : 0.85,
                        fontVariantNumeric: 'tabular-nums',
                      }}>
                        {Number(opt.fee) > 0 ? `+MVR ${Number(opt.fee).toFixed(2)}` : 'No fee'}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Defensive fallback — shouldn't fire in practice because the
              tile-tap handler only opens this modal when there are
              modifiers, variants, or packaging choices. */}
          {!item.has_variants && mods.length === 0 && !showPackagingPicker && (
            <div style={{ fontSize: 13, color: C.muted }}>
              Nothing to configure — tap "Add to ticket" to drop it on the order.
            </div>
          )}
        </div>

        <div style={{
          padding: 16,
          borderTop: `1px solid ${C.border}`,
          display: 'flex',
          gap: 8,
          flexShrink: 0,
        }}>
          {/* In one-tap variant mode (no modifiers) tapping a size IS
              the add — a second "Add to ticket" button next to it
              was confusing cashiers ("why is this here?") and risked
              double-adding if they tapped it after a variant. We
              collapse the footer to a full-width Cancel so the only
              way to commit is the variant tap, which makes the flow
              unambiguous. */}
          {oneTapMode ? (
            <button
              onClick={onClose}
              style={{
                flex: 1, padding: '12px 16px', borderRadius: 10,
                background: '#FFFFFF', border: `1px solid ${C.border2}`,
                fontSize: 14, fontWeight: 700, color: C.muted, cursor: 'pointer',
                minHeight: 48,
              }}
            >
              Cancel
            </button>
          ) : (
            <>
              <button
                onClick={onClose}
                style={{
                  flex: 1, padding: '12px 16px', borderRadius: 10,
                  background: '#FFFFFF', border: `1px solid ${C.border2}`,
                  fontSize: 14, fontWeight: 700, color: C.muted, cursor: 'pointer',
                  minHeight: 48,
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => onAdd(chosenVariant, chosenPackagingId)}
                disabled={!canAdd}
                title={needsVariant ? 'Pick a size/option to continue' : undefined}
                style={{
                  flex: 2, padding: '12px 16px', borderRadius: 10,
                  background: canAdd ? '#10B981' : '#A7F3D0',
                  border: 'none',
                  fontSize: 14, fontWeight: 700, color: '#FFFFFF',
                  cursor: canAdd ? 'pointer' : 'not-allowed',
                  minHeight: 48,
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}
              >
                <span>Add to ticket</span>
                <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                  MVR {headlinePrice.toFixed(2)}
                </span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const sectionLabel: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: '#64748B',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  marginBottom: 10,
};
