import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  getInvoices, getInvoice, markInvoiceSent, markInvoicePaid, voidInvoice, sendInvoiceToCustomer,
  generateInvoicePdf, pushInvoiceToXero,
  createInvoiceFromOrder, createInvoiceFromPurchase,
  createCreditNote, updateInvoice, createInvoice,
  type Invoice, type ManualInvoiceLineItem,
} from '../api';
import { Badge, Btn, ConfirmDialog, EmptyState, ErrorMsg, Modal, ModalActions, PageHeader, PageShell, Spinner, TableCard, TD, TH, statColor, useConfirmDialog } from '../components/Layout';
import { OrderSearch, type OrderSearchSelection } from '../components/OrderSearch';
import { PurchaseSearch, type PurchaseSearchSelection } from '../components/PurchaseSearch';
import { usePageTitle } from '../hooks/usePageTitle';
import { today } from '../utils/dateHelpers';
import { ADMIN_INVOICE_PAYMENT_METHODS } from '../lib/paymentMethods';

const TYPE_COLOR: Record<string, string> = { sale: 'teal', purchase: 'blue', credit_note: 'orange' };

type LookupSelection = { id: number; label: string };

export function InvoicesPage() {
  usePageTitle('Invoices');
  const [searchParams, setSearchParams] = useSearchParams();
  const [invoices, setInvoices]     = useState<Invoice[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState('');
  const [typeFilter, setType]       = useState('all');
  const [statusFilter, setStatus]   = useState('all');
  const [search, setSearch]         = useState(() => searchParams.get('search') ?? '');
  const [debouncedSearch, setDebouncedSearch] = useState(() => (searchParams.get('search') ?? '').trim());
  const autoOpenedFor = useRef<string | null>(null);
  const openedInvoiceId = useRef<string | null>(null);
  const [selected, setSelected]           = useState<Invoice | null>(null);
  const [paying, setPaying]               = useState(false);
  const [payMethod, setPayMethod]         = useState('cash');
  const [sendSmsInv, setSendSmsInv]       = useState<Invoice | null>(null);
  const [smsPhone, setSmsPhone]           = useState('');
  const [smsSending, setSmsSending]       = useState(false);
  const [smsResult, setSmsResult]         = useState<{ link: string } | null>(null);
  const [smsError, setSmsError]           = useState('');
  const [pdfLoading, setPdfLoading]       = useState<number | null>(null);
  const [xeroLoading, setXeroLoading]     = useState<number | null>(null);
  const [toast, setToast]                 = useState('');
  const { state: dlg, ask, close: closeDlg } = useConfirmDialog();

  // Create from order/purchase
  const [createFrom, setCreateFrom]       = useState<'order' | 'purchase' | null>(null);
  const [createRef, setCreateRef]         = useState<LookupSelection | null>(null);
  const [creating, setCreating]           = useState(false);

  // Edit invoice
  const [editInv, setEditInv]             = useState<Invoice | null>(null);
  const [editForm, setEditForm]           = useState({ recipient_name: '', recipient_phone: '', due_date: '', notes: '' });
  const [editSaving, setEditSaving]       = useState(false);

  // Bulk selection
  const [bulkSelected, setBulkSelected]   = useState<Set<number>>(new Set());
  const [bulkLoading, setBulkLoading]     = useState(false);

  // Credit note
  const [cnInv, setCnInv]                 = useState<Invoice | null>(null);
  const [cnForm, setCnForm]               = useState({ reason: '', amount: '' });
  const [cnSaving, setCnSaving]           = useState(false);

  // Manual invoice creation
  const emptyLine = (): ManualInvoiceLineItem => ({ description: '', quantity: 1, unit_price: 0 });
  const [showManual, setShowManual]       = useState(false);
  const [manualForm, setManualForm]       = useState({ type: 'sale' as 'sale' | 'purchase' | 'credit_note', recipient_name: '', recipient_phone: '', issue_date: today(), due_date: '', notes: '', tax_rate_bp: '0' });
  const [manualLines, setManualLines]     = useState<ManualInvoiceLineItem[]>([emptyLine()]);
  const [manualSaving, setManualSaving]   = useState(false);
  const [manualError, setManualError]     = useState('');

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3500); };

  const toggleSelect = (id: number) => setBulkSelected((s) => {
    const n = new Set(s);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  });
  const toggleAll = () => {
    if (bulkSelected.size === invoices.length) setBulkSelected(new Set());
    else setBulkSelected(new Set(invoices.map((i) => i.id)));
  };

  const bulkMarkSent = async () => {
    setBulkLoading(true);
    try {
      await Promise.all([...bulkSelected].map((id) => markInvoiceSent(id)));
      showToast(`${bulkSelected.size} invoice${bulkSelected.size !== 1 ? 's' : ''} marked as sent.`);
      setBulkSelected(new Set()); void load();
    } catch (e) { setError((e as Error).message); }
    finally { setBulkLoading(false); }
  };

  const bulkVoid = () => {
    ask({
      title: 'Void Selected',
      message: `Void ${bulkSelected.size} invoice${bulkSelected.size !== 1 ? 's' : ''}? This cannot be undone.`,
      confirmLabel: 'Void All',
      danger: true,
      onConfirm: async () => {
        setBulkLoading(true);
        try {
          await Promise.all([...bulkSelected].map((id) => voidInvoice(id)));
          showToast(`${bulkSelected.size} invoice${bulkSelected.size !== 1 ? 's' : ''} voided.`);
          setBulkSelected(new Set()); void load();
        } catch (e) { setError((e as Error).message); }
        finally { setBulkLoading(false); }
      },
    });
  };

  // Pre-fix this fetched page 1 only with the API's default page size
  // and silently capped the list at ~15 invoices; a busy day's history
  // disappeared off the bottom of the UI with no "more" affordance.
  // Now we expose page state, render real pagination, and lift the
  // visible default to 50 per page.
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState<{ current_page: number; last_page: number; total: number } | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    const fromUrl = searchParams.get('search') ?? '';
    if (fromUrl === debouncedSearch) return;
    setSearch(fromUrl);
    setDebouncedSearch(fromUrl.trim());
    autoOpenedFor.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  useEffect(() => {
    const current = searchParams.get('search') ?? '';
    if (debouncedSearch === current) return;
    const next = new URLSearchParams(searchParams);
    if (debouncedSearch) next.set('search', debouncedSearch);
    else next.delete('search');
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, setSearchParams]);

  const load = async () => {
    setLoading(true); setError('');
    try {
      const res = await getInvoices({
        type: typeFilter !== 'all' ? typeFilter : undefined,
        status: statusFilter !== 'all' ? statusFilter : undefined,
        search: debouncedSearch || undefined,
        page,
        per_page: 50,
      });
      const list = res.data ?? [];
      setInvoices(list);
      const resMeta = (res as { meta?: typeof meta }).meta;
      setMeta(resMeta ?? null);
      if (debouncedSearch && autoOpenedFor.current !== debouncedSearch) {
        const needle = debouncedSearch.toLowerCase();
        const match = list.find((inv) => inv.invoice_number.toLowerCase() === needle)
          ?? (list.length === 1 ? list[0] : null);
        if (match) {
          setSelected(match);
          autoOpenedFor.current = debouncedSearch;
        }
      }
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  };

  // Open a specific invoice by id from ?invoice=
  useEffect(() => {
    const invoiceId = searchParams.get('invoice');
    if (!invoiceId || openedInvoiceId.current === invoiceId) return;
    openedInvoiceId.current = invoiceId;
    const id = Number(invoiceId);
    if (!Number.isFinite(id)) return;
    void getInvoice(id)
      .then((res) => { if (res.invoice) setSelected(res.invoice); })
      .catch((e: Error) => setError(e.message));
  }, [searchParams]);

  // Reset to page 1 whenever filters change so we never land on a
  // page that no longer exists for the new filter combo.
  useEffect(() => { setPage(1); }, [typeFilter, statusFilter, debouncedSearch]);
  useEffect(() => { void load(); }, [typeFilter, statusFilter, page, debouncedSearch]);

  const handleSent = async (id: number) => {
    try { await markInvoiceSent(id); void load(); }
    catch (e) { setError((e as Error).message); }
  };
  const handlePaid = async () => {
    if (!selected) return;
    try {
      await markInvoicePaid(selected.id, payMethod);
      setPaying(false); setSelected(null); void load();
    } catch (e) { setError((e as Error).message); }
  };
  const handleVoid = (id: number) => {
    ask({
      title: 'Void Invoice',
      message: 'Void this invoice? This action cannot be undone.',
      confirmLabel: 'Void',
      danger: true,
      onConfirm: async () => {
        try { await voidInvoice(id); void load(); }
        catch (e) { setError((e as Error).message); }
      },
    });
  };

  const handleDownloadPdf = async (inv: Invoice) => {
    setPdfLoading(inv.id);
    try {
      const blob = await generateInvoicePdf(inv.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${inv.invoice_number}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) { setError((e as Error).message); }
    finally { setPdfLoading(null); }
  };

  const handlePushXero = async (inv: Invoice) => {
    setXeroLoading(inv.id);
    try {
      await pushInvoiceToXero(inv.id);
      showToast(`${inv.invoice_number} pushed to Xero.`);
    } catch (e) { setError((e as Error).message); }
    finally { setXeroLoading(null); }
  };

  const handleCreateFrom = async () => {
    if (!createRef || createRef.id <= 0) { setError('Select an order or purchase first.'); return; }
    setCreating(true); setError('');
    try {
      const res = createFrom === 'order'
        ? await createInvoiceFromOrder(createRef.id)
        : await createInvoiceFromPurchase(createRef.id);
      showToast(`Invoice ${res.invoice.invoice_number} created.`);
      setCreateFrom(null); setCreateRef(null);
      void load();
    } catch (e) { setError((e as Error).message); }
    finally { setCreating(false); }
  };

  const openEdit = (inv: Invoice) => {
    setEditInv(inv);
    setEditForm({
      recipient_name: inv.recipient_name ?? inv.customer?.name ?? '',
      recipient_phone: inv.recipient_phone ?? inv.customer?.phone ?? '',
      due_date: inv.due_date ?? '',
      notes: (inv as Invoice & { notes?: string }).notes ?? '',
    });
  };

  const handleEdit = async () => {
    if (!editInv) return;
    setEditSaving(true); setError('');
    try {
      await updateInvoice(editInv.id, {
        recipient_name: editForm.recipient_name || undefined,
        recipient_phone: editForm.recipient_phone || undefined,
        due_date: editForm.due_date || null,
        notes: editForm.notes || null,
      });
      showToast('Invoice updated.');
      setEditInv(null);
      void load();
    } catch (e) { setError((e as Error).message); }
    finally { setEditSaving(false); }
  };

  const handleCreditNote = async () => {
    if (!cnInv) return;
    const amount = parseFloat(cnForm.amount);
    if (!cnForm.reason.trim() || isNaN(amount) || amount <= 0) {
      setError('Please provide a reason and valid amount.');
      return;
    }
    setCnSaving(true); setError('');
    try {
      const res = await createCreditNote(cnInv.id, { reason: cnForm.reason.trim(), amount });
      showToast(`Credit note ${res.credit_note.invoice_number} created.`);
      setCnInv(null); setCnForm({ reason: '', amount: '' });
      void load();
    } catch (e) { setError((e as Error).message); }
    finally { setCnSaving(false); }
  };

  const handleManualCreate = async () => {
    const lines = manualLines.filter((l) => l.description.trim());
    if (!lines.length) { setManualError('Add at least one line item.'); return; }
    setManualSaving(true); setManualError('');
    try {
      const res = await createInvoice({
        type: manualForm.type,
        recipient_name: manualForm.recipient_name || undefined,
        recipient_phone: manualForm.recipient_phone || undefined,
        issue_date: manualForm.issue_date,
        due_date: manualForm.due_date || undefined,
        notes: manualForm.notes || undefined,
        tax_rate_bp: manualForm.tax_rate_bp
          ? (() => { const v = parseInt(manualForm.tax_rate_bp, 10); return isNaN(v) ? undefined : v; })()
          : undefined,
        items: lines,
      });
      showToast(`Invoice ${res.invoice.invoice_number} created.`);
      setShowManual(false);
      setManualLines([emptyLine()]);
      setManualForm({ type: 'sale', recipient_name: '', recipient_phone: '', issue_date: today(), due_date: '', notes: '', tax_rate_bp: '0' });
      void load();
    } catch (e) { setManualError((e as Error).message); }
    finally { setManualSaving(false); }
  };

  const openSmsModal = (inv: Invoice) => {
    setSendSmsInv(inv);
    setSmsPhone(inv.recipient_phone ?? inv.customer?.phone ?? '');
    setSmsResult(null);
    setSmsError('');
  };

  const handleSendSms = async () => {
    if (!sendSmsInv) return;
    setSmsSending(true); setSmsError('');
    try {
      const res = await sendInvoiceToCustomer(sendSmsInv.id, smsPhone);
      setSmsResult({ link: res.link });
      void load();
    } catch (e) { setSmsError((e as Error).message); }
    finally { setSmsSending(false); }
  };

  const selectStyle = {
    height: 36, padding: '0 10px',
    border: '1.5px solid var(--color-border)', borderRadius: 10,
    fontSize: 13, fontFamily: 'inherit',
    background: 'var(--color-surface)', color: 'var(--color-text)', outline: 'none', cursor: 'pointer',
  };

  return (
    <PageShell>
    <>
      <ConfirmDialog state={dlg} close={closeDlg} />
      <PageHeader section="Analyze"
        title="Invoices"
        subtitle="Manage sale and purchase invoices"
        action={
          <div style={{ display: 'flex', gap: 8 }}>
            <Btn onClick={() => { setShowManual(true); setManualError(''); }}>+ New Invoice</Btn>
            <Btn variant="secondary" onClick={() => { setCreateFrom('order'); setCreateRef(null); }}>+ From Order</Btn>
            <Btn variant="secondary" onClick={() => { setCreateFrom('purchase'); setCreateRef(null); }}>+ From Purchase</Btn>
            <Btn onClick={load} variant="secondary">↻ Refresh</Btn>
          </div>
        }
      />
      {toast && (
        <div style={{ background: '#DCFCE7', color: '#166534', padding: '10px 14px', borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
          {toast}
        </div>
      )}
      {error && <ErrorMsg message={error} />}

      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search invoice #, recipient…"
          style={{ ...selectStyle, minWidth: 220 }}
        />
        <select value={typeFilter} onChange={(e) => setType(e.target.value)} style={selectStyle}>
          <option value="all">All Types</option>
          <option value="sale">Sale</option>
          <option value="purchase">Purchase</option>
          <option value="credit_note">Credit Note</option>
        </select>
        <select value={statusFilter} onChange={(e) => setStatus(e.target.value)} style={selectStyle}>
          <option value="all">All Statuses</option>
          {['draft', 'sent', 'paid', 'overdue', 'void'].map((s) => (
            <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
          ))}
        </select>
      </div>

      {/* Bulk action bar */}
      {bulkSelected.size > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 16px', borderRadius: 10, marginBottom: 12,
          background: '#1C1408', color: '#fff',
        }}>
          <span style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>{bulkSelected.size} selected</span>
          <Btn small onClick={bulkMarkSent} disabled={bulkLoading}>Mark Sent</Btn>
          <Btn small variant="danger" onClick={bulkVoid} disabled={bulkLoading}>Void All</Btn>
          <button onClick={() => setBulkSelected(new Set())} style={{ background: 'none', border: 'none', color: '#C4B5A3', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>×</button>
        </div>
      )}

      {loading ? <Spinner /> : (
        <TableCard>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr>
                <th style={{ ...TH, width: 36 }}>
                  <input type="checkbox" checked={bulkSelected.size === invoices.length && invoices.length > 0} onChange={toggleAll} style={{ cursor: 'pointer' }} />
                </th>
                {['Number', 'Type', 'Status', 'Recipient', 'Source', 'Total', 'Issue Date', 'Due', 'Actions'].map((h) => (
                  <th key={h} style={TH}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.id} style={{ background: bulkSelected.has(inv.id) ? '#FEF8F2' : undefined }}>
                  <td style={{ ...TD, width: 36 }}>
                    <input type="checkbox" checked={bulkSelected.has(inv.id)} onChange={() => toggleSelect(inv.id)} style={{ cursor: 'pointer' }} />
                  </td>
                  <td style={{ ...TD, fontWeight: 700, color: 'var(--color-text)' }}>{inv.invoice_number}</td>
                  <td style={TD}>
                    <Badge label={inv.type.replace('_', ' ')} color={TYPE_COLOR[inv.type] ?? 'gray'} />
                  </td>
                  <td style={TD}>
                    <Badge
                      label={(inv as { display_status?: string; on_credit_account?: boolean }).display_status
                        ?? ((inv as { on_credit_account?: boolean }).on_credit_account && inv.status === 'sent' ? 'on credit' : inv.status)}
                      color={statColor(inv.status)}
                    />
                  </td>
                  <td style={{ ...TD, color: 'var(--color-text-secondary)' }}>
                    {inv.customer?.id ? (
                      <Link to={`/customers?customer=${inv.customer.id}`} style={{ color: 'var(--color-primary)', fontWeight: 600, textDecoration: 'none' }}>
                        {inv.recipient_name ?? inv.customer.name}
                      </Link>
                    ) : (
                      inv.recipient_name ?? inv.customer?.name ?? inv.supplier?.name ?? '—'
                    )}
                  </td>
                  <td style={TD}>
                    {inv.order_id ? (
                      <Link
                        to={`/orders?order=${inv.order_id}`}
                        style={{ color: 'var(--color-primary)', fontWeight: 600, textDecoration: 'none', fontSize: 12 }}
                      >
                        Order {inv.order?.order_number ? `#${inv.order.order_number}` : `#${inv.order_id}`}
                      </Link>
                    ) : inv.purchase_id ? (
                      <Link
                        to={`/purchase-orders?search=${encodeURIComponent(inv.purchase?.purchase_number || String(inv.purchase_id))}`}
                        style={{ color: 'var(--color-primary)', fontWeight: 600, textDecoration: 'none', fontSize: 12 }}
                      >
                        {inv.purchase?.purchase_number || `PO #${inv.purchase_id}`}
                      </Link>
                    ) : (
                      <span style={{ color: '#C4B5A3' }}>—</span>
                    )}
                  </td>
                  <td style={{ ...TD, fontWeight: 700, color: 'var(--color-primary)' }}>
                    MVR {parseFloat(String(inv.total ?? 0)).toFixed(2)}
                    {(inv as { balance_due?: number }).balance_due != null
                      && (inv as { balance_due?: number }).balance_due! > 0
                      && inv.status !== 'paid' && (
                      <div style={{ fontSize: 11, color: '#B45309', fontWeight: 600 }}>
                        MVR {(inv as { balance_due?: number }).balance_due!.toFixed(2)} due
                      </div>
                    )}
                  </td>
                  <td style={{ ...TD, color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>{inv.issue_date}</td>
                  <td style={{ ...TD, color: inv.status === 'overdue' ? 'var(--color-danger)' : 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
                    {inv.due_date ?? '—'}
                  </td>
                  <td style={TD}>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {inv.status === 'draft' && (
                        <Btn small variant="secondary" onClick={() => handleSent(inv.id)}>Mark Sent</Btn>
                      )}
                      {['sent', 'overdue'].includes(inv.status) && (
                        <Btn small onClick={() => { setSelected(inv); setPaying(true); }}>
                          {(inv as { on_credit_account?: boolean }).on_credit_account
                            ? 'Record repayment for this invoice'
                            : 'Mark Paid'}
                        </Btn>
                      )}
                      {!['void', 'cancelled'].includes(inv.status) && inv.type === 'sale' && (
                        <Btn small variant="secondary" onClick={() => openSmsModal(inv)}>📱 SMS</Btn>
                      )}
                      <Btn small variant="secondary" onClick={() => void handleDownloadPdf(inv)} disabled={pdfLoading === inv.id}>
                        {pdfLoading === inv.id ? '…' : '↓ PDF'}
                      </Btn>
                      {!['void', 'cancelled'].includes(inv.status) && (
                        <Btn small variant="secondary" onClick={() => void handlePushXero(inv)} disabled={xeroLoading === inv.id}>
                          {xeroLoading === inv.id ? '…' : 'Xero ↑'}
                        </Btn>
                      )}
                      {inv.status === 'draft' && (
                        <Btn small variant="secondary" onClick={() => openEdit(inv)}>Edit</Btn>
                      )}
                      {inv.type === 'sale' && ['sent', 'paid'].includes(inv.status) && (
                        <Btn small variant="secondary" onClick={() => { setCnInv(inv); setCnForm({ reason: '', amount: '' }); }}>Credit Note</Btn>
                      )}
                      {!['void', 'cancelled'].includes(inv.status) && (
                        <Btn small variant="danger" onClick={() => handleVoid(inv.id)}>Void</Btn>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {invoices.length === 0 && (
                <tr>
                  <td colSpan={10}>
                    <EmptyState message="No invoices found." />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </TableCard>
      )}

      {/* Pagination — only when there's more than one page worth */}
      {meta && meta.last_page > 1 && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginTop: 16, padding: '8px 4px', fontSize: 13, color: 'var(--color-text-secondary)',
        }}>
          <div>
            Showing page <strong>{meta.current_page}</strong> of <strong>{meta.last_page}</strong>
            {' · '}<strong>{meta.total}</strong> invoices total
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Btn small variant="secondary" onClick={() => setPage((p) => Math.max(1, p - 1))} {...({ disabled: page <= 1 } as object)}>← Prev</Btn>
            <Btn small variant="secondary" onClick={() => setPage((p) => Math.min(meta.last_page, p + 1))} {...({ disabled: page >= meta.last_page } as object)}>Next →</Btn>
          </div>
        </div>
      )}

      {/* Mark Paid Modal */}
      {paying && selected && (
        <Modal
          title={(selected as { on_credit_account?: boolean }).on_credit_account
            ? 'Record repayment for this invoice'
            : 'Mark Invoice Paid'}
          onClose={() => { setPaying(false); setSelected(null); }}
          maxWidth={380}
        >
          <p style={{ color: 'var(--color-text-secondary)', fontSize: 14, marginBottom: 20 }}>
            {selected.invoice_number} · <strong style={{ color: 'var(--color-primary)' }}>MVR {parseFloat(String(selected.total ?? 0)).toFixed(2)}</strong>
          </p>
          {(selected as { on_credit_account?: boolean }).on_credit_account && (
            <p style={{ color: '#B45309', fontSize: 12, marginBottom: 16 }}>
              This invoice is on the customer's credit account. Confirming will
              record a repayment against their credit balance (not flip the
              invoice status directly).
            </p>
          )}
          <div style={{ marginBottom: 20 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 6 }}>Payment Method</label>
            <select
              value={payMethod}
              onChange={(e) => setPayMethod(e.target.value)}
              style={{ width: '100%', height: 36, padding: '0 10px', border: '1.5px solid var(--color-border)', borderRadius: 10, fontSize: 13, fontFamily: 'inherit', background: 'var(--color-surface)', outline: 'none' }}
            >
              {ADMIN_INVOICE_PAYMENT_METHODS.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>
          <ModalActions>
            <Btn variant="ghost" onClick={() => { setPaying(false); setSelected(null); }}>Cancel</Btn>
            <Btn onClick={handlePaid}>Confirm Payment</Btn>
          </ModalActions>
        </Modal>
      )}

      {/* Send Invoice via SMS Modal */}
      {sendSmsInv && (
        <Modal title={`Send Invoice ${sendSmsInv.invoice_number}`} onClose={() => setSendSmsInv(null)} maxWidth={400}>
          {smsResult ? (
            <>
              <p style={{ color: '#047857', fontWeight: 600, marginBottom: 8 }}>✓ Invoice sent!</p>
              <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 4 }}>Public link:</p>
              <div style={{ background: '#F9F5F0', borderRadius: 8, padding: '10px 12px', fontSize: 12, wordBreak: 'break-all', marginBottom: 16, color: '#1C1408' }}>
                {smsResult.link}
              </div>
              <ModalActions>
                <Btn variant="secondary" onClick={() => { void navigator.clipboard.writeText(smsResult.link); }}>Copy Link</Btn>
                <Btn onClick={() => setSendSmsInv(null)}>Done</Btn>
              </ModalActions>
            </>
          ) : (
            <>
              <div style={{ marginBottom: 4 }}>
                <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
                  MVR {parseFloat(String(sendSmsInv.total ?? 0)).toFixed(2)}
                  {sendSmsInv.recipient_phone && <> · Last sent to: <strong>{sendSmsInv.recipient_phone}</strong></>}
                </span>
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 6 }}>Customer Phone</label>
                <input
                  type="tel"
                  value={smsPhone}
                  onChange={(e) => setSmsPhone(e.target.value)}
                  placeholder="7654321"
                  style={{ width: '100%', height: 36, padding: '0 10px', border: '1.5px solid var(--color-border)', borderRadius: 10, fontSize: 13, fontFamily: 'inherit', background: 'var(--color-surface)', outline: 'none', boxSizing: 'border-box' }}
                />
              </div>
              {smsError && <p style={{ color: 'var(--color-danger)', fontSize: 13, marginBottom: 8 }}>{smsError}</p>}
              <ModalActions>
                <Btn variant="ghost" onClick={() => setSendSmsInv(null)}>Cancel</Btn>
                <Btn onClick={() => void handleSendSms()} disabled={smsSending || !smsPhone.trim()}>
                  {smsSending ? 'Sending…' : 'Send SMS'}
                </Btn>
              </ModalActions>
            </>
          )}
        </Modal>
      )}
      {/* Create from Order / Purchase Modal */}
      {createFrom && (
        <Modal
          title={createFrom === 'order' ? 'Create Invoice from Order' : 'Create Invoice from Purchase'}
          onClose={() => { setCreateFrom(null); setCreateRef(null); }}
          maxWidth={480}
        >
          <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 16 }}>
            Search and select a {createFrom === 'order' ? 'paid order' : 'purchase order'} to generate an invoice.
          </p>
          <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 6 }}>
            {createFrom === 'order' ? 'Order' : 'Purchase'} *
          </label>
          {createFrom === 'order'
            ? (
              <OrderSearch
                value={createRef ? { id: createRef.id, label: createRef.label, orderNumber: '', total: 0 } : null}
                onChange={(v: OrderSearchSelection | null) => setCreateRef(v ? { id: v.id, label: v.label } : null)}
              />
            )
            : (
              <PurchaseSearch
                value={createRef ? { id: createRef.id, label: createRef.label, purchaseNumber: '', total: 0 } : null}
                onChange={(v: PurchaseSearchSelection | null) => setCreateRef(v ? { id: v.id, label: v.label } : null)}
              />
            )}
          <ModalActions>
            <Btn variant="ghost" onClick={() => { setCreateFrom(null); setCreateRef(null); }}>Cancel</Btn>
            <Btn onClick={() => void handleCreateFrom()} disabled={creating || !createRef}>
              {creating ? 'Creating…' : 'Create Invoice'}
            </Btn>
          </ModalActions>
        </Modal>
      )}

      {/* Edit Invoice Modal */}
      {editInv && (
        <Modal title={`Edit — ${editInv.invoice_number}`} onClose={() => setEditInv(null)} maxWidth={440}>
          {([
            { key: 'recipient_name',  label: 'Recipient Name',  type: 'text' },
            { key: 'recipient_phone', label: 'Recipient Phone', type: 'tel' },
            { key: 'due_date',        label: 'Due Date',        type: 'date' },
          ] as { key: keyof typeof editForm; label: string; type: string }[]).map(({ key, label, type }) => (
            <div key={key} style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 5 }}>{label}</label>
              <input
                type={type}
                value={editForm[key]}
                onChange={(e) => setEditForm((f) => ({ ...f, [key]: e.target.value }))}
                style={{ width: '100%', height: 36, padding: '0 10px', border: '1.5px solid var(--color-border)', borderRadius: 10, fontSize: 13, fontFamily: 'inherit', background: 'var(--color-surface)', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>
          ))}
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 5 }}>Notes</label>
            <textarea
              value={editForm.notes}
              onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))}
              rows={3}
              style={{ width: '100%', padding: '8px 10px', border: '1.5px solid var(--color-border)', borderRadius: 10, fontSize: 13, fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' }}
            />
          </div>
          <ModalActions>
            <Btn variant="ghost" onClick={() => setEditInv(null)}>Cancel</Btn>
            <Btn onClick={() => void handleEdit()} disabled={editSaving}>
              {editSaving ? 'Saving…' : 'Save Changes'}
            </Btn>
          </ModalActions>
        </Modal>
      )}

      {/* Manual Invoice Modal */}
      {showManual && (
        <Modal title="New Invoice" onClose={() => setShowManual(false)} maxWidth={600}>
          {manualError && <p style={{ color: '#dc2626', fontSize: 13, marginBottom: 8 }}>{manualError}</p>}
          <div className="form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
            {([
              { key: 'recipient_name',  label: 'Recipient Name',  type: 'text' },
              { key: 'recipient_phone', label: 'Phone',           type: 'tel' },
              { key: 'issue_date',      label: 'Issue Date *',    type: 'date' },
              { key: 'due_date',        label: 'Due Date',        type: 'date' },
            ] as { key: keyof typeof manualForm; label: string; type: string }[]).map(({ key, label, type }) => (
              <div key={key}>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 4 }}>{label}</label>
                <input type={type} value={manualForm[key]} onChange={(e) => setManualForm((f) => ({ ...f, [key]: e.target.value }))}
                  style={{ width: '100%', height: 36, padding: '0 10px', border: '1.5px solid var(--color-border)', borderRadius: 10, fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box' }} />
              </div>
            ))}
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 4 }}>Type *</label>
              <select value={manualForm.type} onChange={(e) => setManualForm((f) => ({ ...f, type: e.target.value as typeof manualForm.type }))}
                style={{ width: '100%', height: 36, padding: '0 10px', border: '1.5px solid var(--color-border)', borderRadius: 10, fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box' }}>
                <option value="sale">Sale</option>
                <option value="purchase">Purchase</option>
                <option value="credit_note">Credit Note</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 4 }}>Tax Rate (basis points, e.g. 600 = 6%)</label>
              <input type="number" min="0" max="10000" value={manualForm.tax_rate_bp} onChange={(e) => setManualForm((f) => ({ ...f, tax_rate_bp: e.target.value }))}
                style={{ width: '100%', height: 36, padding: '0 10px', border: '1.5px solid var(--color-border)', borderRadius: 10, fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box' }} />
            </div>
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 4 }}>Notes</label>
            <textarea value={manualForm.notes} onChange={(e) => setManualForm((f) => ({ ...f, notes: e.target.value }))} rows={2}
              style={{ width: '100%', padding: '8px 10px', border: '1.5px solid var(--color-border)', borderRadius: 10, fontSize: 13, fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' }} />
          </div>
          <div style={{ marginBottom: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-secondary)' }}>Line Items *</label>
              <Btn small variant="secondary" onClick={() => setManualLines((l) => [...l, emptyLine()])}>+ Add Line</Btn>
            </div>
            <div style={{ display: 'flex', gap: 6, fontSize: 11, fontWeight: 700, color: 'var(--color-text-muted)', marginBottom: 4, padding: '0 2px' }}>
              <span style={{ flex: 3 }}>Description</span>
              <span style={{ width: 70 }}>Qty</span>
              <span style={{ width: 90 }}>Unit Price</span>
              <span style={{ width: 28 }}></span>
            </div>
            {manualLines.map((line, i) => (
              <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'center' }}>
                <input value={line.description} onChange={(e) => setManualLines((ls) => ls.map((l, j) => j === i ? { ...l, description: e.target.value } : l))}
                  placeholder="Description" style={{ flex: 3, height: 34, padding: '0 8px', border: '1.5px solid var(--color-border)', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box' }} />
                <input type="number" min="0.001" step="0.001" value={line.quantity} onChange={(e) => setManualLines((ls) => ls.map((l, j) => j === i ? { ...l, quantity: parseFloat(e.target.value) || 0 } : l))}
                  style={{ width: 70, height: 34, padding: '0 8px', border: '1.5px solid var(--color-border)', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box' }} />
                <input type="number" min="0" step="0.01" value={line.unit_price} onChange={(e) => setManualLines((ls) => ls.map((l, j) => j === i ? { ...l, unit_price: parseFloat(e.target.value) || 0 } : l))}
                  style={{ width: 90, height: 34, padding: '0 8px', border: '1.5px solid var(--color-border)', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box' }} />
                {manualLines.length > 1 && (
                  <button onClick={() => setManualLines((ls) => ls.filter((_, j) => j !== i))}
                    style={{ width: 28, height: 28, border: 'none', borderRadius: 6, background: '#FEE2E2', color: '#991B1B', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
                )}
              </div>
            ))}
            <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', fontWeight: 700, textAlign: 'right', margin: '8px 0 0' }}>
              Subtotal: MVR {manualLines.reduce((s, l) => s + (l.quantity * l.unit_price), 0).toFixed(2)}
            </p>
          </div>
          <ModalActions>
            <Btn variant="ghost" onClick={() => setShowManual(false)}>Cancel</Btn>
            <Btn onClick={() => void handleManualCreate()} disabled={manualSaving}>
              {manualSaving ? 'Creating…' : 'Create Invoice'}
            </Btn>
          </ModalActions>
        </Modal>
      )}

      {cnInv && (
        <Modal title={`Credit Note — ${cnInv.invoice_number}`} onClose={() => setCnInv(null)} maxWidth={420}>
          <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 16 }}>
            Invoice total: <strong style={{ color: 'var(--color-primary)' }}>MVR {parseFloat(String(cnInv.total ?? 0)).toFixed(2)}</strong>
          </p>
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 5 }}>Reason *</label>
            <input
              type="text"
              value={cnForm.reason}
              onChange={(e) => setCnForm((f) => ({ ...f, reason: e.target.value }))}
              placeholder="e.g. Overcharge, returned item…"
              style={{ width: '100%', height: 36, padding: '0 10px', border: '1.5px solid var(--color-border)', borderRadius: 10, fontSize: 13, fontFamily: 'inherit', background: 'var(--color-surface)', outline: 'none', boxSizing: 'border-box' }}
            />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 5 }}>Credit Amount (MVR) *</label>
            <input
              type="number" min="0.01" step="0.01"
              value={cnForm.amount}
              onChange={(e) => setCnForm((f) => ({ ...f, amount: e.target.value }))}
              placeholder="0.00"
              style={{ width: '100%', height: 36, padding: '0 10px', border: '1.5px solid var(--color-border)', borderRadius: 10, fontSize: 13, fontFamily: 'inherit', background: 'var(--color-surface)', outline: 'none', boxSizing: 'border-box' }}
            />
          </div>
          <ModalActions>
            <Btn variant="ghost" onClick={() => setCnInv(null)}>Cancel</Btn>
            <Btn onClick={() => void handleCreditNote()} disabled={cnSaving || !cnForm.reason.trim() || !cnForm.amount}>
              {cnSaving ? 'Creating…' : 'Issue Credit Note'}
            </Btn>
          </ModalActions>
        </Modal>
      )}
    </>
    </PageShell>
  );
}
