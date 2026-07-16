import { useRef, useState } from 'react';
import { fetchAdminItems, fetchInventoryItems, type MenuItem, type InventoryItem } from '../api';
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
};

type InventoryProps = {
  kind: 'inventory';
  value: InventoryItemSelection | null;
  onChange: (v: InventoryItemSelection | null) => void;
  placeholder?: string;
};

type Props = MenuProps | InventoryProps;

/** Debounced menu or inventory item picker by name. */
export function ItemSearch(props: Props) {
  const { kind, value, onChange, placeholder } = props;
  const excludeIds = kind === 'menu' ? (props.excludeIds ?? []) : [];
  const excludeCombos = kind === 'menu' ? Boolean(props.excludeCombos) : false;
  const [q, setQ] = useState('');
  const [results, setResults] = useState<{ id: number; label: string; sub: string; menuItem?: MenuItem; invItem?: InventoryItem }[]>([]);
  const [searching, setSearching] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = (v: string) => {
    setQ(v);
    if (timer.current) clearTimeout(timer.current);
    if (!v.trim()) { setResults([]); return; }
    timer.current = setTimeout(async () => {
      setSearching(true);
      try {
        if (kind === 'menu') {
          const res = await fetchAdminItems({ search: v.trim(), page: 1, per_page: 15 });
          const excluded = new Set(excludeIds);
          setResults((res.data ?? [])
            .filter((item) => !excluded.has(item.id) && !(excludeCombos && item.is_combo))
            .slice(0, 10)
            .map((item) => ({
              id: item.id,
              label: item.name,
              sub: `MVR ${parseFloat(String(item.base_price ?? 0)).toFixed(2)}${item.category?.name ? ` · ${item.category.name}` : ''}`,
              menuItem: item,
            })));
        } else {
          const res = await fetchInventoryItems({ search: v.trim(), page: 1 });
          setResults((res.data ?? []).slice(0, 10).map((item) => ({
            id: item.id,
            label: item.name,
            sub: [item.unit, item.sku, item.category?.name].filter(Boolean).join(' · ') || 'Inventory',
            invItem: item,
          })));
        }
      } catch { setResults([]); }
      finally { setSearching(false); }
    }, 300);
  };

  if (value) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#F0FDF4', border: '1px solid #86EFAC', borderRadius: 8, padding: '9px 12px', fontSize: 13 }}>
        <span style={{ flex: 1, color: '#166534', fontWeight: 600 }}>{value.label}</span>
        <button
          type="button"
          onClick={() => onChange(null as never)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#DC2626', fontSize: 18, lineHeight: 1 }}
          aria-label="Clear selection"
        >
          ×
        </button>
      </div>
    );
  }

  return (
    <div style={{ position: 'relative' }}>
      <Input
        value={q}
        onChange={search}
        placeholder={placeholder ?? (kind === 'menu' ? 'Search menu items…' : 'Search inventory items…')}
      />
      {searching && <div style={{ fontSize: 12, color: '#9C8E7E', marginTop: 4 }}>Searching…</div>}
      {results.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff',
          border: '1px solid #E8E0D8', borderRadius: 8, zIndex: 50,
          boxShadow: '0 4px 16px rgba(0,0,0,0.1)', marginTop: 2, maxHeight: 260, overflowY: 'auto',
        }}>
          {results.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => {
                if (kind === 'menu' && r.menuItem) {
                  (onChange as MenuProps['onChange'])({ id: r.id, label: r.label, item: r.menuItem });
                } else if (kind === 'inventory' && r.invItem) {
                  (onChange as InventoryProps['onChange'])({ id: r.id, label: r.label, item: r.invItem });
                }
                setQ('');
                setResults([]);
              }}
              style={{
                display: 'block', width: '100%', textAlign: 'left', padding: '10px 12px',
                background: 'none', border: 'none', cursor: 'pointer', fontSize: 13,
                borderBottom: '1px solid #F5F0EB', fontFamily: 'inherit',
              }}
            >
              <div style={{ fontWeight: 700, color: '#1C1408' }}>{r.label}</div>
              <div style={{ fontSize: 12, color: '#9C8E7E', marginTop: 2 }}>{r.sub}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
