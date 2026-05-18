import { useMemo, useState } from "react";
import type { Category, Item, Modifier, Variant } from "../types";
import { effectiveItemPrice } from "../hooks/useCart";

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
    opts?: { variant?: Variant | null; modifiers?: Modifier[] },
  ) => void;
  clearSelectedItem: () => void;

  barcode: string;
  setBarcode: (v: string) => void;
  onBarcodeSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  /** When true the grid is dimmed and item taps are blocked — set
   *  while a held ticket is in "resumed" mode (cart is read-only). */
  readOnly?: boolean;
};

// Loyverse uses bright per-category colors. We pick from a fixed palette and
// hash by category id so the colors stay stable across renders.
const TILE_PALETTE = [
  { bg: '#EF4444', fg: '#FFFFFF' }, // red
  { bg: '#F97316', fg: '#FFFFFF' }, // orange
  { bg: '#F59E0B', fg: '#FFFFFF' }, // amber
  { bg: '#84CC16', fg: '#FFFFFF' }, // lime
  { bg: '#22C55E', fg: '#FFFFFF' }, // green
  { bg: '#14B8A6', fg: '#FFFFFF' }, // teal
  { bg: '#06B6D4', fg: '#FFFFFF' }, // cyan
  { bg: '#3B82F6', fg: '#FFFFFF' }, // blue
  { bg: '#6366F1', fg: '#FFFFFF' }, // indigo
  { bg: '#8B5CF6', fg: '#FFFFFF' }, // violet
  { bg: '#EC4899', fg: '#FFFFFF' }, // pink
  { bg: '#78716C', fg: '#FFFFFF' }, // warm grey
];

function tileColor(categoryId: number | null | undefined) {
  if (!categoryId) return TILE_PALETTE[0];
  return TILE_PALETTE[Math.abs(categoryId) % TILE_PALETTE.length];
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
        border: `1px solid ${active ? '#0F172A' : '#E2E8F0'}`,
        background: active ? '#0F172A' : subtle ? '#F1F5F9' : '#FFFFFF',
        color: active ? '#FFFFFF' : '#0F172A',
        fontSize: subtle ? 11 : 12,
        fontWeight: 700,
        cursor: 'pointer',
        whiteSpace: 'nowrap',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        transition: 'background 0.1s',
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

export function MenuGrid({
  categories, selectedCategoryId, setSelectedCategoryId, filteredItems,
  isLoading, dataError, selectedItem, selectedModifiers,
  handleSelectItem, toggleModifier, addToCart, clearSelectedItem,
  barcode, setBarcode, onBarcodeSubmit, readOnly = false,
}: Props) {
  const [search, setSearch] = useState("");

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

  // Cross-category text search: when the cashier types in the search box we
  // ignore the category filter so common items can be reached quickly. The
  // search box doubles as the barcode input — form submit looks up the SKU.
  const visibleItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return filteredItems;
    // Fall back to filteredItems when nothing matches — that's the right
    // behaviour when the search field is being used as a barcode buffer.
    return filteredItems.filter((it) => it.name.toLowerCase().includes(q));
  }, [filteredItems, search]);

  return (
    <section style={{
      flex: 1, minWidth: 0,
      display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      {/* Top bar: search + barcode form */}
      <div style={{
        background: C.panel, borderRadius: 12,
        border: `1px solid ${C.border}`, padding: 10,
        display: 'flex', alignItems: 'center', gap: 8,
        boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
        flexShrink: 0,
      }}>
        <form
          onSubmit={(e) => {
            if (barcode.trim()) { onBarcodeSubmit(e); return; }
            e.preventDefault();
          }}
          style={{ flex: 1, display: 'flex', gap: 8 }}
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
      </div>

      {/* Primary pill row: "All" + every top-level category. Horizontally
          scrollable so 30+ categories degrade gracefully on a tablet. */}
      {topLevelCategories.length > 0 && (
        <div style={pillRowStyle}>
          <CategoryPill
            label="All items"
            active={selectedCategoryId == null}
            onClick={() => setSelectedCategoryId(null)}
          />
          {topLevelCategories.map((cat) => (
            <CategoryPill
              key={cat.id}
              label={cat.name}
              active={activeTopLevelId === cat.id}
              onClick={() => setSelectedCategoryId(cat.id)}
              // Visual hint when the parent has sub-categories so the
              // cashier knows tapping it reveals a secondary row.
              caret={(childrenByParent.get(cat.id)?.length ?? 0) > 0}
            />
          ))}
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
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
            gap: 10,
          }}>
            {visibleItems.map((item) => {
              const c = tileColor(item.category_id);
              const price = effectiveItemPrice(item);
              const hasMods = (item.modifiers?.length ?? 0) > 0;
              const hasVariants = item.has_variants;
              // For items without modifiers OR variants, tap = direct add to cart.
              // Otherwise tap opens the configure panel for modifier selection.
              const onClick = () => {
                if (readOnly) return;
                if (hasMods || hasVariants) handleSelectItem(item);
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
                    background: c.bg, color: c.fg,
                    border: 'none', borderRadius: 10, padding: 10,
                    cursor: readOnly ? 'not-allowed' : 'pointer',
                    opacity: readOnly ? 0.45 : 1,
                    textAlign: 'left',
                    display: 'flex', flexDirection: 'column',
                    justifyContent: 'space-between',
                    boxShadow: '0 1px 3px rgba(15,23,42,0.10)',
                    transition: 'transform 0.05s, box-shadow 0.1s',
                  }}
                  onMouseDown={(e) => (e.currentTarget.style.transform = 'scale(0.97)')}
                  onMouseUp={(e) => (e.currentTarget.style.transform = 'scale(1)')}
                  onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
                >
                  <span style={{
                    fontSize: 13, fontWeight: 700, lineHeight: 1.2,
                    display: '-webkit-box', WebkitLineClamp: 3,
                    WebkitBoxOrient: 'vertical', overflow: 'hidden',
                  }}>
                    {item.name}
                  </span>
                  <span style={{
                    fontSize: 13, fontWeight: 700, opacity: 0.95,
                    display: 'flex', alignItems: 'baseline', gap: 4,
                  }}>
                    {hasVariants && <span style={{ fontSize: 9, opacity: 0.85 }}>from</span>}
                    MVR {price.toFixed(2)}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Configure modal — shows when an item with modifiers/variants is tapped */}
      {selectedItem && (
        <ConfigurePanel
          item={selectedItem}
          selectedModifiers={selectedModifiers}
          toggleModifier={toggleModifier}
          onAdd={(variant) => {
            addToCart(selectedItem, { variant: variant ?? undefined });
            clearSelectedItem();
          }}
          onClose={clearSelectedItem}
        />
      )}
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Slide-up sheet for choosing modifiers before adding to cart. Modal so the
// cashier can't accidentally tap another tile mid-configuration.

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
  onAdd: (variant: Variant | null) => void;
  onClose: () => void;
}) {
  const c = tileColor(item.category_id);
  const mods = item.modifiers ?? [];
  const variants = useMemo(
    () => (item.has_variants ? (item.variants ?? []).filter((v) => v.is_active) : []),
    [item],
  );

  // Pre-select the default variant the same way `useCart` would, so the
  // cashier just has to tap "Add to ticket" if they're happy with the
  // default. They can still pick a different size before adding.
  const [chosenVariantId, setChosenVariantId] = useState<number | null>(() => {
    if (!item.has_variants) return null;
    const def = variants[0];
    return def?.id ?? null;
  });

  const chosenVariant = variants.find((v) => v.id === chosenVariantId) ?? null;

  // Headline price reflects the currently-chosen variant (or base price
  // when there are no variants). Keeps the modal honest about what will
  // hit the receipt.
  const headlinePrice = chosenVariant
    ? Number(chosenVariant.price)
    : effectiveItemPrice(item);

  const needsVariant = item.has_variants && variants.length > 0 && chosenVariantId == null;
  const canAdd = !needsVariant;

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.4)',
        zIndex: 50, display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        padding: 16,
      }}
      role="dialog"
      aria-modal="true"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#FFFFFF', borderRadius: 14,
          width: '100%', maxWidth: 460, maxHeight: '80vh',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}
      >
        {/* Header tile */}
        <div style={{
          background: c.bg, color: c.fg, padding: '18px 20px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>{item.name}</div>
            <div style={{ fontSize: 13, opacity: 0.9, marginTop: 2 }}>
              MVR {headlinePrice.toFixed(2)}
              {chosenVariant && (
                <span style={{ marginLeft: 8, opacity: 0.85 }}>· {chosenVariant.name}</span>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              background: 'rgba(255,255,255,0.18)', color: '#FFFFFF',
              border: 'none', width: 36, height: 36, borderRadius: 999,
              fontSize: 22, lineHeight: 1, cursor: 'pointer',
            }}
          >×</button>
        </div>

        <div style={{ padding: 20, overflow: 'auto', flex: 1, display: 'grid', gap: 18 }}>
          {/* Variant picker — radio-style. Mandatory when the item has
              variants; otherwise the section is omitted entirely.
              Previously this block just said "the default variant will
              be added", which meant cashiers physically could not ring
              up Medium or Large. */}
          {item.has_variants && (
            <div>
              <div style={sectionLabel}>Size / Option</div>
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
                        onClick={() => setChosenVariantId(v.id)}
                        style={{
                          padding: '12px 14px',
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
                        <span style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.2 }}>
                          {v.name}
                        </span>
                        <span style={{
                          fontSize: 13, fontWeight: 700,
                          opacity: active ? 0.95 : 0.85,
                          fontVariantNumeric: 'tabular-nums',
                        }}>
                          MVR {Number(v.price).toFixed(2)}
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

          {/* Defensive fallback — shouldn't fire in practice because the
              tile-tap handler only opens this modal when there are
              modifiers OR variants. */}
          {!item.has_variants && mods.length === 0 && (
            <div style={{ fontSize: 13, color: C.muted }}>
              Nothing to configure — tap "Add to ticket" to drop it on the order.
            </div>
          )}
        </div>

        <div style={{ padding: 16, borderTop: `1px solid ${C.border}`, display: 'flex', gap: 8 }}>
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
            onClick={() => onAdd(chosenVariant)}
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
