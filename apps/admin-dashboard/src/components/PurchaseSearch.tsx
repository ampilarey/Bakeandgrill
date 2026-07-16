import { useRef, useState } from 'react';
import { fetchPurchases } from '../api';
import { Input } from './SharedUI';

export type PurchaseSearchSelection = {
  id: number;
  label: string;
  purchaseNumber: string;
  total: number;
};

type Props = {
  value: PurchaseSearchSelection | null;
  onChange: (v: PurchaseSearchSelection | null) => void;
  placeholder?: string;
};

/** Debounced purchase-order picker by PO number or supplier. */
export function PurchaseSearch({
  value,
  onChange,
  placeholder = 'Search PO number or supplier…',
}: Props) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<{
    id: number; purchaseNumber: string; label: string; sub: string; total: number;
  }[]>([]);
  const [searching, setSearching] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = (v: string) => {
    setQ(v);
    if (timer.current) clearTimeout(timer.current);
    if (!v.trim()) { setResults([]); return; }
    timer.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetchPurchases({ search: v.trim(), page: 1 });
        setResults((res.purchases?.data ?? []).slice(0, 8).map((p) => {
          const total = parseFloat(String(p.total ?? 0));
          return {
            id: p.id,
            purchaseNumber: p.purchase_number,
            label: p.purchase_number,
            sub: `${p.supplier?.name ?? 'No supplier'} · MVR ${total.toFixed(2)} · ${p.status}`,
            total,
          };
        }));
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
          onClick={() => onChange(null)}
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
      <Input value={q} onChange={search} placeholder={placeholder} />
      {searching && <div style={{ fontSize: 12, color: '#9C8E7E', marginTop: 4 }}>Searching…</div>}
      {results.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff',
          border: '1px solid #E8E0D8', borderRadius: 8, zIndex: 50,
          boxShadow: '0 4px 16px rgba(0,0,0,0.1)', marginTop: 2, maxHeight: 240, overflowY: 'auto',
        }}>
          {results.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => {
                onChange({
                  id: r.id,
                  label: `${r.label} — ${r.sub}`,
                  purchaseNumber: r.purchaseNumber,
                  total: r.total,
                });
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
