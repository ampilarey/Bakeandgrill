import { useEffect, useState } from 'react';
import {
  fetchCustomerCredit,
  updateCustomerCredit,
  recordCustomerCreditRepayment,
  CREDIT_PAYMENT_TERMS_OPTIONS,
  type CustomerCreditInfo,
  type CustomerCreditInvoice,
  type CustomerCreditLedgerRow,
} from '../api';
import { Badge, Btn, ErrorMsg } from './SharedUI';
import { useCurrentUserPermissions } from '../hooks/usePermissions';

type Props = {
  customerId: number;
};

const STATUS_COLOR: Record<string, 'green' | 'orange' | 'red' | 'gray'> = {
  active: 'green',
  on_hold: 'orange',
  blocked: 'red',
};

export function CustomerCreditSection({ customerId }: Props) {
  const { can } = useCurrentUserPermissions();
  const canManage = can('customers.credit.manage');
  const canRepay = can('customers.credit.repay');

  const [credit, setCredit] = useState<CustomerCreditInfo | null>(null);
  const [ledger, setLedger] = useState<CustomerCreditLedgerRow[]>([]);
  const [openInvoices, setOpenInvoices] = useState<CustomerCreditInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const [approveLimit, setApproveLimit] = useState('');
  const [approveNotes, setApproveNotes] = useState('');
  const [approveTerms, setApproveTerms] = useState<number>(30);
  const [editLimit, setEditLimit] = useState('');
  const [editTerms, setEditTerms] = useState<number>(30);
  const [overrideLimit, setOverrideLimit] = useState(false);

  const [repayAmount, setRepayAmount] = useState('');
  const [repayMethod, setRepayMethod] = useState<'cash' | 'card' | 'bank_transfer'>('cash');
  const [repayReference, setRepayReference] = useState('');
  const [repayNotes, setRepayNotes] = useState('');
  const [selectedInvoices, setSelectedInvoices] = useState<number[]>([]);
  const [showRepay, setShowRepay] = useState(false);

  const load = async () => {
    if (!canManage && !canRepay) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetchCustomerCredit(customerId);
      setCredit(res.credit);
      setLedger(res.ledger ?? []);
      setOpenInvoices(res.open_invoices ?? []);
      setEditLimit(String(res.credit.limit_mvr ?? 0));
      setEditTerms(res.credit.payment_terms_days ?? 30);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load credit info');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [customerId, canManage, canRepay]);

  if (!canManage && !canRepay) return null;

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '8px 10px', borderRadius: 8,
    border: '1px solid #E8DDD0', fontSize: 13, boxSizing: 'border-box',
  };

  const runAction = async (payload: Parameters<typeof updateCustomerCredit>[1]) => {
    setSaving(true);
    setError('');
    try {
      const res = await updateCustomerCredit(customerId, payload);
      setCredit(res.customer);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setSaving(false);
    }
  };

  const handleRepay = async () => {
    const amount = parseFloat(repayAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Enter a valid repayment amount');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const res = await recordCustomerCreditRepayment(customerId, {
        amount_mvr: amount,
        method: repayMethod,
        reference: repayReference || undefined,
        notes: repayNotes || undefined,
        invoice_ids: selectedInvoices.length > 0 ? selectedInvoices : undefined,
      });
      setCredit(res.credit);
      setRepayAmount('');
      setRepayReference('');
      setRepayNotes('');
      setSelectedInvoices([]);
      setShowRepay(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Repayment failed');
    } finally {
      setSaving(false);
    }
  };

  const statusLabel = !credit?.enabled
    ? 'Not approved'
    : credit.status === 'active'
      ? 'Active'
      : credit.status === 'on_hold'
        ? 'On hold'
        : 'Blocked';

  const formatDueDate = (dueDate?: string | null) => {
    if (!dueDate) return '—';
    return new Date(`${dueDate}T00:00:00`).toLocaleDateString();
  };

  const isOverdue = (dueDate?: string | null) => {
    if (!dueDate) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return new Date(`${dueDate}T00:00:00`) < today;
  };

  return (
    <div style={{ border: '1px solid #E8DDD0', borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <p style={{ margin: 0, fontWeight: 800, fontSize: 13, color: '#1C1408' }}>Credit Account</p>
        {credit && (
          <Badge color={!credit.enabled ? 'gray' : (STATUS_COLOR[credit.status] ?? 'gray')}>
            {statusLabel}
          </Badge>
        )}
      </div>

      {error && <ErrorMsg message={error} />}
      {loading ? (
        <p style={{ margin: 0, fontSize: 13, color: '#9C8E7E' }}>Loading credit…</p>
      ) : credit ? (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            {[
              { label: 'Limit', value: `MVR ${credit.limit_mvr.toFixed(2)}` },
              { label: 'Balance owed', value: `MVR ${credit.balance_mvr.toFixed(2)}` },
              { label: 'Available', value: `MVR ${credit.available_mvr.toFixed(2)}` },
            ].map(({ label, value }) => (
              <div key={label} style={{ background: '#FAF7F3', borderRadius: 8, padding: '8px 10px' }}>
                <p style={{ margin: 0, fontSize: 10, color: '#9C8E7E', fontWeight: 700, textTransform: 'uppercase' }}>{label}</p>
                <p style={{ margin: '2px 0 0', fontSize: 13, fontWeight: 700, color: '#1C1408' }}>{value}</p>
              </div>
            ))}
          </div>

          {credit.approved_by_name && (
            <p style={{ margin: 0, fontSize: 11, color: '#8B7355' }}>
              Approved by {credit.approved_by_name}
              {credit.approved_at ? ` · ${new Date(credit.approved_at).toLocaleDateString()}` : ''}
            </p>
          )}

          {credit.enabled && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, fontSize: 12, color: '#6B5D4F' }}>
              <span><strong>Payment terms:</strong> Net {credit.payment_terms_days} days</span>
              {credit.next_payment_due_date && (
                <span><strong>Next due:</strong> {formatDueDate(credit.next_payment_due_date)}</span>
              )}
            </div>
          )}

          {canManage && !credit.enabled && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#6B5D4F' }}>Approve credit limit (MVR)</label>
              <input style={inputStyle} type="number" min="0" step="0.01" value={approveLimit} onChange={(e) => setApproveLimit(e.target.value)} placeholder="e.g. 5000" />
              <label style={{ fontSize: 12, fontWeight: 600, color: '#6B5D4F' }}>Payment terms</label>
              <select style={inputStyle} value={approveTerms} onChange={(e) => setApproveTerms(Number(e.target.value))}>
                {CREDIT_PAYMENT_TERMS_OPTIONS.map((days) => (
                  <option key={days} value={days}>Net {days} days</option>
                ))}
              </select>
              <textarea style={{ ...inputStyle, height: 60, resize: 'vertical' }} value={approveNotes} onChange={(e) => setApproveNotes(e.target.value)} placeholder="Credit notes (optional)" />
              <Btn small onClick={() => void runAction({
                action: 'approve',
                credit_limit_mvr: parseFloat(approveLimit),
                credit_notes: approveNotes || undefined,
                credit_payment_terms_days: approveTerms,
              })} disabled={saving}>
                Approve for credit
              </Btn>
            </div>
          )}

          {canManage && credit.enabled && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <Btn small variant="secondary" onClick={() => void runAction({ action: 'set_status', credit_status: 'on_hold' })} disabled={saving}>On hold</Btn>
              <Btn small variant="secondary" onClick={() => void runAction({ action: 'set_status', credit_status: 'blocked' })} disabled={saving}>Block</Btn>
              <Btn small variant="secondary" onClick={() => void runAction({ action: 'set_status', credit_status: 'active' })} disabled={saving}>Activate</Btn>
              <Btn small variant="danger" onClick={() => void runAction({ action: 'disable' })} disabled={saving}>Disable credit</Btn>
            </div>
          )}

          {canManage && credit.enabled && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#6B5D4F' }}>Update credit limit (MVR)</label>
              <input style={inputStyle} type="number" min="0" step="0.01" value={editLimit} onChange={(e) => setEditLimit(e.target.value)} />
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                <input type="checkbox" checked={overrideLimit} onChange={(e) => setOverrideLimit(e.target.checked)} />
                Override (allow limit below current balance)
              </label>
              <Btn small variant="secondary" onClick={() => void runAction({ action: 'update_limit', credit_limit_mvr: parseFloat(editLimit), override_limit: overrideLimit })} disabled={saving}>
                Save limit
              </Btn>
            </div>
          )}

          {canManage && credit.enabled && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#6B5D4F' }}>Payment terms</label>
              <select style={inputStyle} value={editTerms} onChange={(e) => setEditTerms(Number(e.target.value))}>
                {CREDIT_PAYMENT_TERMS_OPTIONS.map((days) => (
                  <option key={days} value={days}>Net {days} days</option>
                ))}
              </select>
              <Btn small variant="secondary" onClick={() => void runAction({ action: 'update_terms', credit_payment_terms_days: editTerms })} disabled={saving}>
                Save payment terms
              </Btn>
            </div>
          )}

          {canManage && credit.enabled && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#6B5D4F' }}>
              <input
                type="checkbox"
                checked={credit.reminder_sms_enabled}
                onChange={(e) => void runAction({ action: 'set_reminder_sms', credit_reminder_sms: e.target.checked })}
                disabled={saving}
              />
              SMS payment reminders enabled
            </label>
          )}

          {openInvoices.length > 0 && (
            <div>
              <p style={{ margin: '0 0 8px', fontSize: 11, fontWeight: 700, color: '#9C8E7E', textTransform: 'uppercase' }}>Open invoices</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {openInvoices.map((inv) => (
                  <div key={inv.id} style={{ fontSize: 12, padding: '8px 10px', background: '#fff', borderRadius: 6, border: '1px solid #F0EAE3', display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 8, alignItems: 'center' }}>
                    <span style={{ fontWeight: 700 }}>{inv.invoice_number}</span>
                    <span style={{ color: isOverdue(inv.due_date) ? '#B45309' : '#6B5D4F' }}>
                      Due {formatDueDate(inv.due_date)}
                    </span>
                    <span style={{ fontWeight: 700, color: '#B45309' }}>MVR {(inv.balance_due_laar / 100).toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {canRepay && credit.balance_laar > 0 && (
            <>
              {!showRepay ? (
                <Btn onClick={() => setShowRepay(true)}>Record repayment</Btn>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, background: '#FAF7F3', borderRadius: 10, padding: 12 }}>
                  <p style={{ margin: 0, fontWeight: 700, fontSize: 12 }}>Record credit repayment</p>
                  <input style={inputStyle} type="number" min="0.01" step="0.01" value={repayAmount} onChange={(e) => setRepayAmount(e.target.value)} placeholder="Amount (MVR)" />
                  <select style={inputStyle} value={repayMethod} onChange={(e) => setRepayMethod(e.target.value as typeof repayMethod)}>
                    <option value="cash">Cash</option>
                    <option value="card">Card</option>
                    <option value="bank_transfer">Transfer</option>
                  </select>
                  <input style={inputStyle} value={repayReference} onChange={(e) => setRepayReference(e.target.value)} placeholder="Reference (optional)" />
                  <textarea style={{ ...inputStyle, height: 50, resize: 'vertical' }} value={repayNotes} onChange={(e) => setRepayNotes(e.target.value)} placeholder="Notes (optional)" />
                  {openInvoices.length > 0 && (
                    <div>
                      <p style={{ margin: '0 0 6px', fontSize: 11, fontWeight: 700, color: '#9C8E7E' }}>Apply to invoices (optional)</p>
                      {openInvoices.map((inv) => (
                        <label key={inv.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, marginBottom: 4 }}>
                          <input
                            type="checkbox"
                            checked={selectedInvoices.includes(inv.id)}
                            onChange={(e) => {
                              setSelectedInvoices((prev) => e.target.checked
                                ? [...prev, inv.id]
                                : prev.filter((id) => id !== inv.id));
                            }}
                          />
                          {inv.invoice_number} — MVR {(inv.balance_due_laar / 100).toFixed(2)} due
                        </label>
                      ))}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Btn small onClick={() => void handleRepay()} disabled={saving}>{saving ? 'Saving…' : 'Submit repayment'}</Btn>
                    <Btn small variant="secondary" onClick={() => setShowRepay(false)}>Cancel</Btn>
                  </div>
                </div>
              )}
            </>
          )}

          {ledger.length > 0 && (
            <div>
              <p style={{ margin: '0 0 8px', fontSize: 11, fontWeight: 700, color: '#9C8E7E', textTransform: 'uppercase' }}>Recent ledger</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 160, overflowY: 'auto' }}>
                {ledger.map((row) => (
                  <div key={row.id} style={{ fontSize: 12, padding: '6px 8px', background: '#fff', borderRadius: 6, border: '1px solid #F0EAE3' }}>
                    <span style={{ fontWeight: 700, textTransform: 'capitalize' }}>{row.type.replace('_', ' ')}</span>
                    {' · '}
                    <span style={{ color: row.amount_mvr >= 0 ? '#B45309' : '#059669' }}>
                      {row.amount_mvr >= 0 ? '+' : ''}MVR {row.amount_mvr.toFixed(2)}
                    </span>
                    {' · bal MVR '}{row.balance_after_mvr.toFixed(2)}
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
