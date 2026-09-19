import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowDownRight, ArrowUpRight, Minus, TrendingUp } from 'lucide-react';
import { fetchItemPriceHistory, fetchPriceChanges, type PriceChangeItem } from '../api/purchasing';
import { Badge, Btn, Input, Modal, PageHeader, PageShell, StatCard, TD, TH } from '../components/SharedUI';
import { ItemThumb } from '../components/InventoryItemPhoto';
import { PriceHistoryChart, Sparkline } from '../components/PriceHistoryChart';
import { useIsMobile } from '../hooks/useIsMobile';
import { usePageTitle } from '../hooks/usePageTitle';
import { fmt } from '../utils/fmt';

/*
 * Purchasing → Price changes.
 *
 * Owner, 2026-09-19: "Where i can see the price difference of each product
 * over time. An easy way to". One row per thing we buy: what it cost on the
 * last receipt, what it cost the time before, what it cost a month ago, and
 * the change, biggest rise first. Tap a row for the whole line.
 */

type Filter = 'all' | 'up' | 'down' | 'unchanged';

/**
 * Prices under one rufiyaa — flour per gram, oil per ml — need more than two
 * places, or 0.052 and 0.064 both read as "0.06" and the change looks
 * invented.
 */
const money = (n: number) => `MVR ${fmt(n, n !== 0 && Math.abs(n) < 1 ? 4 : 2)}`;

const shortDate = (iso: string) => {
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
};

/** "+18.2%" in red, "−20%" in green, "same" in grey, "first buy" when there is nothing to compare. */
export function ChangeBadge({ pct, size = 13 }: { pct: number | null; size?: number }) {
  if (pct == null) return <Badge color="gray" label="first buy" />;
  if (pct === 0) return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: size, color: 'var(--color-text-muted)', fontWeight: 600 }}><Minus size={size} /> same</span>;
  const up = pct > 0;
  return (
    <span
      data-testid="change-pct"
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: size, fontWeight: 700,
        color: up ? 'var(--color-danger-strong)' : 'var(--color-success-strong)',
      }}
    >
      {up ? <ArrowUpRight size={size} /> : <ArrowDownRight size={size} />}
      {up ? '+' : '−'}{Math.abs(pct).toFixed(1)}%
    </span>
  );
}

function matches(item: PriceChangeItem, filter: Filter): boolean {
  if (filter === 'all') return true;
  if (item.change_pct == null) return false;
  if (filter === 'up') return item.change_pct > 0;
  if (filter === 'down') return item.change_pct < 0;
  return item.change_pct === 0;
}

export default function PriceChangesPage() {
  usePageTitle('Price changes');
  const isMobile = useIsMobile();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [open, setOpen] = useState<PriceChangeItem | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['purchasing', 'price-changes'],
    queryFn: fetchPriceChanges,
    staleTime: 60_000,
  });

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data?.items ?? []).filter((i) => matches(i, filter) && (!q || i.name.toLowerCase().includes(q)));
  }, [data, search, filter]);

  const summary = data?.summary;

  return (
    <PageShell>
      <PageHeader
        section="Manage"
        title="Price changes"
        subtitle="What each item cost on the last receipt against the one before and a month ago. Biggest rise first."
      />

      {error && <p style={{ color: 'var(--color-danger-strong)', fontSize: 13 }}>{(error as Error).message}</p>}

      {summary && (
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, minmax(0, 1fr))', gap: 12, marginBottom: 16 }}>
          <StatCard label="Up 10% or more" value={String(summary.up_over_10)} sub="On the last buy" accent="var(--color-danger)" icon={TrendingUp} />
          <StatCard label="Went up" value={String(summary.up)} sub="Any rise" accent="var(--color-warning)" icon={ArrowUpRight} />
          <StatCard label="Went down" value={String(summary.down)} sub="Cheaper than before" accent="var(--color-success)" icon={ArrowDownRight} />
          <StatCard label="Items bought" value={String(summary.items)} sub={`${summary.single_price} bought once`} accent="var(--color-primary)" />
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ flex: '1 1 200px', maxWidth: 320 }}>
          <Input placeholder="Search items…" value={search} onChange={setSearch} aria-label="Search items" />
        </div>
        <div role="group" aria-label="Show" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {([['all', 'All'], ['up', 'Went up'], ['down', 'Went down'], ['unchanged', 'Same']] as Array<[Filter, string]>).map(([id, label]) => (
            <Btn key={id} small variant={filter === id ? 'primary' : 'secondary'} onClick={() => setFilter(id)} aria-pressed={filter === id}>
              {label}
            </Btn>
          ))}
        </div>
      </div>

      {isLoading ? (
        <p style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>Loading…</p>
      ) : rows.length === 0 ? (
        <p style={{ color: 'var(--color-text-muted)', fontSize: 13, padding: '24px 0', textAlign: 'center' }}>
          {data && data.items.length === 0
            ? 'No prices recorded yet. Prices are kept from every delivery you receive in Purchasing.'
            : 'Nothing matches.'}
        </p>
      ) : isMobile ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }} data-testid="price-change-cards">
          {rows.map((r) => (
            <button
              key={r.item_id}
              type="button"
              onClick={() => setOpen(r)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left', width: '100%',
                background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 12,
                padding: '10px 12px', cursor: 'pointer', font: 'inherit', color: 'inherit',
              }}
            >
              <ItemThumb url={r.photo_url} name={r.name} size={40} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name}</div>
                <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                  {money(r.last.price)} / {r.unit}
                  {r.previous ? ` · was ${money(r.previous.price)}` : ''}
                </div>
                <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
                  {shortDate(r.last.date)}{r.last.supplier ? ` · ${r.last.supplier}` : ''}
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                <ChangeBadge pct={r.change_pct} />
                <Sparkline points={r.sparkline} width={72} height={22} />
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div style={{ overflowX: 'auto', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 12 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }} data-testid="price-change-table">
            <thead>
              <tr>
                <th style={TH}>Item</th>
                <th style={TH}>Last price</th>
                <th style={TH}>Before</th>
                <th style={TH}>Change</th>
                <th style={TH}>A month ago</th>
                <th style={TH}>vs month</th>
                <th style={TH}>90 days</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.item_id}
                  onClick={() => setOpen(r)}
                  style={{ cursor: 'pointer' }}
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(r); } }}
                >
                  <td style={TD}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <ItemThumb url={r.photo_url} name={r.name} size={32} />
                      <div>
                        <div style={{ fontWeight: 600 }}>{r.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>per {r.unit}</div>
                      </div>
                    </div>
                  </td>
                  <td style={TD}>
                    <div style={{ fontWeight: 700 }}>{money(r.last.price)}</div>
                    <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
                      {shortDate(r.last.date)}{r.last.supplier ? ` · ${r.last.supplier}` : ''}
                    </div>
                  </td>
                  <td style={TD}>
                    {r.previous ? (
                      <>
                        <div>{money(r.previous.price)}</div>
                        <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
                          {shortDate(r.previous.date)}{r.previous.supplier ? ` · ${r.previous.supplier}` : ''}
                        </div>
                      </>
                    ) : <span style={{ color: 'var(--color-text-muted)' }}>—</span>}
                  </td>
                  <td style={TD}><ChangeBadge pct={r.change_pct} /></td>
                  <td style={TD}>
                    {r.month_ago ? (
                      <>
                        <div>{money(r.month_ago.price)}</div>
                        <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{shortDate(r.month_ago.date)}</div>
                      </>
                    ) : <span style={{ color: 'var(--color-text-muted)' }}>—</span>}
                  </td>
                  <td style={TD}>{r.month_ago ? <ChangeBadge pct={r.change_pct_month} /> : <span style={{ color: 'var(--color-text-muted)' }}>—</span>}</td>
                  <td style={TD}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Sparkline points={r.sparkline} />
                      <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{r.purchases_90d} buy{r.purchases_90d === 1 ? '' : 's'}</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {open && <ItemHistoryModal item={open} onClose={() => setOpen(null)} />}
    </PageShell>
  );
}

function ItemHistoryModal({ item, onClose }: { item: PriceChangeItem; onClose: () => void }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['purchasing', 'price-changes', item.item_id],
    queryFn: () => fetchItemPriceHistory(item.item_id),
  });
  const points = data?.points ?? [];

  return (
    <Modal title={`${item.name} — price per ${item.unit}`} onClose={onClose} maxWidth={720}>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 12, fontSize: 13 }}>
        <div>
          <div style={{ fontSize: 11, color: 'var(--color-text-muted)', fontWeight: 600 }}>Last</div>
          <div style={{ fontWeight: 700 }}>{money(item.last.price)}</div>
          <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{shortDate(item.last.date)}{item.last.supplier ? ` · ${item.last.supplier}` : ''}</div>
        </div>
        {item.previous && (
          <div>
            <div style={{ fontSize: 11, color: 'var(--color-text-muted)', fontWeight: 600 }}>Before</div>
            <div style={{ fontWeight: 700 }}>{money(item.previous.price)}</div>
            <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{shortDate(item.previous.date)}{item.previous.supplier ? ` · ${item.previous.supplier}` : ''}</div>
          </div>
        )}
        <div>
          <div style={{ fontSize: 11, color: 'var(--color-text-muted)', fontWeight: 600 }}>Change</div>
          <ChangeBadge pct={item.change_pct} size={15} />
        </div>
        {item.month_ago && (
          <div>
            <div style={{ fontSize: 11, color: 'var(--color-text-muted)', fontWeight: 600 }}>vs a month ago</div>
            <ChangeBadge pct={item.change_pct_month} size={15} />
          </div>
        )}
      </div>

      {error && <p style={{ color: 'var(--color-danger-strong)', fontSize: 13 }}>{(error as Error).message}</p>}
      {isLoading ? (
        <p style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>Loading…</p>
      ) : (
        <>
          <PriceHistoryChart points={points} unit={item.unit} />
          {points.length > 0 && (
            <div style={{ maxHeight: '40vh', overflowY: 'auto', marginTop: 14 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }} data-testid="price-history-points">
                <thead><tr>
                  <th style={TH}>Date</th><th style={TH}>Price</th><th style={TH}>Supplier</th><th style={TH}>Brand</th><th style={TH}>PO</th>
                </tr></thead>
                <tbody>
                  {[...points].reverse().map((p, i) => (
                    <tr key={i}>
                      <td style={TD}>{p.date}</td>
                      <td style={{ ...TD, fontWeight: 600 }}>{money(p.price)}</td>
                      <td style={TD}>{p.supplier ?? '—'}</td>
                      <td style={TD}>{p.brand ?? '—'}</td>
                      <td style={TD}>{p.purchase_number ?? (p.purchase_id ? `PO #${p.purchase_id}` : '—')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </Modal>
  );
}
