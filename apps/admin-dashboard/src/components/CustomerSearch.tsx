import { useRef, useState } from 'react';
import { fetchAdminCustomers } from '../api';
import { Input } from './SharedUI';

type Props = {
  value: number | null;
  onChange: (id: number | null, label: string) => void;
  placeholder?: string;
};

/**
 * Debounced customer name/phone picker used by Promotions, Gift Cards, etc.
 * Leave empty / clear to mean “no customer” (anonymous / public).
 */
export function CustomerSearch({
  value,
  onChange,
  placeholder = 'Search by name or phone… (optional)',
}: Props) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<{ id: number; name: string | null; phone: string }[]>([]);
  const [searching, setSearching] = useState(false);
  const [label, setLabel] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = (v: string) => {
    setQ(v);
    if (timer.current) clearTimeout(timer.current);
    if (!v.trim()) { setResults([]); return; }
    timer.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetchAdminCustomers({ search: v.trim(), page: 1 });
        setResults((res.data ?? []).slice(0, 6).map((c) => ({ id: c.id, name: c.name, phone: c.phone })));
      } finally { setSearching(false); }
    }, 300);
  };

  const select = (c: { id: number; name: string | null; phone: string }) => {
    const lbl = `${c.name ?? 'Unknown'} (${c.phone})`;
    setLabel(lbl); setQ(''); setResults([]);
    onChange(c.id, lbl);
  };

  return (
    <div style={{ position: 'relative' }}>
      {value ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#F0FDF4', border: '1px solid #86EFAC', borderRadius: 8, padding: '7px 10px', fontSize: 13 }}>
          <span style={{ flex: 1, color: '#166534', fontWeight: 600 }}>{label || `Customer #${value}`}</span>
          <button
            type="button"
            onClick={() => { onChange(null, ''); setLabel(''); }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#DC2626', fontSize: 16, lineHeight: 1 }}
            aria-label="Clear customer"
          >
            ×
          </button>
        </div>
      ) : (
        <>
          <Input value={q} onChange={search} placeholder={placeholder} />
          {searching && <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 4 }}>Searching…</div>}
          {results.length > 0 && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--color-surface)',
              border: '1px solid var(--color-border)', borderRadius: 8, zIndex: 50,
              boxShadow: '0 4px 16px rgba(0,0,0,0.1)', marginTop: 2,
            }}>
              {results.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => select(c)}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left', padding: '9px 12px',
                    background: 'none', border: 'none', cursor: 'pointer', fontSize: 13,
                    borderBottom: '1px solid #F5F0EB', fontFamily: 'inherit',
                  }}
                >
                  <span style={{ fontWeight: 600 }}>{c.name ?? 'Unknown'}</span>
                  <span style={{ color: 'var(--color-text-muted)', marginLeft: 8 }}>{c.phone}</span>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
