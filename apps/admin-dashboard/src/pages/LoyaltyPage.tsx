import { useEffect, useState } from 'react';
import {
  fetchLoyaltyAccounts, adjustLoyaltyPoints, fetchLoyaltyLedger,
  type LoyaltyAccountAdmin,
} from '../api';
import {
  Badge, Btn, Card, EmptyState, ErrorMsg, Input,
  PageHeader, Spinner,
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
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
      onClick={onClose}>
      <Card style={{ width: '100%', maxWidth: 520, maxHeight: '80vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div onClick={(e) => e.stopPropagation()} style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h2 style={{ fontWeight: 800, fontSize: 17 }}>Ledger — {name}</h2>
            <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#94a3b8' }}>✕</button>
          </div>
          {loading ? <Spinner /> : entries.length === 0 ? (
            <EmptyState message="No transactions yet." />
          ) : (
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {entries.map((e) => (
                <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #f1f5f9' }}>
                  <div>
                    <p style={{ fontSize: 14, color: '#374151' }}>{e.reason}</p>
                    <p style={{ fontSize: 11, color: '#94a3b8' }}>{new Date(e.created_at).toLocaleString()}</p>
                  </div>
                  <span style={{ fontWeight: 800, fontSize: 16, color: e.delta >= 0 ? '#22c55e' : '#ef4444' }}>
                    {e.delta >= 0 ? '+' : ''}{e.delta} pts
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>
    </div>
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
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
      onClick={onClose}>
      <Card style={{ width: '100%', maxWidth: 400 }}>
        <div onClick={(e) => e.stopPropagation()}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
            <h2 style={{ fontWeight: 800, fontSize: 17 }}>Adjust Points</h2>
            <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer' }}>✕</button>
          </div>
          <p style={{ color: '#475569', fontSize: 14, marginBottom: 16 }}>
            {account.customer_name ?? account.customer_phone} — current balance: <strong>{account.points_balance} pts</strong>
          </p>
          {error && <ErrorMsg message={error} />}
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>
              Points (use − to deduct)
            </label>
            <Input value={delta} onChange={setDelta} placeholder="e.g. 100 or -50" type="number" />
          </div>
          <div style={{ marginBottom: 20 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>Reason</label>
            <Input value={reason} onChange={setReason} placeholder="e.g. Goodwill adjustment" />
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
            <Btn onClick={submit} disabled={loading}>{loading ? 'Saving…' : 'Apply Adjustment'}</Btn>
          </div>
        </div>
      </Card>
    </div>
  );
}

export function LoyaltyPage() {
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

  useEffect(() => { void load(); }, [search]);

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
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                {['Customer', 'Phone', 'Tier', 'Balance', 'Held', 'Lifetime', ''].map((h) => (
                  <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: '#475569', fontSize: 12 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {accounts.map((a) => (
                <tr key={a.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '12px 16px', fontWeight: 600 }}>
                    {a.customer_name ?? '—'}
                  </td>
                  <td style={{ padding: '12px 16px', color: '#475569' }}>{a.customer_phone}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <Badge label={a.tier} color={TIER_COLOR[a.tier] ?? 'gray'} />
                  </td>
                  <td style={{ padding: '12px 16px', fontWeight: 700, color: '#0ea5e9' }}>
                    {a.points_balance.toLocaleString()} pts
                  </td>
                  <td style={{ padding: '12px 16px', color: '#94a3b8' }}>
                    {a.points_held > 0 ? `${a.points_held} held` : '—'}
                  </td>
                  <td style={{ padding: '12px 16px', color: '#475569' }}>
                    {a.lifetime_points.toLocaleString()}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <Btn small variant="ghost" onClick={() => setViewingLedger(a)}>Ledger</Btn>
                      <Btn small variant="secondary" onClick={() => setAdjusting(a)}>Adjust</Btn>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
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
