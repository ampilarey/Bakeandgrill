import { useEffect, useState } from 'react';
import {
  fetchLoyaltyAccounts, adjustLoyaltyPoints, fetchLoyaltyLedger,
  type LoyaltyAccountAdmin,
} from '../api';
import { usePageTitle } from '../hooks/usePageTitle';
import {
  Badge, Btn, Card, EmptyState, ErrorMsg, Input, Modal, ModalActions,
  PageHeader, Spinner, TableCard, TD, TH,
} from '../components/Layout';

const TIER_COLOR: Record<string, string> = {
  bronze: 'orange', silver: 'gray', gold: 'yellow', platinum: 'blue',
};

function LedgerModal({ customerId, name, onClose }: {
  customerId: number; name: string; onClose: () => void;
}) {
  const [entries, setEntries] = useState<Array<{ id: number; delta: number; reason: string; created_at: string }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLoyaltyLedger(customerId)
      .then((r) => setEntries(r.data))
      .finally(() => setLoading(false));
  }, [customerId]);

  return (
    <Modal title={`Ledger — ${name}`} onClose={onClose} maxWidth={520}>
      {loading ? <Spinner /> : entries.length === 0 ? (
        <EmptyState message="No transactions yet." />
      ) : (
        <div style={{ maxHeight: '55vh', overflowY: 'auto' }}>
          {entries.map((e) => (
            <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #F0EBE5' }}>
              <div>
                <p style={{ fontSize: 14, color: '#1C1408', margin: 0 }}>{e.reason}</p>
                <p style={{ fontSize: 11, color: '#9C8E7E', margin: '2px 0 0' }}>{new Date(e.created_at).toLocaleString()}</p>
              </div>
              <span style={{ fontWeight: 800, fontSize: 15, color: e.delta >= 0 ? '#22c55e' : '#ef4444' }}>
                {e.delta >= 0 ? '+' : ''}{e.delta} pts
              </span>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

function AdjustModal({ account, onClose, onDone }: {
  account: LoyaltyAccountAdmin; onClose: () => void; onDone: () => void;
}) {
  const [delta, setDelta] = useState('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    const d = parseInt(delta);
    if (!d || !reason) { setError('Delta and reason are required.'); return; }
    setError('');
    setLoading(true);
    try {
      await adjustLoyaltyPoints(account.customer_id, d, reason);
      onDone();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal title="Adjust Points" onClose={onClose} maxWidth={400}>
      <p style={{ color: '#6B5D4F', fontSize: 14, marginBottom: 16 }}>
        {account.customer_name ?? account.customer_phone} — balance: <strong style={{ color: '#D4813A' }}>{account.points_balance} pts</strong>
      </p>
      {error && <ErrorMsg message={error} />}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <label style={{ fontSize: 12, fontWeight: 700, color: '#6B5D4F', display: 'block', marginBottom: 4 }}>
            Points (use − to deduct)
          </label>
          <Input value={delta} onChange={setDelta} placeholder="e.g. 100 or -50" type="number" />
        </div>
        <div>
          <label style={{ fontSize: 12, fontWeight: 700, color: '#6B5D4F', display: 'block', marginBottom: 4 }}>Reason</label>
          <Input value={reason} onChange={setReason} placeholder="e.g. Goodwill adjustment" />
        </div>
      </div>
      <ModalActions>
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn onClick={submit} disabled={loading}>{loading ? 'Saving…' : 'Apply Adjustment'}</Btn>
      </ModalActions>
    </Modal>
  );
}

export function LoyaltyPage() {
    usePageTitle('Loyalty');
  const [accounts, setAccounts] = useState<LoyaltyAccountAdmin[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [adjusting, setAdjusting] = useState<LoyaltyAccountAdmin | null>(null);
  const [viewingLedger, setViewingLedger] = useState<LoyaltyAccountAdmin | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetchLoyaltyAccounts({ search: search || undefined });
      setAccounts(res.data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => { void load(); }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  return (
    <>
      <PageHeader title="Loyalty Accounts" subtitle="View and manage customer loyalty points" />
      {error && <ErrorMsg message={error} />}

      <div style={{ marginBottom: 20 }}>
        <Input
          value={search}
          onChange={setSearch}
          placeholder="Search by name or phone…"
          style={{ maxWidth: 320 }}
        />
      </div>

      {loading && accounts.length === 0 ? (
        <Spinner />
      ) : accounts.length === 0 ? (
        <Card><EmptyState message="No loyalty accounts found." /></Card>
      ) : (
        <TableCard>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr>
                {['Customer', 'Phone', 'Tier', 'Balance', 'Held', 'Lifetime', ''].map((h) => (
                  <th key={h} style={TH}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {accounts.map((a) => (
                <tr key={a.id}>
                  <td style={{ ...TD, fontWeight: 600, color: '#1C1408' }}>{a.customer_name ?? '—'}</td>
                  <td style={{ ...TD, color: '#6B5D4F' }}>{a.customer_phone}</td>
                  <td style={TD}><Badge label={a.tier} color={TIER_COLOR[a.tier] ?? 'gray'} /></td>
                  <td style={{ ...TD, fontWeight: 700, color: '#D4813A' }}>{a.points_balance.toLocaleString()} pts</td>
                  <td style={{ ...TD, color: '#9C8E7E' }}>{a.points_held > 0 ? `${a.points_held} held` : '—'}</td>
                  <td style={{ ...TD, color: '#6B5D4F' }}>{a.lifetime_points.toLocaleString()}</td>
                  <td style={TD}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <Btn small variant="ghost" onClick={() => setViewingLedger(a)}>Ledger</Btn>
                      <Btn small variant="secondary" onClick={() => setAdjusting(a)}>Adjust</Btn>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableCard>
      )}

      {adjusting && (
        <AdjustModal
          account={adjusting}
          onClose={() => setAdjusting(null)}
          onDone={load}
        />
      )}
      {viewingLedger && (
        <LedgerModal
          customerId={viewingLedger.customer_id}
          name={viewingLedger.customer_name ?? viewingLedger.customer_phone}
          onClose={() => setViewingLedger(null)}
        />
      )}
    </>
  );
}
