import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, X } from 'lucide-react';
import { fetchOrders, fetchStaff } from '../api';
import { useCurrentUserPermissions } from '../hooks/usePermissions';
import { getAllNavItems, getNavItemGroupLabel, canNavItem } from './navConfig';

type Result = {
  id: string;
  label: string;
  sub?: string;
  icon: string;
  action: () => void;
};

interface Props {
  open: boolean;
  onClose: () => void;
}

export function CommandPalette({ open, onClose }: Props) {
  const navigate = useNavigate();
  const { can, user } = useCurrentUserPermissions();
  const canOrders = can('orders.view');
  const canStaff = can('staff.view');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setSelected(0);
      dynamicLoaded.current = false;
      cachedOrders.current = [];
      cachedStaff.current  = [];
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  const buildStatic = (q: string): Result[] => {
    const lower = q.toLowerCase();
    return getAllNavItems()
      .filter((item) => user != null && canNavItem(user, item))
      .filter((item) => {
        if (!q) return true;
        const group = getNavItemGroupLabel(item.to);
        return (
          item.label.toLowerCase().includes(lower)
          || (item.description ?? '').toLowerCase().includes(lower)
          || group.toLowerCase().includes(lower)
        );
      })
      .slice(0, q ? 10 : 12)
      .map((item) => ({
        id: `nav-${item.to}`,
        label: item.label,
        sub: item.description ?? getNavItemGroupLabel(item.to),
        icon: '→',
        action: () => { navigate(item.to); onClose(); },
      }));
  };

  const cachedOrders = useRef<Array<{ id: number; order_number: string; status: string; total: number }>>([]);
  const cachedStaff  = useRef<Array<{ id: number; name: string; email?: string; role?: string; role_name?: string }>>([]);
  const dynamicLoaded = useRef(false);

  const runSearch = async (q: string) => {
    if (q.length < 2) {
      setResults(buildStatic(q));
      return;
    }
    setLoading(true);
    const staticR = buildStatic(q);
    setResults(staticR);

    const needsDynamic = canOrders || canStaff;
    if (!needsDynamic) {
      setLoading(false);
      return;
    }

    try {
      if (!dynamicLoaded.current) {
        const fetches: Promise<void>[] = [];
        if (canOrders) {
          fetches.push(
            fetchOrders({ per_page: 30 })
              .then((res) => { cachedOrders.current = (res.data ?? []) as typeof cachedOrders.current; })
              .catch(() => { cachedOrders.current = []; }),
          );
        }
        if (canStaff) {
          fetches.push(
            fetchStaff()
              .then((res) => { cachedStaff.current = (res.staff ?? []) as typeof cachedStaff.current; })
              .catch(() => { cachedStaff.current = []; }),
          );
        }
        await Promise.all(fetches);
        dynamicLoaded.current = true;
      }

      const qLower = q.toLowerCase();
      const dynResults: Result[] = [];

      if (canOrders) {
        cachedOrders.current
          .filter((o) => String(o.order_number).toLowerCase().includes(qLower))
          .slice(0, 4)
          .forEach((o) => {
            dynResults.push({
              id: `o-${o.id}`,
              label: `Order #${o.order_number}`,
              sub: `${o.status} · MVR ${Number(o.total ?? 0).toFixed(2)}`,
              icon: '📋',
              action: () => { navigate(`/orders?order=${o.id}`); onClose(); },
            });
          });
      }

      if (canStaff) {
        cachedStaff.current
          .filter((s) => s.name.toLowerCase().includes(qLower) || (s.email ?? '').toLowerCase().includes(qLower))
          .slice(0, 3)
          .forEach((s) => {
            dynResults.push({
              id: `st-${s.id}`,
              label: s.name,
              sub: `Staff · ${s.role_name ?? s.role ?? ''}`,
              icon: '👤',
              action: () => { navigate('/staff'); onClose(); },
            });
          });
      }

      setResults([...staticR, ...dynResults]);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  };

  useEffect(() => {
    if (!open) return;
    setSelected(0);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => void runSearch(query), 200);
    return () => { if (searchTimeout.current) clearTimeout(searchTimeout.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, open, canOrders, canStaff]);

  useEffect(() => {
    if (open && !query) setResults(buildStatic(''));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelected((s) => Math.min(s + 1, results.length - 1)); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setSelected((s) => Math.max(s - 1, 0)); }
    if (e.key === 'Enter' && results[selected]) { results[selected].action(); }
  };

  useEffect(() => {
    const el = listRef.current?.children[selected] as HTMLElement | undefined;
    el?.scrollIntoView?.({ block: 'nearest' });
  }, [selected]);

  if (!open) return null;

  return (
    <div className="command-palette-overlay" onClick={onClose}>
      <div className="command-palette" onClick={(e) => e.stopPropagation()}>
        <div className="command-palette-header">
          <Search size={18} className="command-palette-search-icon" />
          <input
            ref={inputRef}
            className="command-palette-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search pages, orders, staff…"
          />
          {loading && <span className="command-palette-loading">…</span>}
          <button type="button" className="command-palette-esc" onClick={onClose}>
            esc
          </button>
        </div>

        <div ref={listRef} className="command-palette-results">
          {results.length === 0 ? (
            <div className="command-palette-empty">
              <X size={20} style={{ display: 'block', margin: '0 auto 8px', opacity: 0.4 }} />
              No results for &ldquo;{query}&rdquo;
            </div>
          ) : (
            results.map((r, i) => (
              <button
                key={r.id}
                type="button"
                onClick={r.action}
                onMouseEnter={() => setSelected(i)}
                className={`command-palette-row${i === selected ? ' command-palette-row--selected' : ''}`}
              >
                <span className="command-palette-row-icon">{r.icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p className="command-palette-row-label">{r.label}</p>
                  {r.sub && <p className="command-palette-row-sub">{r.sub}</p>}
                </div>
                {i === selected && (
                  <span className="command-palette-row-go">↵ Go</span>
                )}
              </button>
            ))
          )}
        </div>

        <div className="command-palette-footer">
          <span>↑↓ navigate</span>
          <span>↵ select</span>
          <span>esc close</span>
        </div>
      </div>
    </div>
  );
}
