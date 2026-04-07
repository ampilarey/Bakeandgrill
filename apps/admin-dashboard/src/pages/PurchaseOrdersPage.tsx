import { useEffect, useRef, useState } from 'react';
import { approvePurchase, rejectPurchase, receivePurchase, getPurchaseSuggestions, createPurchaseFromSuggest, fetchPurchases, importPurchaseCsv, uploadPurchaseReceipt, type Purchase, type PurchaseSuggestions } from '../api';
import { Badge, Btn, Card, EmptyState, ErrorMsg, Modal, ModalActions, PageHeader, Select, Spinner, TableCard, TD, TH } from '../components/Layout';
import { usePageTitle } from '../hooks/usePageTitle';

const STATUS_COLOR: Record<string, string> = {
  draft:    'gray',
  ordered:  'blue',
  partial:  'yellow',
  received: 'green',
  cancelled:'red',
};

const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'draft',     label: 'Draft'     },
  { value: 'ordered',   label: 'Ordered'   },
  { value: 'partial',   label: 'Partial'   },
  { value: 'received',  label: 'Received'  },
  { value: 'cancelled', label: 'Cancelled' },
];

export function PurchaseOrdersPage() {
  usePageTitle('Purchase Orders');
  const [purchases, setPurchases]         = useState<Purchase[]>([]);
  const [loading, setLoading]             = useState(true);
  const [error, setError]                 = useState('');
  const [suggestions, setSuggestions]     = useState<PurchaseSuggestions | null>(null);
  const [sugLoading, setSugLoading]       = useState(false);
  const [statusFilter, setStatus]         = useState('');
  const [detail, setDetail]               = useState<Purchase | null>(null);
  const [rejectId, setRejectId]           = useState<number | null>(null);
  const [rejectReason, setRejectReason]   = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [toast, setToast]                 = useState('');
  // per-item receive quantities (purchase_item_id → qty)
  const [receiveQtys, setReceiveQtys]     = useState<Record<number, number>>({});
  const [receiveNotes, setReceiveNotes]   = useState('');

  const [creatingPoFor, setCreatingPoFor] = useState<number | null>(null);

  // CSV import
  const [showImport, setShowImport] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importDate, setImportDate] = useState(new Date().toISOString().slice(0, 10));
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

  const load = async () => {
    setLoading(true); setError('');
    try {
      const res = await fetchPurchases({ status: statusFilter || undefined });
      setPurchases(res.purchases?.data ?? []);
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  };

  const loadSuggestions = async () => {
    setSugLoading(true);
    try { setSuggestions(await getPurchaseSuggestions()); }
    catch (e) { setError((e as Error).message); }
    finally { setSugLoading(false); }
  };

  useEffect(() => { void load(); }, [statusFilter]);

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

  const openDetail = (po: Purchase) => {
    setDetail(po);
    const initial: Record<number, number> = {};
    (po.items ?? []).forEach((item) => { initial[item.id] = item.quantity - item.received_quantity; });
    setReceiveQtys(initial);
    setReceiveNotes('');
  };

  const handleReceive = async () => {
    if (!detail) return;
    setActionLoading(true);
    try {
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
    <>
      <PageHeader title="Purchase Orders" subtitle="Manage procurement workflow" />
      {toast && (
        <div style={{ background: '#DCFCE7', color: '#166534', padding: '10px 14px', borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
          {toast}
        </div>
      )}
      {error && <ErrorMsg message={error} />}

      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <Select value={statusFilter} onChange={(v) => setStatus(v)} options={STATUS_OPTIONS} style={{ width: 180 }} />
        <Btn variant="secondary" onClick={load}>↻ Refresh</Btn>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
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
            <p style={{ fontWeight: 700, color: '#92400e', margin: 0, fontSize: 14 }}>
              Low-Stock Suggestions — {suggestions.items.length} items below reorder point
            </p>
            <Btn small variant="ghost" onClick={() => setSuggestions(null)}>Dismiss</Btn>
          </div>
          {suggestions.by_supplier.length === 0 ? (
            <p style={{ color: '#6B5D4F', fontSize: 13, margin: 0 }}>All items are above reorder points. No purchases needed.</p>
          ) : (
            suggestions.by_supplier.map((group) => (
              <div key={group.supplier_id ?? 'unknown'} style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, gap: 12, flexWrap: 'wrap' }}>
                  <p style={{ fontWeight: 700, color: '#1C1408', fontSize: 13, margin: 0 }}>
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
                    <div key={item.inventory_item_id} style={{ background: '#fff', border: '1px solid #fde68a', borderRadius: 10, padding: '8px 14px', fontSize: 13 }}>
                      <span style={{ fontWeight: 700, color: '#1C1408' }}>{item.name}</span>
                      <span style={{ color: '#ef4444', margin: '0 6px' }}>Stock: {parseFloat(String(item.current_stock ?? 0)).toFixed(2)}</span>
                      <span style={{ color: '#16a34a' }}>Order: {item.suggested_quantity} {item.unit}</span>
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
                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700, color: '#D4813A', fontSize: 14, fontFamily: 'inherit', padding: 0 }}
                    >
                      {po.purchase_number}
                    </button>
                  </td>
                  <td style={{ ...TD, color: '#6B5D4F' }}>{po.supplier?.name ?? '—'}</td>
                  <td style={TD}>
                    <Badge label={po.status.toUpperCase()} color={STATUS_COLOR[po.status] ?? 'gray'} />
                  </td>
                  <td style={{ ...TD, fontWeight: 700, color: '#D4813A' }}>MVR {parseFloat(String(po.total ?? po.subtotal ?? 0)).toFixed(2)}</td>
                  <td style={{ ...TD, color: '#6B5D4F', whiteSpace: 'nowrap' }}>{po.purchase_date}</td>
                  <td style={{ ...TD, color: po.expected_delivery_date ? '#6B5D4F' : '#9C8E7E', whiteSpace: 'nowrap' }}>
                    {po.expected_delivery_date ?? '—'}
                  </td>
                  <td style={{ ...TD, color: '#6B5D4F', textAlign: 'center' }}>{po.items?.length ?? 0}</td>
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
          <p style={{ fontSize: 13, color: '#6B5D4F', marginBottom: 16 }}>
            Supplier: <strong style={{ color: '#1C1408' }}>{detail.supplier?.name ?? '—'}</strong>
            {' · '}Status: <strong style={{ color: '#1C1408' }}>{detail.status}</strong>
            {' · '}Total: <strong style={{ color: '#D4813A' }}>MVR {parseFloat(String(detail.total ?? 0)).toFixed(2)}</strong>
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
                      color: item.received_quantity >= item.quantity ? '#22c55e' : '#f59e0b',
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
                          onChange={(e) => setReceiveQtys((q) => ({ ...q, [item.id]: Number(e.target.value) }))}
                          style={{ width: 70, height: 30, padding: '0 6px', border: '1.5px solid #E8E0D8', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', textAlign: 'center' }}
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
            <div style={{ marginTop: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#6B5D4F', display: 'block', marginBottom: 4 }}>Notes (optional)</label>
              <textarea
                rows={2}
                value={receiveNotes}
                onChange={(e) => setReceiveNotes(e.target.value)}
                style={{ width: '100%', padding: '8px 10px', border: '1.5px solid #E8E0D8', borderRadius: 10, fontSize: 13, fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' }}
              />
            </div>
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
          {receiptError && <p style={{ color: '#dc2626', fontSize: 13, marginBottom: 8 }}>{receiptError}</p>}
          <input ref={receiptInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png" style={{ display: 'none' }}
            onChange={(e) => setReceiptFile(e.target.files?.[0] ?? null)} />
          <div
            onClick={() => receiptInputRef.current?.click()}
            style={{ border: '2px dashed #E8E0D8', borderRadius: 12, padding: '32px 16px', textAlign: 'center', cursor: 'pointer', marginBottom: 16 }}
          >
            {receiptFile ? (
              <p style={{ margin: 0, fontSize: 13, color: '#1C1408', fontWeight: 600 }}>{receiptFile.name}</p>
            ) : (
              <>
                <p style={{ margin: '0 0 4px', fontSize: 22 }}>📎</p>
                <p style={{ margin: 0, fontSize: 13, color: '#9C8E7E' }}>Click to select a receipt (PDF, JPG, PNG)</p>
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
          {importError && <p style={{ color: '#dc2626', fontSize: 13, marginBottom: 8 }}>{importError}</p>}
          <p style={{ fontSize: 12, color: '#6B5D4F', marginBottom: 12 }}>
            CSV must have columns: <strong>name</strong>, <strong>quantity</strong>, <strong>unit_cost</strong>. Optional: <strong>inventory_item_id</strong>.
          </p>
          <input ref={csvInputRef} type="file" accept=".csv" style={{ display: 'none' }}
            onChange={(e) => setImportFile(e.target.files?.[0] ?? null)} />
          <div
            onClick={() => csvInputRef.current?.click()}
            style={{ border: '2px dashed #E8E0D8', borderRadius: 12, padding: '28px 16px', textAlign: 'center', cursor: 'pointer', marginBottom: 16 }}
          >
            {importFile ? (
              <p style={{ margin: 0, fontSize: 13, color: '#1C1408', fontWeight: 600 }}>{importFile.name}</p>
            ) : (
              <>
                <p style={{ margin: '0 0 4px', fontSize: 22 }}>📂</p>
                <p style={{ margin: 0, fontSize: 13, color: '#9C8E7E' }}>Click to select a CSV file</p>
              </>
            )}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#6B5D4F', display: 'block', marginBottom: 4 }}>Purchase Date</label>
              <input type="date" value={importDate} onChange={(e) => setImportDate(e.target.value)}
                style={{ width: '100%', padding: '8px 10px', border: '1.5px solid #E8E0D8', borderRadius: 10, fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#6B5D4F', display: 'block', marginBottom: 4 }}>Notes (optional)</label>
              <input value={importNotes} onChange={(e) => setImportNotes(e.target.value)} placeholder="e.g. Weekly stock"
                style={{ width: '100%', padding: '8px 10px', border: '1.5px solid #E8E0D8', borderRadius: 10, fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box' }} />
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

      {/* Reject modal */}
      {rejectId !== null && (
        <Modal title="Reject Purchase Order" onClose={() => setRejectId(null)} maxWidth={420}>
          <p style={{ fontSize: 13, color: '#6B5D4F', marginBottom: 16 }}>
            Please provide a reason for rejecting this purchase order.
          </p>
          <label style={{ fontSize: 12, fontWeight: 700, color: '#6B5D4F', display: 'block', marginBottom: 4 }}>Reason *</label>
          <textarea
            rows={3}
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="e.g. Price too high, wrong items, supplier issue…"
            style={{ width: '100%', padding: '8px 10px', border: '1.5px solid #E8E0D8', borderRadius: 10, fontSize: 13, fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box', marginBottom: 4 }}
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
  );
}
