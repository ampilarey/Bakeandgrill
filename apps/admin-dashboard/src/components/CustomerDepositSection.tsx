import { useEffect, useState } from 'react';
import {
  adjustCustomerDeposit,
  fetchCustomerDeposit,
  fetchCustomerDepositLedger,
  refundCustomerDeposit,
  topUpCustomerDeposit,
  transferCustomerDepositToCredit,
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

const TYPE_LABELS: Record<string, string> = {
  top_up: 'Deposit received',
  usage: 'Order payment',
  payout: 'Refund to customer',
  refund: 'Deposit credited',
  reversal: 'Order refund',
  transfer_to_credit: 'Transfer to credit',
  adjustment: 'Adjustment',
  adjustment_add: 'Adjustment (add)',
  adjustment_deduct: 'Adjustment (deduct)',
};

export function CustomerDepositSection({ customerId }: Props) {
  const { can } = useCurrentUserPermissions();
  const canView = can('customers.deposit.view') || can('customers.deposit.manage');
  const canReceive = can('customers.deposit.receive') || can('customers.deposit.manage');
  const canFreeze = can('customers.deposit.freeze') || can('customers.deposit.manage');
  const canAdjust = can('customers.deposit.adjust');
  const canRefund = can('customers.deposit.refund') || can('customers.deposit.manage');
  const canTransfer = can('customers.deposit.transfer_credit') || can('customers.deposit.manage');

  const [deposit, setDeposit] = useState<CustomerDepositInfo | null>(null);
  const [ledger, setLedger] = useState<CustomerDepositLedgerRow[]>([]);
  const [ledgerPage, setLedgerPage] = useState(1);
  const [ledgerLastPage, setLedgerLastPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const [topUpAmount, setTopUpAmount] = useState('');
  const [topUpMethod, setTopUpMethod] = useState<'cash' | 'card' | 'bank_transfer'>('cash');
  const [topUpReference, setTopUpReference] = useState('');
  const [topUpNotes, setTopUpNotes] = useState('');
  const [adjustLaar, setAdjustLaar] = useState('');
  const [adjustNotes, setAdjustNotes] = useState('');
  const [refundAmount, setRefundAmount] = useState('');
  const [refundMethod, setRefundMethod] = useState<'cash' | 'card' | 'bank_transfer'>('cash');
  const [refundReason, setRefundReason] = useState('');
  const [transferAmount, setTransferAmount] = useState('');
  const [transferNotes, setTransferNotes] = useState('');

  const loadDeposit = async () => {
    if (!canView) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetchCustomerDeposit(customerId);
      setDeposit(res.deposit);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load deposit info');
    } finally {
      setLoading(false);
    }
  };

  const loadLedger = async (page = ledgerPage) => {
    if (!canView) return;
    setLedgerLoading(true);
    try {
      const res = await fetchCustomerDepositLedger(customerId, { page, per_page: 15 });
      setLedger(res.data);
      setLedgerPage(res.meta.current_page);
      setLedgerLastPage(res.meta.last_page);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load ledger');
    } finally {
      setLedgerLoading(false);
    }
  };

  useEffect(() => {
    void loadDeposit();
    void loadLedger(1);
  }, [customerId, canView]);

  useEffect(() => {
    void loadLedger(ledgerPage);
  }, [ledgerPage]);

  if (!canView) return null;

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '8px 10px', borderRadius: 8,
    border: '1px solid #E8DDD0', fontSize: 13, boxSizing: 'border-box',
  };

  const refresh = async () => {
    await loadDeposit();
    await loadLedger(ledgerPage);
  };

  const setStatus = async (status: 'active' | 'frozen' | 'closed') => {
    setSaving(true);
    setError('');
    try {
      await updateCustomerDeposit(customerId, { action: 'set_status', status });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Status update failed');
    } finally {
      setSaving(false);
    }
  };

  const handleTopUp = async () => {
    const amount = parseFloat(topUpAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Enter a valid amount');
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
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Receive deposit failed');
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
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Adjustment failed');
    } finally {
      setSaving(false);
    }
  };

  const handleRefund = async () => {
    const amount = parseFloat(refundAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Enter a valid payout amount');
      return;
    }
    if (!refundReason.trim()) {
      setError('Payout reason is required');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await refundCustomerDeposit(customerId, {
        amount_mvr: amount,
        method: refundMethod,
        reason: refundReason.trim(),
      });
      setRefundAmount('');
      setRefundReason('');
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Deposit payout failed');
    } finally {
      setSaving(false);
    }
  };

  const handleTransfer = async () => {
    const amount = parseFloat(transferAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Enter a valid transfer amount');
      return;
    }
    const creditBal = deposit?.credit_balance_mvr ?? 0;
    if (creditBal <= 0) {
      setError('Customer has no outstanding credit balance');
      return;
    }
    if (!window.confirm(
      `Transfer MVR ${amount.toFixed(2)} from deposit to pay down credit? This is one-way and cannot be reversed automatically.`,
    )) {
      return;
    }
    setSaving(true);
    setError('');
    try {
      await transferCustomerDepositToCredit(customerId, {
        amount_mvr: amount,
        notes: transferNotes.trim() || undefined,
      });
      setTransferAmount('');
      setTransferNotes('');
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Transfer failed');
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

  const creditBalance = deposit?.credit_balance_mvr ?? 0;

  return (
    <div style={{ border: '1px solid #E8DDD0', borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <p style={{ margin: 0, fontWeight: 800, fontSize: 13, color: '#1C1408' }}>Customer Deposit</p>
        {deposit && (
          <Badge color={STATUS_COLOR[deposit.status] ?? 'gray'}>{statusLabel}</Badge>
        )}
      </div>

      {error && <ErrorMsg message={error} />}
      {loading ? (
        <p style={{ margin: 0, fontSize: 13, color: '#9C8E7E' }}>Loading deposit…</p>
      ) : deposit ? (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
            <div style={{ background: '#FAF7F3', borderRadius: 8, padding: '8px 10px' }}>
              <p style={{ margin: 0, fontSize: 10, color: '#9C8E7E', fontWeight: 700, textTransform: 'uppercase' }}>Deposit balance</p>
              <p style={{ margin: '2px 0 0', fontSize: 13, fontWeight: 700, color: '#1C1408' }}>MVR {deposit.balance_mvr.toFixed(2)}</p>
            </div>
            <div style={{ background: '#FAF7F3', borderRadius: 8, padding: '8px 10px' }}>
              <p style={{ margin: 0, fontSize: 10, color: '#9C8E7E', fontWeight: 700, textTransform: 'uppercase' }}>POS availability</p>
              <p style={{ margin: '2px 0 0', fontSize: 13, fontWeight: 700, color: deposit.can_use ? '#15803D' : '#9C8E7E' }}>
                {deposit.can_use ? 'Can pay from deposit' : 'Unavailable'}
              </p>
            </div>
            <div style={{ background: '#FAF7F3', borderRadius: 8, padding: '8px 10px' }}>
              <p style={{ margin: 0, fontSize: 10, color: '#9C8E7E', fontWeight: 700, textTransform: 'uppercase' }}>Total received</p>
              <p style={{ margin: '2px 0 0', fontSize: 13, fontWeight: 700, color: '#1C1408' }}>
                MVR {(deposit.total_received_mvr ?? 0).toFixed(2)}
              </p>
            </div>
            <div style={{ background: '#FAF7F3', borderRadius: 8, padding: '8px 10px' }}>
              <p style={{ margin: 0, fontSize: 10, color: '#9C8E7E', fontWeight: 700, textTransform: 'uppercase' }}>Total used</p>
              <p style={{ margin: '2px 0 0', fontSize: 13, fontWeight: 700, color: '#1C1408' }}>
                MVR {(deposit.total_used_mvr ?? 0).toFixed(2)}
              </p>
            </div>
          </div>

          {canFreeze && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <Btn small variant="secondary" onClick={() => void setStatus('active')} disabled={saving}>Activate</Btn>
              <Btn small variant="secondary" onClick={() => void setStatus('frozen')} disabled={saving}>Freeze</Btn>
              <Btn small variant="danger" onClick={() => void setStatus('closed')} disabled={saving}>Close account</Btn>
            </div>
          )}

          {canReceive && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: '#6B5D4F' }}>Receive deposit</p>
              <input style={inputStyle} type="number" min="0" step="0.01" value={topUpAmount} onChange={(e) => setTopUpAmount(e.target.value)} placeholder="Amount MVR" />
              <select style={inputStyle} value={topUpMethod} onChange={(e) => setTopUpMethod(e.target.value as typeof topUpMethod)}>
                <option value="cash">Cash</option>
                <option value="card">Card</option>
                <option value="bank_transfer">Bank transfer</option>
              </select>
              <input style={inputStyle} value={topUpReference} onChange={(e) => setTopUpReference(e.target.value)} placeholder="Reference (optional)" />
              <textarea style={{ ...inputStyle, height: 48, resize: 'vertical' }} value={topUpNotes} onChange={(e) => setTopUpNotes(e.target.value)} placeholder="Notes (optional)" />
              <Btn small onClick={() => void handleTopUp()} disabled={saving}>Record deposit</Btn>
            </div>
          )}

          {canRefund && deposit.balance_laar > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: '#6B5D4F' }}>Refund deposit (payout to customer)</p>
              <input style={inputStyle} type="number" min="0" step="0.01" max={deposit.balance_mvr} value={refundAmount} onChange={(e) => setRefundAmount(e.target.value)} placeholder="Amount MVR" />
              <select style={inputStyle} value={refundMethod} onChange={(e) => setRefundMethod(e.target.value as typeof refundMethod)}>
                <option value="cash">Cash</option>
                <option value="card">Card</option>
                <option value="bank_transfer">Bank transfer</option>
              </select>
              <textarea style={{ ...inputStyle, height: 48, resize: 'vertical' }} value={refundReason} onChange={(e) => setRefundReason(e.target.value)} placeholder="Reason (required)" />
              <Btn small variant="secondary" onClick={() => void handleRefund()} disabled={saving}>Payout deposit</Btn>
            </div>
          )}

          {canTransfer && creditBalance > 0 && deposit.balance_laar > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 10, borderRadius: 8, background: '#FFFBEB', border: '1px solid #FDE68A' }}>
              <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: '#92400E' }}>
                Transfer to credit (credit owed: MVR {creditBalance.toFixed(2)})
              </p>
              <p style={{ margin: 0, fontSize: 11, color: '#B45309' }}>
                One-way: deposit is applied to reduce credit balance. Not a sale.
              </p>
              <input
                style={inputStyle}
                type="number"
                min="0"
                step="0.01"
                max={Math.min(deposit.balance_mvr, creditBalance)}
                value={transferAmount}
                onChange={(e) => setTransferAmount(e.target.value)}
                placeholder="Amount MVR"
              />
              <textarea style={{ ...inputStyle, height: 40, resize: 'vertical' }} value={transferNotes} onChange={(e) => setTransferNotes(e.target.value)} placeholder="Notes (optional)" />
              <Btn small variant="secondary" onClick={() => void handleTransfer()} disabled={saving}>Transfer to credit</Btn>
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

          <div>
            <p style={{ margin: '0 0 8px', fontSize: 11, fontWeight: 700, color: '#9C8E7E', textTransform: 'uppercase' }}>Ledger</p>
            {ledgerLoading && ledger.length === 0 ? (
              <p style={{ margin: 0, fontSize: 12, color: '#9C8E7E' }}>Loading ledger…</p>
            ) : ledger.length === 0 ? (
              <p style={{ margin: 0, fontSize: 12, color: '#9C8E7E' }}>No transactions yet.</p>
            ) : (
              <div style={{ maxHeight: 220, overflowY: 'auto' }}>
                {ledger.map((row) => (
                  <div key={row.id} style={{ padding: '6px 0', borderBottom: '1px solid #F0EBE5', fontSize: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                      <span style={{ fontWeight: 600 }}>{TYPE_LABELS[row.type] ?? row.type}</span>
                      <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                        {row.amount_mvr >= 0 ? '+' : ''}MVR {row.amount_mvr.toFixed(2)}
                      </span>
                    </div>
                    <p style={{ margin: '2px 0 0', color: '#9C8E7E', fontSize: 11 }}>
                      {row.method ? `${row.method} · ` : ''}
                      Bal MVR {row.balance_after_mvr.toFixed(2)}
                      {row.order_id ? ` · Order #${row.order_id}` : ''}
                      {row.actor_name ? ` · ${row.actor_name}` : ''}
                      {row.created_at ? ` · ${new Date(row.created_at).toLocaleString()}` : ''}
                    </p>
                  </div>
                ))}
              </div>
            )}
            {ledgerLastPage > 1 && (
              <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
                <Btn small variant="secondary" disabled={ledgerPage <= 1 || ledgerLoading} onClick={() => setLedgerPage((p) => p - 1)}>Prev</Btn>
                <span style={{ fontSize: 11, color: '#9C8E7E' }}>Page {ledgerPage} / {ledgerLastPage}</span>
                <Btn small variant="secondary" disabled={ledgerPage >= ledgerLastPage || ledgerLoading} onClick={() => setLedgerPage((p) => p + 1)}>Next</Btn>
              </div>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
