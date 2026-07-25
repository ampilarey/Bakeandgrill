import { useEffect, useRef, useState } from 'react';
import {
  fetchAdminCategories,
  fetchAdminItems,
  fetchInventoryItems,
  type MenuCategory,
  type MenuItem,
  type InventoryItem,
} from '../api';
import { Input } from './SharedUI';

export type MenuItemSelection = {
  id: number;
  label: string;
  item: MenuItem;
};

export type InventoryItemSelection = {
  id: number;
  label: string;
  item: InventoryItem;
};

type MenuProps = {
  kind: 'menu';
  value: MenuItemSelection | null;
  onChange: (v: MenuItemSelection | null) => void;
  placeholder?: string;
  /** Hide these item ids from results (e.g. the parent combo being edited). */
  excludeIds?: number[];
  /** Hide other bundle/combo items from results. */
  excludeCombos?: boolean;
  /** Show category filter + browse items without typing. */
  browseByCategory?: boolean;
  /** Inline list (better inside modals) vs absolute dropdown. */
  resultsPlacement?: 'dropdown' | 'inline';
};

type InventoryProps = {
  kind: 'inventory';
  value: InventoryItemSelection | null;
  onChange: (v: InventoryItemSelection | null) => void;
  placeholder?: string;
};

type Props = MenuProps | InventoryProps;

type ResultRow = {
  id: number;
  label: string;
  sub: string;
  menuItem?: MenuItem;
  invItem?: InventoryItem;
};

/** Debounced menu or inventory item picker by name (optional category browse for menu). */
export function ItemSearch(props: Props) {
  const { kind, value, onChange, placeholder } = props;
  const excludeIds = kind === 'menu' ? (props.excludeIds ?? []) : [];
  const excludeCombos = kind === 'menu' ? Boolean(props.excludeCombos) : false;
  const browseByCategory = kind === 'menu' ? Boolean(props.browseByCategory) : false;
  const resultsPlacement = kind === 'menu' ? (props.resultsPlacement ?? 'dropdown') : 'dropdown';

  const [q, setQ] = useState('');
  const [categoryId, setCategoryId] = useState<number | ''>('');
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [results, setResults] = useState<ResultRow[]>([]);
  const [searching, setSearching] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestId = useRef(0);

  useEffect(() => {
    if (!browseByCategory) return;
    let cancelled = false;
    void fetchAdminCategories()
      .then((res) => {
        if (cancelled) return;
        const cats = (res.data ?? []).filter((c) => c.is_active !== false);
        setCategories(cats.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name)));
      })
      .catch(() => {
        if (!cancelled) setCategories([]);
      });
    return () => { cancelled = true; };
  }, [browseByCategory]);

  const runSearch = (nextQ: string, nextCategoryId: number | '') => {
    if (timer.current) clearTimeout(timer.current);

    const trimmed = nextQ.trim();
    const hasCategory = nextCategoryId !== '';
    if (!trimmed && !hasCategory) {
      setResults([]);
      setSearching(false);
      return;
    }

    timer.current = setTimeout(async () => {
      const id = ++requestId.current;
      setSearching(true);
      try {
        if (kind === 'menu') {
          const res = await fetchAdminItems({
            search: trimmed || undefined,
            category_id: hasCategory ? Number(nextCategoryId) : undefined,
            page: 1,
            per_page: hasCategory && !trimmed ? 50 : 15,
          });
          if (id !== requestId.current) return;
          const excluded = new Set(excludeIds);
          setResults((res.data ?? [])
            .filter((item) => !excluded.has(item.id) && !(excludeCombos && item.is_combo))
            .slice(0, hasCategory && !trimmed ? 40 : 10)
            .map((item) => ({
              id: item.id,
              label: item.name,
              sub: `MVR ${parseFloat(String(item.base_price ?? 0)).toFixed(2)}${item.category?.name ? ` · ${item.category.name}` : ''}`,
              menuItem: item,
            })));
        } else {
          const res = await fetchInventoryItems({ search: trimmed, page: 1 });
          if (id !== requestId.current) return;
          setResults((res.data ?? []).slice(0, 10).map((item) => ({
            id: item.id,
            label: item.name,
            sub: [item.unit, item.sku, item.category?.name].filter(Boolean).join(' · ') || 'Inventory',
            invItem: item,
          })));
        }
      } catch {
        if (id === requestId.current) setResults([]);
      } finally {
        if (id === requestId.current) setSearching(false);
      }
    }, trimmed ? 300 : 80);
  };

  const search = (v: string) => {
    setQ(v);
    runSearch(v, categoryId);
  };

  const selectCategory = (raw: string) => {
    const next = raw === '' ? '' : Number(raw);
    setCategoryId(next);
    runSearch(q, next);
  };

  const pick = (r: ResultRow) => {
    if (kind === 'menu' && r.menuItem) {
      (onChange as MenuProps['onChange'])({ id: r.id, label: r.label, item: r.menuItem });
    } else if (kind === 'inventory' && r.invItem) {
      (onChange as InventoryProps['onChange'])({ id: r.id, label: r.label, item: r.invItem });
    }
    setQ('');
    setResults([]);
  };

  if (value) {
    const categoryLabel = kind === 'menu' && value.item.category?.name
      ? value.item.category.name
      : null;
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, background: '#F0FDF4',
        border: '1px solid #86EFAC', borderRadius: 10, padding: '10px 12px', fontSize: 13,
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: '#166534', fontWeight: 700 }}>{value.label}</div>
          {categoryLabel && (
            <div style={{ color: '#15803d', fontSize: 12, marginTop: 2 }}>{categoryLabel}</div>
          )}
        </div>
        <button
          type="button"
          onClick={() => onChange(null as never)}
          style={{
            background: 'none', border: 'none', cursor: 'pointer', color: '#DC2626',
            fontSize: 22, lineHeight: 1, minHeight: 40, minWidth: 40,
          }}
          aria-label="Clear selection"
        >
          ×
        </button>
      </div>
    );
  }

  const showEmptyHint = browseByCategory && !q.trim() && categoryId === '' && !searching;
  const list = (
    <>
      {searching && <div style={{ fontSize: 12, color: '#9C8E7E', marginTop: 6 }}>Loading items…</div>}
      {showEmptyHint && (
        <p style={{ margin: '8px 0 0', fontSize: 12, color: '#9C8E7E', lineHeight: 1.45 }}>
          Pick a category to browse, or type a name to search.
        </p>
      )}
      {!searching && !showEmptyHint && results.length === 0 && (q.trim() || categoryId !== '') && (
        <p style={{ margin: '8px 0 0', fontSize: 12, color: '#9C8E7E' }}>No items found.</p>
      )}
      {results.length > 0 && (
        <div
          className={resultsPlacement === 'inline' ? 'item-search-results item-search-results--inline' : 'item-search-results'}
          style={resultsPlacement === 'inline' ? {
            marginTop: 8,
            background: '#fff',
            border: '1px solid #E8E0D8',
            borderRadius: 10,
            maxHeight: 240,
            overflowY: 'auto',
            WebkitOverflowScrolling: 'touch',
          } : {
            position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff',
            border: '1px solid #E8E0D8', borderRadius: 8, zIndex: 50,
            boxShadow: '0 4px 16px rgba(0,0,0,0.1)', marginTop: 2, maxHeight: 260, overflowY: 'auto',
          }}
        >
          {results.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => pick(r)}
              style={{
                display: 'block', width: '100%', textAlign: 'left', padding: '12px 12px',
                background: 'none', border: 'none', cursor: 'pointer', fontSize: 13,
                borderBottom: '1px solid #F5F0EB', fontFamily: 'inherit', minHeight: 44,
              }}
            >
              <div style={{ fontWeight: 700, color: '#1C1408' }}>{r.label}</div>
              <div style={{ fontSize: 12, color: '#9C8E7E', marginTop: 2 }}>{r.sub}</div>
            </button>
          ))}
        </div>
      )}
    </>
  );

  return (
    <div className="item-search" style={{ position: 'relative' }}>
      {browseByCategory && (
        <label style={{ display: 'block', marginBottom: 8 }}>
          <span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#6B5D4F', marginBottom: 4 }}>
            Category
          </span>
          <select
            value={categoryId === '' ? '' : String(categoryId)}
            onChange={(e) => selectCategory(e.target.value)}
            style={{
              width: '100%', minHeight: 44, height: 44, padding: '0 12px',
              border: '1.5px solid #E8E0D8', borderRadius: 10, fontSize: 14,
              fontFamily: 'inherit', background: '#fff', color: '#1C1408',
            }}
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </label>
      )}
      <Input
        value={q}
        onChange={search}
        placeholder={placeholder ?? (
          browseByCategory
            ? (categoryId !== '' ? 'Filter items in category…' : 'Search menu items…')
            : (kind === 'menu' ? 'Search menu items…' : 'Search inventory items…')
        )}
      />
      {list}
    </div>
  );
}
