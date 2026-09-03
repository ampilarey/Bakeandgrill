import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { approvePurchase, rejectPurchase, receivePurchase, updatePurchase, getPurchaseSuggestions, createPurchaseFromSuggest, createPurchase, fetchPurchases, fetchSuppliers, importPurchaseCsv, uploadPurchaseReceipt, type Purchase, type PurchaseSuggestions, type Supplier } from '../api';
import { Badge, Btn, Card, EmptyState, ErrorMsg, Modal, ModalActions, PageHeader, PageShell, Select, Spinner, TableCard, TD, TH } from '../components/Layout';
import { ItemSearch, type InventoryItemSelection } from '../components/ItemSearch';
import { usePageTitle } from '../hooks/usePageTitle';
import { ScanSheet } from '../components/ScanSheet';
import { countScannedItem } from '../utils/receivingScan';
import { today } from '../utils/dateHelpers';

type ManualPoLine = {
  selection: InventoryItemSelection | null;
  quantity: string;
  unit_cost: string;
};

const blankManualLine = (): ManualPoLine => ({ selection: null, quantity: '1', unit_cost: '0' });

const STATUS_COLOR: Record<string, string> = {
  draft:    'gray',
  ordered:  'blue',
  partial:  'yellow',
  received: 'green',
  cancelled:'red',
};

const STATUS_OPTIONS = [
  { value: 'all', label: 'All Statuses' },
  { value: 'draft',     label: 'Draft'     },
  { value: 'ordered',   label: 'Ordered'   },
  { value: 'partial',   label: 'Partial'   },
  { value: 'received',  label: 'Received'  },
  { value: 'cancelled', label: 'Cancelled' },
];

export function PurchaseOrdersPage() {
  usePageTitle('Purchase Orders');
  const [searchParams, setSearchParams] = useSearchParams();
  const [purchases, setPurchases]         = useState<Purchase[]>([]);
  const [loading, setLoading]             = useState(true);
  const [error, setError]                 = useState('');
  const [suggestions, setSuggestions]     = useState<PurchaseSuggestions | null>(null);
  const [sugLoading, setSugLoading]       = useState(false);
  const [statusFilter, setStatus]         = useState('all');
  const [search, setSearch]               = useState(() => searchParams.get('search') ?? '');
  const [debouncedSearch, setDebouncedSearch] = useState(() => (searchParams.get('search') ?? '').trim());
  const autoOpenedFor = useRef<string | null>(null);
  const [detail, setDetail]               = useState<Purchase | null>(null);
  const [rejectId, setRejectId]           = useState<number | null>(null);
  const [rejectReason, setRejectReason]   = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [toast, setToast]                 = useState('');
  // per-item receive quantities (purchase_item_id → qty)
  const [receiveQtys, setReceiveQtys]     = useState<Record<number, number>>({});
  const [receiveNotes, setReceiveNotes]   = useState('');
  // Receiving by scan: a gun into the box, or the camera. Owner, 2026-09-02.
  const [scanCode, setScanCode] = useState('');
  const [scanMsg, setScanMsg] = useState('');
  const [scanCamera, setScanCamera] = useState(false);
  const applyScan = (code: string) => {
    if (!detail) return;
    const r = countScannedItem(detail.items ?? [], receiveQtys, code);
    setReceiveQtys(r.qtys);
    setScanMsg(r.message);
    setScanCode('');
  };
  const [gstForm, setGstForm] = useState({
    is_input_tax_claimable: false,
    supplier_tin: '',
    supplier_invoice_no: '',
    supplier_invoice_date: '',
    amount_ex_gst: '',
    gst_amount: '',
    revenue_or_capital: 'revenue' as 'revenue' | 'capital',
  });

  const [creatingPoFor, setCreatingPoFor] = useState<number | null>(null);

  // Manual PO
  const [showManualPo, setShowManualPo] = useState(false);
  const [manualSuppliers, setManualSuppliers] = useState<Supplier[]>([]);
  const [manualPoForm, setManualPoForm] = useState({
    supplier_id: '',
    purchase_date: today(),
    notes: '',
    lines: [blankManualLine()] as ManualPoLine[],
  });
  const [manualPoSaving, setManualPoSaving] = useState(false);
  const [manualPoError, setManualPoError] = useState('');

  const openManualPo = async () => {
    setManualPoError('');
    setManualPoForm({
      supplier_id: '',
      purchase_date: today(),
      notes: '',
      lines: [blankManualLine()],
    });
    setShowManualPo(true);
    try {
      const supRes = await fetchSuppliers({ active_only: true });
      setManualSuppliers(supRes.data ?? []);
    } catch (e) { setManualPoError((e as Error).message); }
  };

  const handleCreateManualPo = async () => {
    if (!manualPoForm.supplier_id) { setManualPoError('Select a supplier.'); return; }
    const lines = manualPoForm.lines
      .filter((l) => l.selection)
      .map((l) => {
        const item = l.selection!.item;
        const qty = parseFloat(l.quantity);
        const cost = parseFloat(l.unit_cost);
        if (isNaN(qty) || qty <= 0 || isNaN(cost) || cost < 0) return null;
        return {
          inventory_item_id: item.id,
          name: item.name,
          quantity: qty,
          unit_cost: cost,
        };
      })
      .filter(Boolean) as { inventory_item_id: number; name: string; quantity: number; unit_cost: number }[];
    if (lines.length === 0) { setManualPoError('Add at least one valid line item.'); return; }
    setManualPoSaving(true); setManualPoError('');
    try {
      await createPurchase({
        supplier_id: Number(manualPoForm.supplier_id),
        purchase_date: manualPoForm.purchase_date,
        notes: manualPoForm.notes || undefined,
        items: lines,
      });
      showToast('Purchase order created.');
      setShowManualPo(false);
      void load();
    } catch (e) { setManualPoError((e as Error).message); }
    finally { setManualPoSaving(false); }
  };

  // CSV import
  const [showImport, setShowImport] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importDate, setImportDate] = useState(today());
  const [importNotes, setImportNotes] = useState('');
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState('');
  const csvInputRef = useRef<HTMLInputElement>(null);

  // Receipt upload
  const [receiptUploadId, setReceiptUploadId] = useState<number | null>(null);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [uploadingReceipt, setUploadingReceipt] = useState(false);
  const [receiptError, setReceiptError] = useState('');
  const receiptInputRef = useRef<HTMLInputElement>(null);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3500); };

  const openDetail = (po: Purchase) => {
    setDetail(po);
    const initial: Record<number, number> = {};
    (po.items ?? []).forEach((item) => { initial[item.id] = item.quantity - item.received_quantity; });
    setReceiveQtys(initial);
    setReceiveNotes('');
    setGstForm({
      is_input_tax_claimable: !!po.is_input_tax_claimable,
      supplier_tin: po.supplier_tin ?? po.supplier?.tin ?? '',
      supplier_invoice_no: po.supplier_invoice_no ?? '',
      supplier_invoice_date: po.supplier_invoice_date ?? '',
      amount_ex_gst: po.amount_excluding_gst_laar != null ? String(po.amount_excluding_gst_laar / 100) : '',
      gst_amount: po.gst_laar != null ? String(po.gst_laar / 100) : '',
      revenue_or_capital: (po.revenue_or_capital as 'revenue' | 'capital') ?? 'revenue',
    });
  };

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Inbound deep links (e.g. from Expenses / Purchase Requests)
  useEffect(() => {
    const fromUrl = searchParams.get('search') ?? '';
    if (fromUrl === debouncedSearch) return; // already in sync (we wrote the URL)
    setSearch(fromUrl);
    setDebouncedSearch(fromUrl.trim());
    autoOpenedFor.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- react to URL; compare against current debounced value
  }, [searchParams]);

  // Keep URL in sync with the active search
  useEffect(() => {
    const current = searchParams.get('search') ?? '';
    if (debouncedSearch === current) return;
    const next = new URLSearchParams(searchParams);
    if (debouncedSearch) next.set('search', debouncedSearch);
    else next.delete('search');
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only push when debounced value changes
  }, [debouncedSearch, setSearchParams]);

  const load = async () => {
    setLoading(true); setError('');
    try {
      const res = await fetchPurchases({
        status: statusFilter !== 'all' ? statusFilter : undefined,
        search: debouncedSearch || undefined,
      });
      const list = res.purchases?.data ?? [];
      setPurchases(list);
      if (debouncedSearch && autoOpenedFor.current !== debouncedSearch) {
        const needle = debouncedSearch.toLowerCase();
        const match = list.find((p) => p.purchase_number.toLowerCase() === needle)
          ?? (list.length === 1 ? list[0] : null);
        if (match) {
          openDetail(match);
          autoOpenedFor.current = debouncedSearch;
        }
      }
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  };

  const loadSuggestions = async () => {
    setSugLoading(true);
    try { setSuggestions(await getPurchaseSuggestions()); }
    catch (e) { setError((e as Error).message); }
    finally { setSugLoading(false); }
  };

  useEffect(() => { void load(); }, [statusFilter, debouncedSearch]);

  const handleApprove = async (id: number) => {
    try { await approvePurchase(id); void load(); }
    catch (e) { setError((e as Error).message); }
  };

  const handleCreatePoFromSuggest = async (group: PurchaseSuggestions['by_supplier'][number]) => {
    if (!group.supplier_id) { setError('Cannot create PO — no supplier assigned to this group.'); return; }
    setCreatingPoFor(group.supplier_id);
    try {
      await createPurchaseFromSuggest({
        supplier_id: group.supplier_id!,
        items: group.items.map((i) => ({ inventory_item_id: i.inventory_item_id, quantity: i.suggested_quantity, unit_cost: i.last_unit_cost ?? 0 })),
      });
      showToast('Purchase order created from suggestions.');
      setSuggestions(null);
      void load();
    } catch (e) { setError((e as Error).message); }
    finally { setCreatingPoFor(null); }
  };

  const handleReject = async () => {
    if (rejectId === null || !rejectReason.trim()) return;
    setActionLoading(true);
    try {
      await rejectPurchase(rejectId, rejectReason);
      setRejectId(null); setRejectReason('');
      showToast('Purchase order rejected.');
      void load();
    } catch (e) { setError((e as Error).message); }
    finally { setActionLoading(false); }
  };

  const handleReceive = async () => {
    if (!detail) return;
    setActionLoading(true);
    try {
      if (gstForm.is_input_tax_claimable) {
        const exLaar = gstForm.amount_ex_gst ? Math.round(parseFloat(gstForm.amount_ex_gst) * 100) : undefined;
        const gstLaar = gstForm.gst_amount ? Math.round(parseFloat(gstForm.gst_amount) * 100) : undefined;
        await updatePurchase(detail.id, {
          is_input_tax_claimable: true,
          is_tax_invoice_received: true,
          supplier_tin: gstForm.supplier_tin || undefined,
          supplier_invoice_no: gstForm.supplier_invoice_no || undefined,
          supplier_invoice_date: gstForm.supplier_invoice_date || undefined,
          amount_excluding_gst_laar: exLaar,
          gst_laar: gstLaar,
          gst_rate_bp: gstLaar ? 800 : undefined,
          revenue_or_capital: gstForm.revenue_or_capital,
        });
      }
      await receivePurchase(detail.id, {
        items: (detail.items ?? []).map((item) => ({
          purchase_item_id: item.id,
          received_quantity: receiveQtys[item.id] ?? 0,
        })),
        notes: receiveNotes || undefined,
      });
      setDetail(null);
      showToast('Stock received and recorded.');
      void load();
    } catch (e) { setError((e as Error).message); }
    finally { setActionLoading(false); }
  };

  const handleImportCsv = async () => {
    if (!importFile) return;
    setImporting(true); setImportError('');
    try {
      await importPurchaseCsv({ file: importFile, purchase_date: importDate, notes: importNotes || undefined });
      showToast('Purchase order imported from CSV.');
      setShowImport(false); setImportFile(null); setImportNotes('');
      void load();
    } catch (e) { setImportError((e as Error).message); }
    finally { setImporting(false); }
  };

  const handleUploadReceipt = async () => {
    if (!receiptUploadId || !receiptFile) return;
    setUploadingReceipt(true); setReceiptError('');
    try {
      await uploadPurchaseReceipt(receiptUploadId, receiptFile);
      showToast('Receipt uploaded successfully.');
      setReceiptUploadId(null); setReceiptFile(null);
    } catch (e) { setReceiptError((e as Error).message); }
    finally { setUploadingReceipt(false); }
  };

  return (
    <PageShell>
    <>
      <PageHeader section="Manage" title="Purchase Orders" subtitle="Manage procurement workflow" />
      {toast && (
        <div style={{ background: 'var(--color-success-bg)', color: 'var(--color-success-strong)', padding: '10px 14px', borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
          {toast}
        </div>
      )}
      {error && <ErrorMsg message={error} />}

      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <Select value={statusFilter} onChange={(v) => setStatus(v)} options={STATUS_OPTIONS} style={{ width: 180 }} />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search PO number or supplier…"
          style={{
            height: 36, minWidth: 220, padding: '0 12px',
            border: '1.5px solid var(--color-border)', borderRadius: 10,
            fontSize: 13, fontFamily: 'inherit', background: 'var(--color-surface)', color: 'var(--color-text)', outline: 'none',
          }}
        />
        <Btn variant="secondary" onClick={load}>↻ Refresh</Btn>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <Btn variant="secondary" onClick={() => void openManualPo()}>+ Create Manual PO</Btn>
          <Btn variant="secondary" onClick={() => setShowImport(true)}>⬆ Import CSV</Btn>
          <Btn onClick={loadSuggestions} disabled={sugLoading}>
            {sugLoading ? 'Loading…' : '💡 Auto-Suggest POs'}
          </Btn>
        </div>
      </div>

      {/* Suggestions panel */}
      {suggestions && (
        <Card style={{ marginBottom: 20, background: '#fffbeb', border: '1px solid #fef08a' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
            <p style={{ fontWeight: 700, color: 'var(--color-warning-strong)', margin: 0, fontSize: 14 }}>
              Low-Stock Suggestions — {(suggestions.items ?? []).length} items below reorder point
              <span style={{ display: 'block', fontWeight: 500, fontSize: 12, color: '#a16207', marginTop: 4 }}>
                Qty uses usage cover when higher than the reorder formula. Preferred supplier wins over cheapest price.
              </span>
            </p>
            <Btn small variant="ghost" onClick={() => setSuggestions(null)}>Dismiss</Btn>
          </div>
          {(suggestions.by_supplier ?? []).length === 0 ? (
            <p style={{ color: 'var(--color-text-secondary)', fontSize: 13, margin: 0 }}>All items are above reorder points. No purchases needed.</p>
          ) : (
            (suggestions.by_supplier ?? []).map((group) => (
              <div key={group.supplier_id ?? 'unknown'} style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, gap: 12, flexWrap: 'wrap' }}>
                  <p style={{ fontWeight: 700, color: 'var(--color-text)', fontSize: 13, margin: 0 }}>
                    {group.supplier_name} — Est. MVR {parseFloat(String(group.estimated_total ?? 0)).toFixed(2)}
                  </p>
                  {group.supplier_id && (
                    <Btn
                      small
                      onClick={() => void handleCreatePoFromSuggest(group)}
                      disabled={creatingPoFor === group.supplier_id}
                    >
                      {creatingPoFor === group.supplier_id ? 'Creating…' : '+ Create PO'}
                    </Btn>
                  )}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {group.items.map((item) => (
                    <div key={item.inventory_item_id} style={{ background: 'var(--color-surface)', border: '1px solid #fde68a', borderRadius: 10, padding: '8px 14px', fontSize: 13 }}>
                      <span style={{ fontWeight: 700, color: 'var(--color-text)' }}>{item.name}</span>
                      <span style={{ color: 'var(--color-danger)', margin: '0 6px' }}>Stock: {parseFloat(String(item.current_stock ?? 0)).toFixed(2)}</span>
                      <span style={{ color: 'var(--color-success-strong)' }}>Order: {item.suggested_quantity} {item.unit}</span>
                      {item.suggestion_reason && (
                        <span style={{ color: 'var(--color-warning-strong)', marginLeft: 6, fontSize: 11 }}>
                          ({item.suggestion_reason === 'usage_cover' ? 'usage' : item.suggestion_reason === 'reorder_quantity' ? 'reorder qty' : 'ROP'})
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </Card>
      )}

      {/* Purchase Orders table */}
      {loading ? <Spinner /> : purchases.length === 0 ? (
        <Card><EmptyState message="No purchase orders found." /></Card>
      ) : (
        <TableCard>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr>
                {['PO Number', 'Supplier', 'Status', 'Total', 'PO Date', 'Exp. Delivery', 'Items', 'Actions'].map((h) => (
                  <th key={h} style={TH}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {purchases.map((po) => (
                <tr key={po.id}>
                  <td style={{ ...TD, fontWeight: 700 }}>
                    <button
                      onClick={() => openDetail(po)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700, color: 'var(--color-primary)', fontSize: 14, fontFamily: 'inherit', padding: 0 }}
                    >
                      {po.purchase_number}
                    </button>
                  </td>
                  <td style={{ ...TD, color: 'var(--color-text-secondary)' }}>{po.supplier?.name ?? '—'}</td>
                  <td style={TD}>
                    <Badge label={po.status.toUpperCase()} color={STATUS_COLOR[po.status] ?? 'gray'} />
                  </td>
                  <td style={{ ...TD, fontWeight: 700, color: 'var(--color-primary)' }}>MVR {parseFloat(String(po.total ?? po.subtotal ?? 0)).toFixed(2)}</td>
                  <td style={{ ...TD, color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>{po.purchase_date}</td>
                  <td style={{ ...TD, color: po.expected_delivery_date ? 'var(--color-text-secondary)' : 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
                    {po.expected_delivery_date ?? '—'}
                  </td>
                  <td style={{ ...TD, color: 'var(--color-text-secondary)', textAlign: 'center' }}>{po.items?.length ?? 0}</td>
                  <td style={TD}>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {po.status === 'draft' && (
                        <Btn small onClick={() => void handleApprove(po.id)}>Approve</Btn>
                      )}
                      {['ordered', 'partial'].includes(po.status) && (
                        <Btn small onClick={() => openDetail(po)}>Receive</Btn>
                      )}
                      {['draft', 'ordered'].includes(po.status) && (
                        <Btn small variant="danger" onClick={() => { setRejectId(po.id); setRejectReason(''); }}>Reject</Btn>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableCard>
      )}

      {/* Detail / Receive modal */}
      {detail && (
        <Modal title={detail.purchase_number} onClose={() => setDetail(null)} maxWidth={580}>
          <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 16 }}>
            Supplier: <strong style={{ color: 'var(--color-text)' }}>{detail.supplier?.name ?? '—'}</strong>
            {' · '}Status: <strong style={{ color: 'var(--color-text)' }}>{detail.status}</strong>
            {' · '}Total: <strong style={{ color: 'var(--color-primary)' }}>MVR {parseFloat(String(detail.total ?? 0)).toFixed(2)}</strong>
          </p>
          <TableCard>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  {['Item', 'Ordered', 'Already Rcvd',
                    ...(['ordered', 'partial'].includes(detail.status) ? ['Receiving Now'] : []),
                    'Status',
                  ].map((h) => (
                    <th key={h} style={TH}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {detail.items?.map((item) => (
                  <tr key={item.id}>
                    <td style={TD}>{item.inventory_item?.name ?? '—'}</td>
                    <td style={{ ...TD, textAlign: 'center' }}>{item.quantity}</td>
                    <td style={{
                      ...TD, textAlign: 'center', fontWeight: 700,
                      color: item.received_quantity >= item.quantity ? 'var(--color-success)' : 'var(--color-warning)',
                    }}>
                      {item.received_quantity}
                    </td>
                    {['ordered', 'partial'].includes(detail.status) && (
                      <td style={{ ...TD, textAlign: 'center' }}>
                        <input
                          type="number"
                          min={0}
                          max={item.quantity - item.received_quantity}
                          value={receiveQtys[item.id] ?? 0}
                          onChange={(e) => { const v = parseFloat(e.target.value); setReceiveQtys((q) => ({ ...q, [item.id]: isNaN(v) ? 0 : Math.max(0, v) })); }}
                          style={{ width: 70, height: 30, padding: '0 6px', border: '1.5px solid var(--color-border)', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', textAlign: 'center' }}
                        />
                      </td>
                    )}
                    <td style={TD}>
                      <Badge
                        label={item.receive_status}
                        color={item.receive_status === 'complete' ? 'green' : item.receive_status === 'partial' ? 'yellow' : 'gray'}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableCard>

          {['ordered', 'partial'].includes(detail.status) && (
            <Card style={{ padding: 12, marginTop: 12 }} data-testid="receive-scan">
              <form
                onSubmit={(e) => { e.preventDefault(); if (scanCode.trim()) applyScan(scanCode); }}
                style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}
              >
                <input
                  value={scanCode}
                  onChange={(e) => setScanCode(e.target.value)}
                  placeholder="Scan a packet, or type its barcode, then Enter"
                  aria-label="Scan a packet barcode"
                  inputMode="numeric"
                  autoComplete="off"
                  style={{ flex: '1 1 240px', height: 40, padding: '0 12px', border: '1.5px solid var(--color-border)', borderRadius: 10, fontSize: 14, fontFamily: 'inherit' }}
                />
                <Btn variant="secondary" onClick={() => setScanCamera(true)} aria-label="Scan with the camera" title="Scan with the camera">📷 Camera</Btn>
                {scanMsg && <span role="status" style={{ fontSize: 13, color: 'var(--color-text-secondary)', flexBasis: '100%' }}>{scanMsg}</span>}
              </form>
              {scanCamera && (
                <ScanSheet
                  title="Scan the packet"
                  hint="Each scan counts one more of that line as received. Scan again for the next packet."
                  onScan={(code) => { setScanCamera(false); applyScan(code); }}
                  onClose={() => setScanCamera(false)}
                />
              )}
            </Card>
          )}

          {['ordered', 'partial'].includes(detail.status) && (
            <>
            <div style={{ marginTop: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 4 }}>Notes (optional)</label>
              <textarea
                rows={2}
                value={receiveNotes}
                onChange={(e) => setReceiveNotes(e.target.value)}
                style={{ width: '100%', padding: '8px 10px', border: '1.5px solid var(--color-border)', borderRadius: 10, fontSize: 13, fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' }}
              />
            </div>
            <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--color-border)' }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-secondary)', margin: '0 0 10px' }}>Input GST (optional)</p>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, marginBottom: 10 }}>
                <input type="checkbox" checked={gstForm.is_input_tax_claimable} onChange={(e) => setGstForm((f) => ({ ...f, is_input_tax_claimable: e.target.checked }))} />
                Claimable input tax on this purchase
              </label>
              {gstForm.is_input_tax_claimable && (
                <div style={{ display: 'grid', gap: 10 }}>
                  <input placeholder="Supplier TIN" value={gstForm.supplier_tin} onChange={(e) => setGstForm((f) => ({ ...f, supplier_tin: e.target.value }))} style={{ width: '100%', padding: '8px 10px', borderRadius: 10, border: '1.5px solid var(--color-border)', fontSize: 13 }} />
                  <div className="form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <input placeholder="Supplier invoice no." value={gstForm.supplier_invoice_no} onChange={(e) => setGstForm((f) => ({ ...f, supplier_invoice_no: e.target.value }))} style={{ padding: '8px 10px', borderRadius: 10, border: '1.5px solid var(--color-border)', fontSize: 13 }} />
                    <input type="date" value={gstForm.supplier_invoice_date} onChange={(e) => setGstForm((f) => ({ ...f, supplier_invoice_date: e.target.value }))} style={{ padding: '8px 10px', borderRadius: 10, border: '1.5px solid var(--color-border)', fontSize: 13 }} />
                  </div>
                  <div className="form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <input type="number" placeholder="Amount ex-GST (MVR)" value={gstForm.amount_ex_gst} onChange={(e) => setGstForm((f) => ({ ...f, amount_ex_gst: e.target.value }))} style={{ padding: '8px 10px', borderRadius: 10, border: '1.5px solid var(--color-border)', fontSize: 13 }} />
                    <input type="number" placeholder="GST amount (MVR)" value={gstForm.gst_amount} onChange={(e) => setGstForm((f) => ({ ...f, gst_amount: e.target.value }))} style={{ padding: '8px 10px', borderRadius: 10, border: '1.5px solid var(--color-border)', fontSize: 13 }} />
                  </div>
                </div>
              )}
            </div>
            </>
          )}

          <ModalActions>
            <Btn variant="secondary" onClick={() => setDetail(null)}>Close</Btn>
            <Btn variant="secondary" onClick={() => { setReceiptUploadId(detail.id); setReceiptFile(null); }}>📎 Upload Receipt</Btn>
            {['ordered', 'partial'].includes(detail.status) && (
              <Btn onClick={() => void handleReceive()} disabled={actionLoading}>
                {actionLoading ? 'Saving…' : '✓ Confirm Receipt'}
              </Btn>
            )}
          </ModalActions>
        </Modal>
      )}

      {/* Receipt upload modal */}
      {receiptUploadId !== null && (
        <Modal title="Upload Receipt" onClose={() => setReceiptUploadId(null)} maxWidth={400}>
          {receiptError && <p style={{ color: 'var(--color-danger-strong)', fontSize: 13, marginBottom: 8 }}>{receiptError}</p>}
          <input ref={receiptInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png" style={{ display: 'none' }}
            onChange={(e) => setReceiptFile(e.target.files?.[0] ?? null)} />
          <div
            onClick={() => receiptInputRef.current?.click()}
            style={{ border: '2px dashed var(--color-border)', borderRadius: 12, padding: '32px 16px', textAlign: 'center', cursor: 'pointer', marginBottom: 16 }}
          >
            {receiptFile ? (
              <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text)', fontWeight: 600 }}>{receiptFile.name}</p>
            ) : (
              <>
                <p style={{ margin: '0 0 4px', fontSize: 22 }}>📎</p>
                <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-muted)' }}>Click to select a receipt (PDF, JPG, PNG)</p>
              </>
            )}
          </div>
          <ModalActions>
            <Btn variant="ghost" onClick={() => setReceiptUploadId(null)}>Cancel</Btn>
            <Btn onClick={() => void handleUploadReceipt()} disabled={!receiptFile || uploadingReceipt}>
              {uploadingReceipt ? 'Uploading…' : 'Upload'}
            </Btn>
          </ModalActions>
        </Modal>
      )}

      {/* CSV import modal */}
      {showImport && (
        <Modal title="Import Purchase from CSV" onClose={() => setShowImport(false)} maxWidth={480}>
          {importError && <p style={{ color: 'var(--color-danger-strong)', fontSize: 13, marginBottom: 8 }}>{importError}</p>}
          <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 12 }}>
            CSV must have columns: <strong>name</strong>, <strong>quantity</strong>, <strong>unit_cost</strong>. Optional: <strong>inventory_item_id</strong>.
          </p>
          <input ref={csvInputRef} type="file" accept=".csv" style={{ display: 'none' }}
            onChange={(e) => setImportFile(e.target.files?.[0] ?? null)} />
          <div
            onClick={() => csvInputRef.current?.click()}
            style={{ border: '2px dashed var(--color-border)', borderRadius: 12, padding: '28px 16px', textAlign: 'center', cursor: 'pointer', marginBottom: 16 }}
          >
            {importFile ? (
              <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text)', fontWeight: 600 }}>{importFile.name}</p>
            ) : (
              <>
                <p style={{ margin: '0 0 4px', fontSize: 22 }}>📂</p>
                <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-muted)' }}>Click to select a CSV file</p>
              </>
            )}
          </div>
          <div className="form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 4 }}>Purchase Date</label>
              <input type="date" value={importDate} onChange={(e) => setImportDate(e.target.value)}
                style={{ width: '100%', padding: '8px 10px', border: '1.5px solid var(--color-border)', borderRadius: 10, fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 4 }}>Notes (optional)</label>
              <input value={importNotes} onChange={(e) => setImportNotes(e.target.value)} placeholder="e.g. Weekly stock"
                style={{ width: '100%', padding: '8px 10px', border: '1.5px solid var(--color-border)', borderRadius: 10, fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box' }} />
            </div>
          </div>
          <ModalActions>
            <Btn variant="ghost" onClick={() => setShowImport(false)}>Cancel</Btn>
            <Btn onClick={() => void handleImportCsv()} disabled={!importFile || importing}>
              {importing ? 'Importing…' : 'Import'}
            </Btn>
          </ModalActions>
        </Modal>
      )}

      {/* Manual PO modal */}
      {showManualPo && (
        <Modal title="Create Manual Purchase Order" onClose={() => setShowManualPo(false)} maxWidth={560}>
          {manualPoError && <p style={{ color: 'var(--color-danger-strong)', fontSize: 13, marginBottom: 8 }}>{manualPoError}</p>}
          <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 4 }}>Supplier *</label>
          <select value={manualPoForm.supplier_id} onChange={(e) => setManualPoForm((f) => ({ ...f, supplier_id: e.target.value }))}
            style={{ width: '100%', padding: '8px 10px', borderRadius: 10, border: '1.5px solid var(--color-border)', fontSize: 13, fontFamily: 'inherit', marginBottom: 12 }}>
            <option value="">Select supplier…</option>
            {manualSuppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 4 }}>Purchase date *</label>
          <input type="date" value={manualPoForm.purchase_date} onChange={(e) => setManualPoForm((f) => ({ ...f, purchase_date: e.target.value }))}
            style={{ width: '100%', padding: '8px 10px', borderRadius: 10, border: '1.5px solid var(--color-border)', fontSize: 13, fontFamily: 'inherit', marginBottom: 12, boxSizing: 'border-box' }} />
          <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--color-text)', margin: '0 0 8px' }}>Line items</p>
          {manualPoForm.lines.map((line, idx) => (
            <div key={idx} style={{ border: '1px solid var(--color-border)', borderRadius: 10, padding: 12, marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-secondary)' }}>Item {idx + 1}</span>
                {manualPoForm.lines.length > 1 && (
                  <Btn small variant="ghost" onClick={() => setManualPoForm((f) => ({ ...f, lines: f.lines.filter((_, i) => i !== idx) }))}>Remove</Btn>
                )}
              </div>
              <ItemSearch
                kind="inventory"
                value={line.selection}
                onChange={(sel) => {
                  setManualPoForm((f) => ({
                    ...f,
                    lines: f.lines.map((l, i) => i === idx ? {
                      ...l,
                      selection: sel,
                      unit_cost: sel?.item.cost_per_unit != null ? String(sel.item.cost_per_unit) : l.unit_cost,
                    } : l),
                  }));
                }}
                placeholder="Search inventory item…"
              />
              <div data-responsive-grid style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
                <input type="number" min="0.001" step="any" placeholder="Qty" value={line.quantity}
                  onChange={(e) => setManualPoForm((f) => ({ ...f, lines: f.lines.map((l, i) => i === idx ? { ...l, quantity: e.target.value } : l) }))}
                  style={{ padding: '8px 10px', borderRadius: 10, border: '1.5px solid var(--color-border)', fontSize: 13, fontFamily: 'inherit' }} />
                <input type="number" min="0" step="0.01" placeholder="Unit cost" value={line.unit_cost}
                  onChange={(e) => setManualPoForm((f) => ({ ...f, lines: f.lines.map((l, i) => i === idx ? { ...l, unit_cost: e.target.value } : l) }))}
                  style={{ padding: '8px 10px', borderRadius: 10, border: '1.5px solid var(--color-border)', fontSize: 13, fontFamily: 'inherit' }} />
              </div>
            </div>
          ))}
          <Btn small variant="secondary" onClick={() => setManualPoForm((f) => ({ ...f, lines: [...f.lines, blankManualLine()] }))} style={{ marginBottom: 12 }}>
            + Add line
          </Btn>
          <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 4 }}>Notes (optional)</label>
          <textarea rows={2} value={manualPoForm.notes} onChange={(e) => setManualPoForm((f) => ({ ...f, notes: e.target.value }))}
            style={{ width: '100%', padding: '8px 10px', border: '1.5px solid var(--color-border)', borderRadius: 10, fontSize: 13, fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box', marginBottom: 16 }} />
          <ModalActions>
            <Btn variant="ghost" onClick={() => setShowManualPo(false)}>Cancel</Btn>
            <Btn onClick={() => void handleCreateManualPo()} disabled={manualPoSaving}>{manualPoSaving ? 'Creating…' : 'Create PO'}</Btn>
          </ModalActions>
        </Modal>
      )}

      {/* Reject modal */}
      {rejectId !== null && (
        <Modal title="Reject Purchase Order" onClose={() => setRejectId(null)} maxWidth={420}>
          <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 16 }}>
            Please provide a reason for rejecting this purchase order.
          </p>
          <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 4 }}>Reason *</label>
          <textarea
            rows={3}
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="e.g. Price too high, wrong items, supplier issue…"
            style={{ width: '100%', padding: '8px 10px', border: '1.5px solid var(--color-border)', borderRadius: 10, fontSize: 13, fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box', marginBottom: 4 }}
          />
          <ModalActions>
            <Btn variant="ghost" onClick={() => setRejectId(null)}>Cancel</Btn>
            <Btn variant="danger" onClick={() => void handleReject()} disabled={actionLoading || !rejectReason.trim()}>
              {actionLoading ? 'Rejecting…' : 'Reject Order'}
            </Btn>
          </ModalActions>
        </Modal>
      )}
    </>

    </PageShell>
  );
}
