import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { usePageTitle } from '../hooks/usePageTitle';
import {
  PageHeader, PageShell, TableCard, Badge, Btn, EmptyState, Spinner, ErrorMsg, Input,
} from '../components/SharedUI';
import {
  fetchTradeDeliveries,
  fetchTradeDelivery,
  type TradeDelivery,
} from '../api';

function mvr(laar: number | null | undefined): string {
  if (laar == null) return '—';
  return `MVR ${(laar / 100).toFixed(2)}`;
}

const STATUS_LABEL: Record<string, string> = {
  draft: 'Draft',
  dispatched: 'Out with shop',
  reconciled: 'Reconciled',
  cancelled: 'Cancelled',
};

export default function WholesaleDeliveriesPage() {
  const { id } = useParams<{ id?: string }>();
  if (id) return <DeliveryDetail id={Number(id)} />;
  return <DeliveryList />;
}

function DeliveryList() {
  usePageTitle('Wholesale deliveries');
  const [rows, setRows] = useState<TradeDelivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [unreconciledDays, setUnreconciledDays] = useState('');
  const [search, setSearch] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetchTradeDeliveries({
        status: status || undefined,
        search: search || undefined,
        unreconciled_days: unreconciledDays ? Number(unreconciledDays) : undefined,
      });
      setRows(res.data ?? []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [status, unreconciledDays]);

  return (
    <PageShell>
      <PageHeader
        section="Wholesale"
        title="Deliveries"
        subtitle="What we sent to shops — money is not charged until invoicing later"
      />
      {error && <ErrorMsg message={error} />}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 16, alignItems: 'center' }}>
        <Input
          value={search}
          onChange={setSearch}
          placeholder="Search delivery or shop…"
          style={{ minWidth: 200 }}
        />
        <Btn variant="secondary" onClick={() => void load()}>Search</Btn>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          style={selectStyle}
        >
          <option value="">All statuses</option>
          <option value="dispatched">Out with shop</option>
          <option value="reconciled">Reconciled</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <label style={{ fontSize: 13, color: 'var(--color-text-secondary)', display: 'flex', gap: 8, alignItems: 'center' }}>
          Unreconciled &gt;
          <Input
            type="number"
            min={1}
            value={unreconciledDays}
            onChange={setUnreconciledDays}
            placeholder="days"
            style={{ width: 80 }}
          />
          days
        </label>
      </div>
      {loading ? <Spinner /> : (
        <TableCard>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Delivery', 'Shop', 'Status', 'Sent', 'Value', 'Flags'].map((h) => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={6}><EmptyState>No deliveries yet</EmptyState></td></tr>
              ) : rows.map((d) => (
                <tr key={d.id} style={{ borderBottom: '1px solid var(--color-border-light)' }}>
                  <td style={tdStyle}>
                    <Link to={`/wholesale/deliveries/${d.id}`} style={{ color: 'var(--color-primary)', fontWeight: 600, textDecoration: 'none' }}>
                      {d.delivery_number}
                    </Link>
                    <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
                      {d.dispatched_at ? new Date(d.dispatched_at).toLocaleString() : '—'}
                    </div>
                  </td>
                  <td style={tdStyle}>{d.shop_name ?? '—'}</td>
                  <td style={tdStyle}><Badge color={statusColor(d.status)}>{STATUS_LABEL[d.status] ?? d.status}</Badge></td>
                  <td style={tdStyle}>{d.lines_count ?? '—'} lines</td>
                  <td style={tdStyle}>{mvr(d.stamped_value_laar)}</td>
                  <td style={tdStyle}>
                    {d.has_mismatch && <Badge color="orange">Mismatch</Badge>}
                    {d.self_reconciled && <Badge color="gray">Self-reconciled</Badge>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableCard>
      )}
    </PageShell>
  );
}

function DeliveryDetail({ id }: { id: number }) {
  usePageTitle('Delivery');
  const [delivery, setDelivery] = useState<TradeDelivery | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void fetchTradeDelivery(id)
      .then((res) => setDelivery(res.delivery))
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <PageShell><Spinner /></PageShell>;
  if (!delivery) {
    return (
      <PageShell>
        <ErrorMsg message={error || 'Not found'} />
        <Link to="/wholesale/deliveries">← Back</Link>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <div style={{ marginBottom: 8 }}>
        <Link to="/wholesale/deliveries" style={{ color: 'var(--color-primary)', textDecoration: 'none', fontSize: 13 }}>← Deliveries</Link>
      </div>
      <PageHeader
        section="Wholesale"
        title={delivery.delivery_number}
        subtitle={`${delivery.shop_name ?? 'Shop'} · ${STATUS_LABEL[delivery.status] ?? delivery.status}`}
      />
      {error && <ErrorMsg message={error} />}
      {(delivery.has_mismatch || delivery.self_reconciled) && (
        <div style={{ marginBottom: 16, padding: 12, border: '1px solid var(--color-warning)', borderRadius: 8, fontSize: 13 }}>
          {delivery.has_mismatch && <div>Shop report and counted return disagree — do not invoice until resolved.</div>}
          {delivery.self_reconciled && <div>Reconciled by the same person who dispatched — review carefully.</div>}
        </div>
      )}
      <TableCard>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['Item', 'Sent', 'Shop price', 'Sold', 'Back (good)', 'Spoiled', 'Not returned'].map((h) => (
                <th key={h} style={thStyle}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(delivery.lines ?? []).map((line) => (
              <tr key={line.id} style={{ borderBottom: '1px solid var(--color-border-light)' }}>
                <td style={tdStyle}>{line.item_name}{line.variant_name ? ` · ${line.variant_name}` : ''}</td>
                <td style={tdStyle}>{line.qty_sent}</td>
                <td style={tdStyle}>{mvr(line.unit_price_laar)}</td>
                <td style={tdStyle}>{line.qty_sold}</td>
                <td style={tdStyle}>{line.qty_returned_good}</td>
                <td style={tdStyle}>{line.qty_returned_waste}</td>
                <td style={tdStyle}>{line.qty_missing}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableCard>
    </PageShell>
  );
}

function statusColor(status: string): string {
  if (status === 'dispatched') return 'orange';
  if (status === 'reconciled') return 'green';
  if (status === 'cancelled') return 'red';
  return 'gray';
}

const thStyle: React.CSSProperties = {
  padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700,
  color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em',
  borderBottom: '1px solid var(--color-border)',
};
const tdStyle: React.CSSProperties = { padding: '12px 16px', fontSize: 13 };
const selectStyle: React.CSSProperties = {
  minHeight: 44, padding: '0 12px', borderRadius: 8,
  border: '1px solid var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text)',
};
