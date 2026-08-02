import { useRef, useState } from 'react';
import { fetchOrders } from '../api';
import { Input } from './SharedUI';

export type OrderSearchSelection = {
  id: number;
  label: string;
  orderNumber: string;
  total: number;
};

type Props = {
  value: OrderSearchSelection | null;
  onChange: (v: OrderSearchSelection | null) => void;
  placeholder?: string;
};

/** Debounced order picker by number / customer / phone. */
export function OrderSearch({
  value,
  onChange,
  placeholder = 'Search order number, customer, phone…',
}: Props) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<{
    id: number; orderNumber: string; label: string; sub: string; total: number;
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
        const res = await fetchOrders({ search: v.trim(), page: 1, per_page: 8 });
        setResults((res.data ?? []).slice(0, 8).map((o) => {
          const total = parseFloat(String(o.total ?? 0));
          const orderNumber = o.order_number;
          return {
            id: o.id,
            orderNumber,
            label: `#${orderNumber}`,
            sub: `${o.customer?.name ?? o.customer_name ?? '—'} · MVR ${total.toFixed(2)} · ${o.status}`,
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
      {searching && <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 4 }}>Searching…</div>}
      {results.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff',
          border: '1px solid var(--color-border)', borderRadius: 8, zIndex: 50,
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
                  orderNumber: r.orderNumber,
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
              <div style={{ fontWeight: 700, color: 'var(--color-text)' }}>{r.label}</div>
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2 }}>{r.sub}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
