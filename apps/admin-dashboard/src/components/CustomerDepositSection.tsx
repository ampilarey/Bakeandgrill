import { useEffect, useState } from 'react';
import {
  adjustCustomerDeposit,
  fetchCustomerDeposit,
  topUpCustomerDeposit,
  updateCustomerDeposit,
  type CustomerDepositInfo,
  type CustomerDepositLedgerRow,
} from '../api';
import { Badge, Btn, ErrorMsg } from './SharedUI';
import { useCurrentUserPermissions } from '../hooks/usePermissions';

type Props = {
  customerId: number;
};

const STATUS_COLOR: Record<string, 'green' | 'orange' | 'red' | 'gray'> = {
  active: 'green',
  frozen: 'orange',
  closed: 'red',
};

export function CustomerDepositSection({ customerId }: Props) {
  const { can } = useCurrentUserPermissions();
  const canManage = can('customers.deposit.manage');
  const canAdjust = can('customers.deposit.adjust');

  const [deposit, setDeposit] = useState<CustomerDepositInfo | null>(null);
  const [ledger, setLedger] = useState<CustomerDepositLedgerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const [topUpAmount, setTopUpAmount] = useState('');
  const [topUpMethod, setTopUpMethod] = useState<'cash' | 'card' | 'bank_transfer'>('cash');
  const [topUpReference, setTopUpReference] = useState('');
  const [topUpNotes, setTopUpNotes] = useState('');
  const [adjustLaar, setAdjustLaar] = useState('');
  const [adjustNotes, setAdjustNotes] = useState('');

  const load = async () => {
    if (!canManage && !canAdjust) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetchCustomerDeposit(customerId);
      setDeposit(res.deposit);
      setLedger(res.ledger ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load deposit info');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [customerId, canManage, canAdjust]);

  if (!canManage && !canAdjust) return null;

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '8px 10px', borderRadius: 8,
    border: '1px solid #E8DDD0', fontSize: 13, boxSizing: 'border-box',
  };

  const setStatus = async (status: 'active' | 'frozen' | 'closed') => {
    setSaving(true);
    setError('');
    try {
      const res = await updateCustomerDeposit(customerId, { action: 'set_status', status });
      setDeposit(res.deposit);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Status update failed');
    } finally {
      setSaving(false);
    }
  };

  const handleTopUp = async () => {
    const amount = parseFloat(topUpAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Enter a valid top-up amount');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await topUpCustomerDeposit(customerId, {
        amount_mvr: amount,
        method: topUpMethod,
        reference: topUpReference || undefined,
        notes: topUpNotes || undefined,
      });
      setTopUpAmount('');
      setTopUpReference('');
      setTopUpNotes('');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Top-up failed');
    } finally {
      setSaving(false);
    }
  };

  const handleAdjust = async () => {
    const laar = parseInt(adjustLaar, 10);
    if (!Number.isFinite(laar) || laar === 0) {
      setError('Enter a non-zero adjustment in laari (e.g. 5000 = MVR 50)');
      return;
    }
    if (!adjustNotes.trim()) {
      setError('Adjustment notes are required');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await adjustCustomerDeposit(customerId, { amount_laar: laar, notes: adjustNotes.trim() });
      setAdjustLaar('');
      setAdjustNotes('');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Adjustment failed');
    } finally {
      setSaving(false);
    }
  };

  const statusLabel = deposit?.status === 'active'
    ? 'Active'
    : deposit?.status === 'frozen'
      ? 'Frozen'
      : deposit?.status === 'closed'
        ? 'Closed'
        : 'No account';

  return (
    <div style={{ border: '1px solid #E8DDD0', borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <p style={{ margin: 0, fontWeight: 800, fontSize: 13, color: '#1C1408' }}>Prepaid Deposit</p>
        {deposit && (
          <Badge color={STATUS_COLOR[deposit.status] ?? 'gray'}>{statusLabel}</Badge>
        )}
      </div>

      {error && <ErrorMsg message={error} />}
      {loading ? (
        <p style={{ margin: 0, fontSize: 13, color: '#9C8E7E' }}>Loading deposit…</p>
      ) : deposit ? (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div style={{ background: '#FAF7F3', borderRadius: 8, padding: '8px 10px' }}>
              <p style={{ margin: 0, fontSize: 10, color: '#9C8E7E', fontWeight: 700, textTransform: 'uppercase' }}>Balance</p>
              <p style={{ margin: '2px 0 0', fontSize: 13, fontWeight: 700, color: '#1C1408' }}>MVR {deposit.balance_mvr.toFixed(2)}</p>
            </div>
            <div style={{ background: '#FAF7F3', borderRadius: 8, padding: '8px 10px' }}>
              <p style={{ margin: 0, fontSize: 10, color: '#9C8E7E', fontWeight: 700, textTransform: 'uppercase' }}>POS wallet</p>
              <p style={{ margin: '2px 0 0', fontSize: 13, fontWeight: 700, color: deposit.can_use ? '#15803D' : '#9C8E7E' }}>
                {deposit.can_use ? 'Available' : 'Unavailable'}
              </p>
            </div>
          </div>

          {canManage && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <Btn small variant="secondary" onClick={() => void setStatus('active')} disabled={saving}>Activate</Btn>
              <Btn small variant="secondary" onClick={() => void setStatus('frozen')} disabled={saving}>Freeze</Btn>
              <Btn small variant="danger" onClick={() => void setStatus('closed')} disabled={saving}>Close account</Btn>
            </div>
          )}

          {canManage && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: '#6B5D4F' }}>Top up (cash received)</p>
              <input style={inputStyle} type="number" min="0" step="0.01" value={topUpAmount} onChange={(e) => setTopUpAmount(e.target.value)} placeholder="Amount MVR" />
              <select style={inputStyle} value={topUpMethod} onChange={(e) => setTopUpMethod(e.target.value as typeof topUpMethod)}>
                <option value="cash">Cash</option>
                <option value="card">Card</option>
                <option value="bank_transfer">Bank transfer</option>
              </select>
              <input style={inputStyle} value={topUpReference} onChange={(e) => setTopUpReference(e.target.value)} placeholder="Reference (optional)" />
              <textarea style={{ ...inputStyle, height: 48, resize: 'vertical' }} value={topUpNotes} onChange={(e) => setTopUpNotes(e.target.value)} placeholder="Notes (optional)" />
              <Btn small onClick={() => void handleTopUp()} disabled={saving}>Record top-up</Btn>
            </div>
          )}

          {canAdjust && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: '#6B5D4F' }}>Manual adjustment (laari)</p>
              <input style={inputStyle} type="number" value={adjustLaar} onChange={(e) => setAdjustLaar(e.target.value)} placeholder="e.g. -5000 to deduct MVR 50" />
              <textarea style={{ ...inputStyle, height: 48, resize: 'vertical' }} value={adjustNotes} onChange={(e) => setAdjustNotes(e.target.value)} placeholder="Reason (required)" />
              <Btn small variant="secondary" onClick={() => void handleAdjust()} disabled={saving}>Post adjustment</Btn>
            </div>
          )}

          {ledger.length > 0 && (
            <div>
              <p style={{ margin: '0 0 8px', fontSize: 11, fontWeight: 700, color: '#9C8E7E', textTransform: 'uppercase' }}>Recent ledger</p>
              <div style={{ maxHeight: 160, overflowY: 'auto' }}>
                {ledger.map((row) => (
                  <div key={row.id} style={{ padding: '6px 0', borderBottom: '1px solid #F0EBE5', fontSize: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                      <span style={{ fontWeight: 600 }}>{row.type}</span>
                      <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                        {row.amount_mvr >= 0 ? '+' : ''}MVR {row.amount_mvr.toFixed(2)}
                      </span>
                    </div>
                    <p style={{ margin: '2px 0 0', color: '#9C8E7E', fontSize: 11 }}>
                      Bal MVR {row.balance_after_mvr.toFixed(2)}
                      {row.created_at ? ` · ${new Date(row.created_at).toLocaleString()}` : ''}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
