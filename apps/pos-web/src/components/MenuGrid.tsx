import { useMemo, useState } from "react";
import type { Category, Item, Modifier } from "../types";
import { effectiveItemPrice } from "../hooks/useCart";

type Props = {
  categories: Category[];
  selectedCategoryId: number | null;
  setSelectedCategoryId: (id: number) => void;
  filteredItems: Item[];
  isLoading: boolean;
  dataError: string;

  selectedItem: Item | null;
  selectedModifiers: Modifier[];
  handleSelectItem: (item: Item) => void;
  toggleModifier: (mod: Modifier) => void;
  addToCart: (item: Item) => void;
  clearSelectedItem: () => void;

  barcode: string;
  setBarcode: (v: string) => void;
  onBarcodeSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
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
  barcode, setBarcode, onBarcodeSubmit,
}: Props) {
  const [search, setSearch] = useState("");

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

      {/* Category pills row */}
      {categories.length > 0 && (
        <div style={{
          display: 'flex', gap: 6, overflowX: 'auto',
          paddingBottom: 4, flexShrink: 0,
          scrollbarWidth: 'thin',
        }}>
          {categories.map((cat) => {
            const active = selectedCategoryId === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => setSelectedCategoryId(cat.id)}
                style={{
                  padding: '8px 16px', borderRadius: 999,
                  border: `1px solid ${active ? C.text : C.border}`,
                  background: active ? C.text : '#FFFFFF',
                  color: active ? '#FFFFFF' : C.text,
                  fontSize: 12, fontWeight: 700,
                  cursor: 'pointer', whiteSpace: 'nowrap',
                  transition: 'background 0.1s',
                }}
              >
                {cat.name}
              </button>
            );
          })}
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
                if (hasMods || hasVariants) handleSelectItem(item);
                else addToCart(item);
              };
              return (
                <button
                  key={item.id}
                  onClick={onClick}
                  style={{
                    aspectRatio: '1 / 1',
                    background: c.bg, color: c.fg,
                    border: 'none', borderRadius: 10, padding: 10,
                    cursor: 'pointer', textAlign: 'left',
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
          onAdd={() => { addToCart(selectedItem); clearSelectedItem(); }}
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
  onAdd: () => void;
  onClose: () => void;
}) {
  const c = tileColor(item.category_id);
  const price = effectiveItemPrice(item);
  const mods = item.modifiers ?? [];

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
            <div style={{ fontSize: 13, opacity: 0.9, marginTop: 2 }}>MVR {price.toFixed(2)}</div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              background: 'rgba(255,255,255,0.18)', color: '#FFFFFF',
              border: 'none', width: 32, height: 32, borderRadius: 999,
              fontSize: 20, lineHeight: 1, cursor: 'pointer',
            }}
          >×</button>
        </div>

        <div style={{ padding: 20, overflow: 'auto', flex: 1 }}>
          {mods.length > 0 ? (
            <>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
                Modifiers
              </div>
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
            </>
          ) : (
            <div style={{ fontSize: 13, color: C.muted }}>
              This item has variants — the default variant will be added.
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
            }}
          >
            Cancel
          </button>
          <button
            onClick={onAdd}
            style={{
              flex: 2, padding: '12px 16px', borderRadius: 10,
              background: '#10B981', border: 'none',
              fontSize: 14, fontWeight: 700, color: '#FFFFFF', cursor: 'pointer',
            }}
          >
            Add to ticket
          </button>
        </div>
      </div>
    </div>
  );
}
