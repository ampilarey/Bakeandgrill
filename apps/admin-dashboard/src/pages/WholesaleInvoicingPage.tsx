import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { FileText } from 'lucide-react';
import { usePageTitle } from '../hooks/usePageTitle';
import {
  PageHeader, PageShell, TableCard, Badge, Btn, Modal, ModalActions,
  EmptyState, Spinner, ErrorMsg, Input,
} from '../components/SharedUI';
import {
  fetchTradeAccounts,
  fetchTradeAccount,
  fetchReadyToInvoice,
  previewTradeInvoice,
  raiseTradeInvoice,
  resolveMismatch,
  waiveMissing,
  generateInvoicePdf,
  sendInvoiceToCustomer,
  type TradeAccount,
  type ReadyToInvoiceDelivery,
  type TradeInvoice,
  type TradeInvoicePreview,
} from '../api';
import { useCurrentUserPermissions } from '../hooks/usePermissions';

function mvr(laar: number | null | undefined): string {
  if (laar == null) return '—';
  return `MVR ${(laar / 100).toFixed(2)}`;
}

function newIdempotencyKey(): string {
  return crypto.randomUUID();
}

export default function WholesaleInvoicingPage() {
  const { id } = useParams<{ id?: string }>();
  const accountIdParam = id ? Number(id) : null;
  const navigate = useNavigate();
  const { can } = useCurrentUserPermissions();
  const canInvoice = can('trade.invoice');

  const [accountId, setAccountId] = useState<number | null>(accountIdParam);
  const [account, setAccount] = useState<TradeAccount | null>(null);
  const [accounts, setAccounts] = useState<TradeAccount[]>([]);
  const [deliveries, setDeliveries] = useState<ReadyToInvoiceDelivery[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [preview, setPreview] = useState<TradeInvoicePreview | null>(null);
  const [invoiceNotes, setInvoiceNotes] = useState('');

  const [loading, setLoading] = useState(true);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [raisedInvoice, setRaisedInvoice] = useState<TradeInvoice | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [sendPhone, setSendPhone] = useState('');
  const [sendMsg, setSendMsg] = useState('');

  const [resolveTarget, setResolveTarget] = useState<ReadyToInvoiceDelivery | null>(null);
  const [resolveText, setResolveText] = useState('');
  const [waiveTarget, setWaiveTarget] = useState<ReadyToInvoiceDelivery | null>(null);
  const [waiveReason, setWaiveReason] = useState('');

  usePageTitle(account?.shop_name ? `Invoice — ${account.shop_name}` : 'Wholesale invoicing');

  useEffect(() => {
    setAccountId(accountIdParam);
  }, [accountIdParam]);

  const loadAccount = useCallback(async (aid: number) => {
    const res = await fetchTradeAccount(aid);
    setAccount(res.trade_account);
    return res.trade_account;
  }, []);

  const loadDeliveries = useCallback(async (aid: number) => {
    const res = await fetchReadyToInvoice(aid);
    setDeliveries(res.data ?? []);
    setSelected(new Set());
    setPreview(null);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      if (accountId) {
        await loadAccount(accountId);
        await loadDeliveries(accountId);
      } else {
        const res = await fetchTradeAccounts({ active: true });
        setAccounts(res.data ?? []);
        setAccount(null);
        setDeliveries([]);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [accountId, loadAccount, loadDeliveries]);

  useEffect(() => {
    void load();
  }, [load]);

  const selectableIds = useMemo(
    () => deliveries.filter((d) => !d.mismatch_blocking && !d.missing_blocking).map((d) => d.id),
    [deliveries],
  );

  const selectedIds = useMemo(() => [...selected].filter((id) => selectableIds.includes(id)), [selected, selectableIds]);

  useEffect(() => {
    if (!accountId || selectedIds.length === 0) {
      setPreview(null);
      return;
    }
    let cancelled = false;
    setPreviewLoading(true);
    void previewTradeInvoice(accountId, selectedIds)
      .then((res) => { if (!cancelled) setPreview(res.preview); })
      .catch((e) => { if (!cancelled) setError((e as Error).message); })
      .finally(() => { if (!cancelled) setPreviewLoading(false); });
    return () => { cancelled = true; };
  }, [accountId, selectedIds.join(',')]);

  const toggleSelect = (delivery: ReadyToInvoiceDelivery) => {
    if (delivery.mismatch_blocking || delivery.missing_blocking) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(delivery.id)) next.delete(delivery.id);
      else next.add(delivery.id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.length === selectableIds.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(selectableIds));
    }
  };

  const handlePickAccount = (aid: number) => {
    navigate(`/wholesale/${aid}/invoicing`);
  };

  const handleRaise = async () => {
    if (!accountId || !canInvoice || selectedIds.length === 0) return;
    setSaving(true);
    setError('');
    try {
      const res = await raiseTradeInvoice(accountId, {
        delivery_ids: selectedIds,
        idempotency_key: newIdempotencyKey(),
        notes: invoiceNotes.trim() || undefined,
      });
      setRaisedInvoice(res.invoice);
      setSendPhone(res.invoice.recipient_phone ?? account?.contact_phone ?? account?.customer?.phone ?? '');
      await loadDeliveries(accountId);
      setSelected(new Set());
      setInvoiceNotes('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleResolve = async () => {
    if (!resolveTarget || !resolveText.trim()) return;
    setSaving(true);
    setError('');
    try {
      await resolveMismatch(resolveTarget.id, { decision: resolveText.trim() });
      setResolveTarget(null);
      setResolveText('');
      if (accountId) await loadDeliveries(accountId);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleWaive = async () => {
    if (!waiveTarget || !waiveReason.trim()) return;
    setSaving(true);
    setError('');
    try {
      await waiveMissing(waiveTarget.id, { reason: waiveReason.trim() });
      setWaiveTarget(null);
      setWaiveReason('');
      if (accountId) await loadDeliveries(accountId);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handlePdf = async (inv: TradeInvoice) => {
    setPdfLoading(true);
    try {
      const blob = await generateInvoicePdf(inv.id);
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPdfLoading(false);
    }
  };

  const handleSend = async () => {
    if (!raisedInvoice || !sendPhone.trim()) return;
    setSaving(true);
    setSendMsg('');
    try {
      const res = await sendInvoiceToCustomer(raisedInvoice.id, sendPhone.trim());
      setSendMsg(`Sent — link copied to response`);
      setRaisedInvoice({ ...raisedInvoice, ...res.invoice });
      setSendOpen(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <PageShell>
        <Spinner />
      </PageShell>
    );
  }

  return (
    <PageShell>
      <div style={{ marginBottom: 8, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <Link to="/wholesale" style={{ fontSize: 13, color: 'var(--color-primary)', textDecoration: 'none' }}>
          ← All shops
        </Link>
        {account && (
          <>
            <Link to={`/wholesale/${account.id}`} style={{ fontSize: 13, color: 'var(--color-primary)', textDecoration: 'none' }}>
              Shop settings
            </Link>
            <Link to={`/wholesale/${account.id}/statement`} style={{ fontSize: 13, color: 'var(--color-primary)', textDecoration: 'none' }}>
              Account statement
            </Link>
          </>
        )}
      </div>

      <PageHeader
        section="Wholesale"
        title="Raise invoice"
        subtitle={account
          ? `Bill ${account.shop_name} for reconciled deliveries`
          : 'Pick a shop to see deliveries ready to invoice'}
      />

      {error && <ErrorMsg message={error} />}

      {!accountId && (
        <TableCard>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Shop', 'Customer', ''].map((h) => (
                  <th key={h || 'go'} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {accounts.length === 0 ? (
                <tr><td colSpan={3}><EmptyState>No active trade accounts</EmptyState></td></tr>
              ) : accounts.map((a) => (
                <tr key={a.id} style={{ borderBottom: '1px solid var(--color-border-light)' }}>
                  <td style={tdStyle}>{a.shop_name}</td>
                  <td style={tdStyle}>{a.customer?.name ?? a.customer?.phone ?? '—'}</td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>
                    <Btn variant="secondary" onClick={() => handlePickAccount(a.id)}>Invoice deliveries</Btn>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableCard>
      )}

      {accountId && account && (
        <>
          {raisedInvoice && (
            <div
              style={{
                marginBottom: 16,
                padding: '14px 16px',
                border: '1px solid var(--color-success)',
                borderRadius: 10,
                background: 'var(--color-bg)',
              }}
            >
              <div style={{ fontWeight: 700, marginBottom: 6, color: 'var(--color-text)' }}>
                Invoice {raisedInvoice.invoice_number} raised — {mvr(raisedInvoice.total_laar)}
              </div>
              {raisedInvoice.gst_period_differs_from_issue && raisedInvoice.gst_period_key && (
                <p style={{ margin: '0 0 8px', fontSize: 13, color: 'var(--color-warning)' }}>
                  GST will post in period {raisedInvoice.gst_period_key}, not the issue month. Check GST reports if the month-end was locked.
                </p>
              )}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                <Btn variant="secondary" disabled={pdfLoading} onClick={() => void handlePdf(raisedInvoice)}>
                  {pdfLoading ? 'Opening…' : 'Download PDF'}
                </Btn>
                <Btn variant="secondary" onClick={() => setSendOpen(true)}>Send to shop</Btn>
                <Link to={`/wholesale/${account.id}/statement`} style={{ alignSelf: 'center', fontSize: 13, color: 'var(--color-primary)' }}>
                  View statement
                </Link>
              </div>
              {sendMsg && <div style={{ marginTop: 8, fontSize: 12, color: 'var(--color-success)' }}>{sendMsg}</div>}
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
              Only reconciled deliveries with nothing left blocking appear here. Mismatches must be resolved; disputed missing stock can be waived.
            </p>
            {canInvoice && selectableIds.length > 0 && (
              <Btn variant="secondary" onClick={toggleAll}>
                {selectedIds.length === selectableIds.length ? 'Clear selection' : 'Select all ready'}
              </Btn>
            )}
          </div>

          <TableCard>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['', 'Delivery', 'Reconciled', 'Invoiceable', 'Status'].map((h) => (
                    <th key={h || 'sel'} style={thStyle}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {deliveries.length === 0 ? (
                  <tr><td colSpan={5}><EmptyState>No deliveries waiting to be invoiced for this shop.</EmptyState></td></tr>
                ) : deliveries.map((d) => {
                  const blocked = d.mismatch_blocking || d.missing_blocking;
                  const checked = selected.has(d.id);
                  return (
                    <tr key={d.id} style={{ borderBottom: '1px solid var(--color-border-light)', opacity: blocked ? 0.85 : 1 }}>
                      <td style={{ ...tdStyle, width: 44 }}>
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={blocked || !canInvoice}
                          onChange={() => toggleSelect(d)}
                          style={{ width: 18, height: 18, minHeight: 44, cursor: blocked ? 'not-allowed' : 'pointer' }}
                          aria-label={`Select ${d.delivery_number}`}
                        />
                      </td>
                      <td style={tdStyle}>
                        <Link to={`/wholesale/deliveries/${d.id}`} style={{ fontWeight: 600, color: 'var(--color-primary)', textDecoration: 'none' }}>
                          {d.delivery_number}
                        </Link>
                        {d.self_reconciled && (
                          <div style={{ marginTop: 4 }}><Badge color="gray">Self-reconciled — review</Badge></div>
                        )}
                      </td>
                      <td style={tdStyle}>
                        {d.reconciled_at ? new Date(d.reconciled_at).toLocaleDateString() : '—'}
                      </td>
                      <td style={tdStyle}>{mvr(d.invoiceable_laar)}</td>
                      <td style={tdStyle}>
                        {d.mismatch_blocking ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start' }}>
                            <Badge color="orange">Mismatch — blocked</Badge>
                            {canInvoice && (
                              <Btn variant="secondary" onClick={() => { setResolveTarget(d); setResolveText(''); }}>
                                Resolve
                              </Btn>
                            )}
                          </div>
                        ) : d.missing_blocking ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start' }}>
                            <Badge color="red">Missing stock — needs decision</Badge>
                            {canInvoice && (
                              <Btn variant="secondary" onClick={() => { setWaiveTarget(d); setWaiveReason(''); }}>
                                Waive charge
                              </Btn>
                            )}
                          </div>
                        ) : (
                          <Badge color="green">Ready</Badge>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableCard>

          {(previewLoading || preview) && selectedIds.length > 0 && (
            <section style={{ marginTop: 20 }}>
              <h2 style={sectionTitle}>Preview</h2>
              {previewLoading ? <Spinner /> : preview && (
                <>
                  <div
                    data-responsive-grid
                    style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 16 }}
                  >
                    <Stat label="Sold" value={mvr(preview.sold_laar)} />
                    <Stat label="Not returned" value={mvr(preview.missing_laar)} />
                    <Stat label="Invoice total" value={mvr(preview.total_laar)} strong />
                  </div>
                  {preview.blocked.length > 0 && (
                    <div style={{ marginBottom: 12, fontSize: 13, color: 'var(--color-danger)' }}>
                      {preview.blocked.map((b) => (
                        <div key={b.delivery_id}>{b.delivery_number}: {b.message}</div>
                      ))}
                    </div>
                  )}
                  {preview.lines.length > 0 && (
                    <TableCard>
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr>
                            {['Line', 'Qty', 'Unit', 'Total'].map((h) => (
                              <th key={h} style={thStyle}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {preview.lines.map((line, i) => (
                            <tr key={i} style={{ borderBottom: '1px solid var(--color-border-light)' }}>
                              <td style={tdStyle}>{line.description}</td>
                              <td style={tdStyle}>{line.quantity}</td>
                              <td style={tdStyle}>{mvr(line.unit_price_laar)}</td>
                              <td style={tdStyle}>{mvr(line.total_laar)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </TableCard>
                  )}
                </>
              )}
            </section>
          )}

          {canInvoice && selectedIds.length > 0 && preview && preview.total_laar > 0 && preview.blocked.length === 0 && (
            <section style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 480 }}>
              <label style={labelStyle}>Notes on invoice (optional)</label>
              <textarea
                value={invoiceNotes}
                onChange={(e) => setInvoiceNotes(e.target.value)}
                rows={2}
                style={textareaStyle}
                placeholder="Anything the shop should see on the tax invoice"
              />
              <Btn onClick={() => void handleRaise()} disabled={saving} style={{ minHeight: 44, alignSelf: 'flex-start' }}>
                <FileText size={16} style={{ marginRight: 6 }} />
                {saving ? 'Raising…' : `Raise invoice for ${mvr(preview.total_laar)}`}
              </Btn>
            </section>
          )}

          {!canInvoice && (
            <p style={{ marginTop: 16, fontSize: 13, color: 'var(--color-text-muted)' }}>
              You can view deliveries here. Raising invoices needs the trade.invoice permission.
            </p>
          )}
        </>
      )}

      {resolveTarget && (
        <Modal title={`Resolve mismatch — ${resolveTarget.delivery_number}`} onClose={() => setResolveTarget(null)}>
          <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
            The shop&apos;s reported sold count and what we counted on return disagree. Write what you decided — e.g. accept the shop count or accept our count.
          </p>
          <textarea
            value={resolveText}
            onChange={(e) => setResolveText(e.target.value)}
            rows={4}
            style={textareaStyle}
            placeholder="Decision and notes…"
          />
          <ModalActions>
            <Btn variant="secondary" onClick={() => setResolveTarget(null)}>Cancel</Btn>
            <Btn onClick={() => void handleResolve()} disabled={saving || !resolveText.trim()}>Save decision</Btn>
          </ModalActions>
        </Modal>
      )}

      {waiveTarget && (
        <Modal title={`Waive missing charge — ${waiveTarget.delivery_number}`} onClose={() => setWaiveTarget(null)}>
          <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
            This shop&apos;s terms say to ask before charging for stock that did not come back. Waiving means we will not bill the missing quantity on this delivery.
          </p>
          <textarea
            value={waiveReason}
            onChange={(e) => setWaiveReason(e.target.value)}
            rows={3}
            style={textareaStyle}
            placeholder="Reason for waiving…"
          />
          <ModalActions>
            <Btn variant="secondary" onClick={() => setWaiveTarget(null)}>Cancel</Btn>
            <Btn onClick={() => void handleWaive()} disabled={saving || !waiveReason.trim()}>Waive missing charge</Btn>
          </ModalActions>
        </Modal>
      )}

      {sendOpen && raisedInvoice && (
        <Modal title="Send invoice link" onClose={() => setSendOpen(false)}>
          <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--color-text-secondary)' }}>
            SMS a link to view and pay invoice {raisedInvoice.invoice_number}.
          </p>
          <Input value={sendPhone} onChange={setSendPhone} placeholder="Phone number" />
          <ModalActions>
            <Btn variant="secondary" onClick={() => setSendOpen(false)}>Cancel</Btn>
            <Btn onClick={() => void handleSend()} disabled={saving || !sendPhone.trim()}>Send SMS</Btn>
          </ModalActions>
        </Modal>
      )}
    </PageShell>
  );
}

function Stat({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div style={{ padding: 12, border: '1px solid var(--color-border)', borderRadius: 8 }}>
      <div style={{ fontSize: 11, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ fontSize: strong ? 18 : 15, fontWeight: strong ? 700 : 600, marginTop: 4, color: 'var(--color-text)' }}>{value}</div>
    </div>
  );
}

const thStyle: React.CSSProperties = {
  padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700,
  color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em',
  borderBottom: '1px solid var(--color-border)',
};
const tdStyle: React.CSSProperties = { padding: '12px 16px', fontSize: 13 };
const sectionTitle: React.CSSProperties = { fontSize: 16, fontWeight: 700, color: 'var(--color-text)', margin: '0 0 12px' };
const labelStyle: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 6 };
const textareaStyle: React.CSSProperties = {
  width: '100%', minHeight: 88, padding: '10px 12px', borderRadius: 8,
  border: '1px solid var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text)',
  fontSize: 13, fontFamily: 'inherit', resize: 'vertical',
};
