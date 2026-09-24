import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { usePageTitle } from '../hooks/usePageTitle';
import {
  PageHeader, PageShell, TableCard, Badge, Btn, Modal, ModalActions,
  EmptyState, Spinner, ErrorMsg, Input,
} from '../components/SharedUI';
import {
  fetchTradeAccount,
  fetchTradeStatement,
  recordTradePayment,
  createTradeCreditNote,
  generateInvoicePdf,
  type TradeAccount,
  type TradeStatement,
  type TradeStatementInvoice,
} from '../api';
import { useCurrentUserPermissions } from '../hooks/usePermissions';

function mvr(laar: number | null | undefined): string {
  if (laar == null) return '—';
  return `MVR ${(laar / 100).toFixed(2)}`;
}

function newIdempotencyKey(): string {
  return crypto.randomUUID();
}

export default function WholesaleStatementPage() {
  const { id } = useParams<{ id: string }>();
  const accountId = Number(id);
  const navigate = useNavigate();
  const { can } = useCurrentUserPermissions();
  const canRepay = can('customers.credit.repay');
  const canCredit = can('trade.invoice');

  const [account, setAccount] = useState<TradeAccount | null>(null);
  const [statement, setStatement] = useState<TradeStatement | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [pdfLoadingId, setPdfLoadingId] = useState<number | null>(null);

  const [payOpen, setPayOpen] = useState(false);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState<'cash' | 'card' | 'bank_transfer'>('cash');
  const [payReference, setPayReference] = useState('');
  const [payNotes, setPayNotes] = useState('');
  const [payInvoices, setPayInvoices] = useState<number[]>([]);

  // Wholesale audit, 2026-09-26: credit notes from the statement, full or partial.
  const [creditTarget, setCreditTarget] = useState<TradeStatementInvoice | null>(null);
  const [creditReason, setCreditReason] = useState('');
  const [creditMode, setCreditMode] = useState<'full' | 'partial'>('full');
  const [creditAmount, setCreditAmount] = useState('');
  const [creditNotice, setCreditNotice] = useState('');

  usePageTitle(account?.shop_name ? `Statement — ${account.shop_name}` : 'Trade statement');

  const load = useCallback(async () => {
    if (!accountId) return;
    setLoading(true);
    setError('');
    try {
      const [acct, stmt] = await Promise.all([
        fetchTradeAccount(accountId),
        fetchTradeStatement(accountId),
      ]);
      setAccount(acct.trade_account);
      setStatement(stmt.statement);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [accountId]);

  useEffect(() => {
    void load();
  }, [load]);

  const openInvoices = statement?.invoices.filter((inv) => inv.balance_laar > 0) ?? [];

  const openPayModal = (preselect?: TradeStatementInvoice) => {
    if (preselect) {
      setPayInvoices([preselect.id]);
      setPayAmount((preselect.balance_laar / 100).toFixed(2));
    } else if (openInvoices.length === 1) {
      setPayInvoices([openInvoices[0].id]);
      setPayAmount((openInvoices[0].balance_laar / 100).toFixed(2));
    } else {
      setPayInvoices([]);
      setPayAmount('');
    }
    setPayReference('');
    setPayNotes('');
    setPayMethod('cash');
    setPayOpen(true);
  };

  const handleRecordPayment = async () => {
    if (!account?.customer || !canRepay) return;
    const mvrAmt = Number(payAmount);
    if (Number.isNaN(mvrAmt) || mvrAmt <= 0) {
      setError('Enter a payment amount in MVR.');
      return;
    }
    const amountLaar = Math.round(mvrAmt * 100);
    setSaving(true);
    setError('');
    try {
      await recordTradePayment(accountId, {
        customer_id: account.customer.id,
        amount_laar: amountLaar,
        method: payMethod,
        idempotency_key: newIdempotencyKey(),
        invoice_ids: payInvoices.length > 0 ? payInvoices : undefined,
        reference: payReference.trim() || undefined,
        notes: payNotes.trim() || undefined,
      });
      setPayOpen(false);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const openCreditModal = (inv: TradeStatementInvoice) => {
    setCreditTarget(inv);
    setCreditReason('');
    setCreditMode('full');
    setCreditAmount('');
    setCreditNotice('');
  };

  const creditLeftLaar = creditTarget ? creditTarget.total_laar - (creditTarget.credited_laar ?? 0) : 0;

  const handleCreditNote = async () => {
    if (!creditTarget || !canCredit || !creditReason.trim()) return;
    let amountLaar: number | undefined;
    if (creditMode === 'partial') {
      const mvrAmt = Number(creditAmount);
      amountLaar = Math.round(mvrAmt * 100);
      if (!Number.isFinite(mvrAmt) || amountLaar <= 0 || amountLaar >= creditLeftLaar) {
        setError(`Enter an amount above zero and below ${mvr(creditLeftLaar)} — or credit the whole invoice.`);
        return;
      }
    }
    setSaving(true);
    setError('');
    try {
      const res = await createTradeCreditNote(creditTarget.id, {
        credit_note_reason: creditReason.trim(),
        amount_laar: amountLaar,
      });
      const paid = creditTarget.amount_paid_laar;
      setCreditNotice(
        amountLaar === undefined && paid > 0
          ? `Credit note ${res.credit_note.invoice_number} raised. The shop had paid ${mvr(paid)}; that stays on their account as credit and comes off the next invoice.`
          : `Credit note ${res.credit_note.invoice_number} raised for ${mvr(res.credit_note.total_laar)}.`,
      );
      setCreditTarget(null);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handlePdf = async (invoiceId: number) => {
    setPdfLoadingId(invoiceId);
    try {
      const blob = await generateInvoicePdf(invoiceId);
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPdfLoadingId(null);
    }
  };

  const toggleInvoice = (invId: number) => {
    setPayInvoices((prev) => {
      const next = prev.includes(invId) ? prev.filter((x) => x !== invId) : [...prev, invId];
      if (next.length > 0) {
        const total = openInvoices
          .filter((i) => next.includes(i.id))
          .reduce((s, i) => s + i.balance_laar, 0);
        setPayAmount((total / 100).toFixed(2));
      }
      return next;
    });
  };

  if (loading) {
    return (
      <PageShell>
        <Spinner />
      </PageShell>
    );
  }

  if (!account || !statement) {
    return (
      <PageShell>
        <ErrorMsg message={error || 'Account not found'} />
        <Btn variant="secondary" onClick={() => navigate('/wholesale')}>Back</Btn>
      </PageShell>
    );
  }

  const exposure = statement.exposure;

  return (
    <PageShell>
      <div style={{ marginBottom: 8, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <Link to="/wholesale" style={{ fontSize: 13, color: 'var(--color-primary)', textDecoration: 'none' }}>← All shops</Link>
        <Link to={`/wholesale/${account.id}`} style={{ fontSize: 13, color: 'var(--color-primary)', textDecoration: 'none' }}>Shop settings</Link>
        <Link to={`/wholesale/${account.id}/invoicing`} style={{ fontSize: 13, color: 'var(--color-primary)', textDecoration: 'none' }}>Raise invoice</Link>
      </div>

      <PageHeader
        section="Manage"
        title={`${account.shop_name} — statement`}
        subtitle="What they owe, what they hold, and payments received"
        action={canRepay && openInvoices.length > 0 ? (
          <Btn onClick={() => openPayModal()} style={{ minHeight: 44 }}>Record payment</Btn>
        ) : undefined}
      />

      {error && <ErrorMsg message={error} />}
      {creditNotice && (
        <div data-testid="credit-note-notice" style={{ marginBottom: 12, padding: '10px 14px', borderRadius: 8, border: '1px solid var(--color-success)', fontSize: 13, color: 'var(--color-text)' }}>
          {creditNotice}
        </div>
      )}
      {statement.account_active === false && (
        <div style={{ marginBottom: 12, padding: '10px 14px', borderRadius: 8, border: '1px solid var(--color-border)', fontSize: 13, color: 'var(--color-text-secondary)' }}>
          This account is deactivated. The shop can still see this statement and pay online; nothing new can be dispatched.
        </div>
      )}

      <div
        data-responsive-grid
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: 12,
          marginBottom: 24,
        }}
      >
        <SummaryCard label="Owes us" value={mvr(statement.balance_owed_laar)} highlight />
        {(statement.credit_in_hand_laar ?? 0) > 0 && (
          <SummaryCard label="In credit (comes off next invoice)" value={mvr(statement.credit_in_hand_laar)} />
        )}
        <SummaryCard label="Holding our stock (unbilled)" value={mvr(statement.holding_unbilled_laar)} />
        <SummaryCard label="Total exposure" value={mvr(exposure.exposure_laar)} />
        <SummaryCard label="Overdue" value={mvr(statement.overdue_laar)} warn={statement.overdue_laar > 0} />
        <SummaryCard label="Credit limit" value={mvr(exposure.credit_limit_laar)} />
        <SummaryCard label="Available headroom" value={mvr(exposure.available_laar)} />
      </div>

      <p style={{ margin: '0 0 20px', fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
        Owes {mvr(statement.balance_owed_laar)} on past invoices; holding {mvr(statement.holding_unbilled_laar)} of our stock that is not yet invoiced.
        {statement.overdue_laar > 0 && (
          <> <strong style={{ color: 'var(--color-danger)' }}>{mvr(statement.overdue_laar)} is past due.</strong></>
        )}
      </p>

      <h2 style={sectionTitle}>Invoices</h2>
      <div style={{ marginBottom: 28 }}>
        <TableCard>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['Invoice', 'Issued', 'Due', 'Total', 'Paid', 'Balance', 'Status', ''].map((h) => (
                <th key={h || 'act'} style={thStyle}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {statement.invoices.length === 0 ? (
              <tr><td colSpan={8}><EmptyState>No wholesale invoices yet</EmptyState></td></tr>
            ) : statement.invoices.map((inv) => (
              <tr key={inv.id} style={{ borderBottom: '1px solid var(--color-border-light)' }}>
                <td style={tdStyle}>
                  <span style={{ fontWeight: 600 }}>{inv.invoice_number}</span>
                </td>
                <td style={tdStyle}>{inv.issue_date}</td>
                <td style={tdStyle}>{inv.due_date ?? '—'}</td>
                <td style={tdStyle}>{mvr(inv.total_laar)}</td>
                <td style={tdStyle}>
                  {mvr(inv.amount_paid_laar)}
                  {(inv.credited_laar ?? 0) > 0 && (
                    <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>credited {mvr(inv.credited_laar)}</div>
                  )}
                  {(inv.written_off_laar ?? 0) > 0 && (
                    <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>written off {mvr(inv.written_off_laar)}</div>
                  )}
                </td>
                <td style={tdStyle}>{mvr(inv.balance_laar)}</td>
                <td style={tdStyle}>
                  {inv.status === 'void' ? <Badge color="gray">Credit-noted</Badge>
                    : (inv.written_off_laar ?? 0) > 0 && inv.balance_laar <= 0 ? <Badge color="gray">Written off</Badge>
                      : inv.is_overdue ? <Badge color="red">Overdue</Badge> : (
                        <Badge color={inv.balance_laar <= 0 ? 'green' : 'orange'}>{inv.status}</Badge>
                      )}
                </td>
                <td style={{ ...tdStyle, textAlign: 'right' }}>
                  <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                    <Btn variant="secondary" disabled={pdfLoadingId === inv.id} onClick={() => void handlePdf(inv.id)}>
                      PDF
                    </Btn>
                    {canRepay && inv.balance_laar > 0 && (
                      <Btn variant="secondary" onClick={() => openPayModal(inv)}>Pay</Btn>
                    )}
                    {canCredit && inv.can_credit !== false && inv.status !== 'void' && (
                      <Btn variant="secondary" onClick={() => openCreditModal(inv)} aria-label={`Credit note ${inv.invoice_number}`}>Credit note</Btn>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </TableCard>
      </div>

      <h2 style={sectionTitle}>Payments</h2>
      <div style={{ marginBottom: 28 }}>
        <TableCard>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['Date', 'Amount', 'Method', 'Reference', 'Against invoices'].map((h) => (
                <th key={h} style={thStyle}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {statement.payments.length === 0 ? (
              <tr><td colSpan={5}><EmptyState>No payments recorded yet</EmptyState></td></tr>
            ) : statement.payments.map((p) => (
              <tr key={p.id} style={{ borderBottom: '1px solid var(--color-border-light)' }}>
                <td style={tdStyle}>{new Date(p.processed_at).toLocaleString()}</td>
                <td style={tdStyle}>{mvr(p.amount_laar)}</td>
                <td style={tdStyle}>{methodLabel(p.method)}</td>
                <td style={tdStyle}>{p.reference_number ?? '—'}</td>
                <td style={tdStyle}>
                  {p.applied && p.applied.length > 0 ? p.applied.map((a) => {
                    const inv = statement.invoices.find((i) => i.id === a.invoice_id);
                    return `${inv?.invoice_number ?? `#${a.invoice_id}`} ${mvr(a.amount_laar)}`;
                  }).join(', ') : p.invoice_ids.length > 0 ? p.invoice_ids.map((iid) => {
                    const inv = statement.invoices.find((i) => i.id === iid);
                    return inv?.invoice_number ?? `#${iid}`;
                  }).join(', ') : 'Open balance'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </TableCard>
      </div>

      {statement.entries && statement.entries.length > 0 && (
        <>
          <h2 style={sectionTitle}>Running balance</h2>
          <TableCard>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Date', 'Description', 'Debit', 'Credit', 'Balance'].map((h) => (
                    <th key={h} style={thStyle}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {statement.entries.map((e) => (
                  <tr key={e.id} style={{ borderBottom: '1px solid var(--color-border-light)' }}>
                    <td style={tdStyle}>{e.date}</td>
                    <td style={tdStyle}>{e.description}</td>
                    <td style={tdStyle}>{e.debit_laar > 0 ? mvr(e.debit_laar) : '—'}</td>
                    <td style={tdStyle}>{e.credit_laar > 0 ? mvr(e.credit_laar) : '—'}</td>
                    <td style={tdStyle}>{mvr(e.running_balance_laar)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableCard>
        </>
      )}

      {creditTarget && (
        <Modal title={`Credit note — ${creditTarget.invoice_number}`} onClose={() => setCreditTarget(null)}>
          <p style={{ margin: '0 0 14px', fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
            Crediting the whole invoice voids it and frees its deliveries to be invoiced again.
            {creditTarget.amount_paid_laar > 0 && (
              <> The shop has paid <strong>{mvr(creditTarget.amount_paid_laar)}</strong> on it; that stays on their account as credit and comes off the next invoice.</>
            )}
            {' '}A partial credit note only reduces what is left to pay.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 36, fontSize: 13, cursor: 'pointer' }}>
                <input type="radio" name="credit-mode" checked={creditMode === 'full'} onChange={() => setCreditMode('full')} />
                Credit everything left ({mvr(creditLeftLaar)})
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 36, fontSize: 13, cursor: 'pointer' }}>
                <input type="radio" name="credit-mode" checked={creditMode === 'partial'} onChange={() => setCreditMode('partial')} />
                Credit part of it
              </label>
            </div>
            {creditMode === 'partial' && (
              <div>
                <label style={labelStyle} htmlFor="credit-amount">Amount (MVR)</label>
                <Input id="credit-amount" type="number" min={0.01} step="0.01" value={creditAmount} onChange={setCreditAmount} aria-label="Credit amount MVR" />
              </div>
            )}
            <div>
              <label style={labelStyle} htmlFor="credit-reason">Reason</label>
              <textarea
                id="credit-reason"
                aria-label="Credit note reason"
                value={creditReason}
                onChange={(e) => setCreditReason(e.target.value)}
                rows={2}
                style={textareaStyle}
                placeholder="Why this invoice is being credited"
              />
            </div>
          </div>
          <ModalActions>
            <Btn variant="secondary" onClick={() => setCreditTarget(null)}>Cancel</Btn>
            <Btn onClick={() => void handleCreditNote()} disabled={saving || !creditReason.trim()}>Raise credit note</Btn>
          </ModalActions>
        </Modal>
      )}

      {payOpen && (
        <Modal title="Record payment" onClose={() => setPayOpen(false)}>
          <p style={{ margin: '0 0 14px', fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
            Record cash, card or bank transfer against this shop&apos;s wholesale invoices. Part payments are allowed.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {openInvoices.length > 0 && (
              <div>
                <label style={labelStyle}>Apply to invoices (optional)</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {openInvoices.map((inv) => (
                    <label
                      key={inv.id}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10, minHeight: 44,
                        fontSize: 13, color: 'var(--color-text)', cursor: 'pointer',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={payInvoices.includes(inv.id)}
                        onChange={() => toggleInvoice(inv.id)}
                        style={{ width: 18, height: 18 }}
                      />
                      {inv.invoice_number} — balance {mvr(inv.balance_laar)}
                      {inv.is_overdue && <Badge color="red">Overdue</Badge>}
                    </label>
                  ))}
                </div>
              </div>
            )}
            <div>
              <label style={labelStyle}>Amount (MVR)</label>
              <Input type="number" min={0.01} step="0.01" value={payAmount} onChange={setPayAmount} />
            </div>
            <div>
              <label style={labelStyle}>Method</label>
              <select
                value={payMethod}
                onChange={(e) => setPayMethod(e.target.value as typeof payMethod)}
                style={selectStyle}
              >
                <option value="cash">Cash</option>
                <option value="card">Card</option>
                <option value="bank_transfer">Bank transfer</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Reference (optional)</label>
              <Input value={payReference} onChange={setPayReference} placeholder="Receipt or transfer ref" />
            </div>
            <div>
              <label style={labelStyle}>Notes (optional)</label>
              <textarea
                value={payNotes}
                onChange={(e) => setPayNotes(e.target.value)}
                rows={2}
                style={textareaStyle}
              />
            </div>
          </div>
          <ModalActions>
            <Btn variant="secondary" onClick={() => setPayOpen(false)}>Cancel</Btn>
            <Btn onClick={() => void handleRecordPayment()} disabled={saving}>Record payment</Btn>
          </ModalActions>
        </Modal>
      )}
    </PageShell>
  );
}

function SummaryCard({ label, value, highlight, warn }: { label: string; value: string; highlight?: boolean; warn?: boolean }) {
  return (
    <div
      style={{
        padding: 14,
        borderRadius: 10,
        border: `1px solid ${warn ? 'var(--color-danger)' : 'var(--color-border)'}`,
        background: 'var(--color-bg)',
      }}
    >
      <div style={{ fontSize: 11, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div
        style={{
          fontSize: highlight ? 20 : 16,
          fontWeight: 700,
          marginTop: 6,
          color: warn ? 'var(--color-danger)' : 'var(--color-text)',
        }}
      >
        {value}
      </div>
    </div>
  );
}

function methodLabel(method: string): string {
  if (method === 'bank_transfer') return 'Bank transfer';
  if (method === 'bml_connect') return 'Card (BML)';
  return method.charAt(0).toUpperCase() + method.slice(1);
}

const thStyle: React.CSSProperties = {
  padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700,
  color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em',
  borderBottom: '1px solid var(--color-border)',
};
const tdStyle: React.CSSProperties = { padding: '12px 16px', fontSize: 13 };
const sectionTitle: React.CSSProperties = { fontSize: 16, fontWeight: 700, color: 'var(--color-text)', margin: '0 0 12px' };
const labelStyle: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 6 };
const selectStyle: React.CSSProperties = {
  width: '100%', minHeight: 44, padding: '0 12px', borderRadius: 8,
  border: '1px solid var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text)', fontSize: 13,
};
const textareaStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--color-border)',
  background: 'var(--color-bg)', color: 'var(--color-text)', fontSize: 13, fontFamily: 'inherit', resize: 'vertical',
};
