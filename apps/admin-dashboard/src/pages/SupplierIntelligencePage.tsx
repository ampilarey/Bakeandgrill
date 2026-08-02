import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  getSupplierPerformance, rateSupplier,
  getSupplierRatings, getSupplierPerformanceSingle, refreshSupplierCache,
  getSupplierPriceHistory, getPriceComparison,
  fetchSuppliers, createSupplier, updateSupplier, deleteSupplier,
  type SupplierPerf, type SupplierRating, type PriceHistory, type Supplier,
} from '../api';
import { Btn, Card, EmptyState, ErrorMsg, Modal, ModalActions, PageHeader, PageShell, Spinner, TableCard, TD, TH } from '../components/Layout';
import { ItemSearch, type InventoryItemSelection } from '../components/ItemSearch';
import { usePageTitle } from '../hooks/usePageTitle';

function Stars({ rating, max = 5 }: { rating: number | null; max?: number }) {
  if (rating === null) return <span style={{ color: 'var(--color-text-muted)', fontSize: 12 }}>Not rated</span>;
  return (
    <span style={{ fontSize: 13 }}>
      <span style={{ color: 'var(--color-warning)' }}>{'★'.repeat(Math.round(rating))}</span>
      <span style={{ color: 'var(--color-border)' }}>{'★'.repeat(max - Math.round(rating))}</span>
      <span style={{ color: 'var(--color-text-muted)', marginLeft: 6, fontSize: 12 }}>{parseFloat(String(rating ?? 0)).toFixed(1)}</span>
    </span>
  );
}

type ScoreField = 'quality_score' | 'delivery_score' | 'accuracy_score' | 'price_score';

type DrillDown = { supplierId: number; supplierName: string };

export function SupplierIntelligencePage() {
  usePageTitle('Supplier Intelligence');
  const [perfs, setPerfs]       = useState<SupplierPerf[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [rating, setRating]     = useState<{ supplierId: number; supplierName: string } | null>(null);
  const [rateForm, setRateForm] = useState({ quality_score: 3, delivery_score: 3, accuracy_score: 3, price_score: 3, notes: '' });
  const [saving, setSaving]     = useState(false);

  // Drill-down state
  // Global price comparison (not per-supplier)
  const [showCompare, setShowCompare]   = useState(false);
  const [compareItem, setCompareItem]   = useState<InventoryItemSelection | null>(null);
  const [compareData, setCompareData]   = useState<{ inventory_item_id: number; prices: { supplier_id: number; supplier_name: string; unit_price: number; unit: string; recorded_at: string }[]; cheapest: { supplier_id: number; supplier_name: string; unit_price: number } | null } | null>(null);
  const [compareLoading, setCompareLoading] = useState(false);

  const [drill, setDrill]               = useState<DrillDown | null>(null);
  const [drillTab, setDrillTab]         = useState<'ratings' | 'prices'>('ratings');
  const [drillRatings, setDrillRatings] = useState<SupplierRating[]>([]);
  const [drillLoading, setDrillLoading] = useState(false);
  const [drillRefreshing, setDrillRefreshing] = useState(false);
  // Price history
  const [priceItem, setPriceItem]       = useState<InventoryItemSelection | null>(null);
  const [priceHistory, setPriceHistory] = useState<PriceHistory[]>([]);
  const [priceLoading, setPriceLoading] = useState(false);

  // Suppliers CRUD
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [suppliersLoading, setSuppliersLoading] = useState(false);
  const [supplierModal, setSupplierModal] = useState<Supplier | 'new' | null>(null);
  const [supplierForm, setSupplierForm] = useState({ name: '', contact_name: '', phone: '', email: '' });
  const [supplierSaving, setSupplierSaving] = useState(false);
  const [supplierFormError, setSupplierFormError] = useState('');

  const loadSuppliers = async () => {
    setSuppliersLoading(true);
    try {
      const res = await fetchSuppliers({ active_only: false });
      setSuppliers(res.data ?? []);
    } catch (e) { setError((e as Error).message); }
    finally { setSuppliersLoading(false); }
  };

  const openSupplierModal = (sup?: Supplier) => {
    setSupplierModal(sup ?? 'new');
    setSupplierForm({
      name: sup?.name ?? '',
      contact_name: sup?.contact_name ?? '',
      phone: sup?.phone ?? '',
      email: sup?.email ?? '',
    });
    setSupplierFormError('');
  };

  const handleSaveSupplier = async () => {
    if (!supplierForm.name.trim()) { setSupplierFormError('Name is required.'); return; }
    setSupplierSaving(true); setSupplierFormError('');
    try {
      const payload = {
        name: supplierForm.name.trim(),
        contact_name: supplierForm.contact_name.trim() || undefined,
        phone: supplierForm.phone.trim() || undefined,
        email: supplierForm.email.trim() || undefined,
      };
      if (supplierModal && supplierModal !== 'new') {
        await updateSupplier(supplierModal.id, payload);
      } else {
        await createSupplier(payload);
      }
      setSupplierModal(null);
      void loadSuppliers();
      void load();
    } catch (e) { setSupplierFormError((e as Error).message); }
    finally { setSupplierSaving(false); }
  };

  const handleDeleteSupplier = async (id: number) => {
    if (!window.confirm('Delete this supplier? This cannot be undone.')) return;
    try {
      await deleteSupplier(id);
      void loadSuppliers();
      void load();
    } catch (e) { setError((e as Error).message); }
  };

  const load = async () => {
    setLoading(true); setError('');
    try { setPerfs((await getSupplierPerformance()).suppliers); }
    catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); void loadSuppliers(); }, []);

  const openCompare = async (item: InventoryItemSelection | null) => {
    setCompareItem(item);
    setCompareData(null);
    if (!item) return;
    setCompareLoading(true);
    try {
      const res = await getPriceComparison(item.id);
      setCompareData(res);
    } catch (e) { setError((e as Error).message); }
    finally { setCompareLoading(false); }
  };

  const openDrill = async (sup: SupplierPerf) => {
    setDrill({ supplierId: sup.supplier_id, supplierName: sup.supplier_name });
    setDrillTab('ratings');
    setDrillRatings([]);
    setPriceHistory([]);
    setPriceItem(null);
    setDrillLoading(true);
    try {
      const ratingsRes = await getSupplierRatings(sup.supplier_id);
      setDrillRatings(ratingsRes.data);
    } catch (e) { setError((e as Error).message); }
    finally { setDrillLoading(false); }
  };

  const handleRefreshCache = async () => {
    if (!drill) return;
    setDrillRefreshing(true);
    try {
      await refreshSupplierCache(drill.supplierId);
      const res = await getSupplierPerformanceSingle(drill.supplierId);
      setPerfs((prev) => prev.map((p) =>
        p.supplier_id === drill.supplierId
          ? { ...p, avg_quality: res.avg_quality, avg_delivery: res.avg_delivery, total_spend: res.total_spend, purchase_count: res.purchase_count }
          : p,
      ));
    } catch (e) { setError((e as Error).message); }
    finally { setDrillRefreshing(false); }
  };

  const loadPriceHistory = async (item: InventoryItemSelection | null) => {
    setPriceItem(item);
    setPriceHistory([]);
    if (!drill || !item) return;
    setPriceLoading(true);
    try {
      const res = await getSupplierPriceHistory(drill.supplierId, item.id);
      setPriceHistory(res.data ?? res.history ?? []);
    } catch (e) { setError((e as Error).message); }
    finally { setPriceLoading(false); }
  };

  const handleRate = async () => {
    if (!rating) return;
    setSaving(true);
    try {
      await rateSupplier(rating.supplierId, rateForm);
      setRating(null);
      setRateForm({ quality_score: 3, delivery_score: 3, accuracy_score: 3, price_score: 3, notes: '' });
      void load();
    } catch (e) { setError((e as Error).message); }
    finally { setSaving(false); }
  };

  const ScoreInput = ({ label, field }: { label: string; field: ScoreField }) => (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-secondary)', marginBottom: 8 }}>{label}</div>
      <div style={{ display: 'flex', gap: 8 }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            onClick={() => setRateForm((f) => ({ ...f, [field]: n }))}
            style={{
              width: 36, height: 36, borderRadius: '50%',
              border: `2px solid ${rateForm[field] === n ? 'var(--color-warning)' : 'var(--color-border)'}`,
              cursor: 'pointer', fontWeight: 700, fontSize: 14,
              background: rateForm[field] === n ? 'var(--color-warning)' : 'var(--color-surface)',
              color: rateForm[field] === n ? '#fff' : 'var(--color-text-secondary)',
            }}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <PageShell>
    <>
      <PageHeader section="Manage"
        title="Supplier Intelligence"
        subtitle="Ratings, performance and price comparison"
        action={
          <div style={{ display: 'flex', gap: 8 }}>
            <Btn variant="secondary" onClick={() => { setShowCompare(true); setCompareItem(null); setCompareData(null); }}>
              ⚖ Price Compare
            </Btn>
            <Btn onClick={load} variant="secondary">↻ Refresh</Btn>
          </div>
        }
      />
      {error && <ErrorMsg message={error} />}

      {/* ── Suppliers directory ── */}
      <Card style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
          <p style={{ fontWeight: 700, fontSize: 14, color: 'var(--color-text)', margin: 0 }}>Suppliers</p>
          <Btn small onClick={() => openSupplierModal()}>+ Add Supplier</Btn>
        </div>
        {suppliersLoading ? <Spinner /> : suppliers.length === 0 ? (
          <EmptyState message="No suppliers yet. Add one to use in purchase orders." />
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              <th style={TH}>Name</th>
              <th style={TH}>Contact</th>
              <th style={TH}>Phone</th>
              <th style={TH}>Email</th>
              <th style={TH}>Status</th>
              <th style={TH}>Actions</th>
            </tr></thead>
            <tbody>
              {suppliers.map((s) => (
                <tr key={s.id}>
                  <td style={{ ...TD, fontWeight: 600 }}>{s.name}</td>
                  <td style={TD}>{s.contact_name ?? '—'}</td>
                  <td style={TD}>{s.phone ?? '—'}</td>
                  <td style={TD}>{s.email ?? '—'}</td>
                  <td style={TD}>{s.is_active ? 'Active' : 'Inactive'}</td>
                  <td style={TD}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <Btn small variant="secondary" onClick={() => openSupplierModal(s)}>Edit</Btn>
                      <Btn small variant="danger" onClick={() => void handleDeleteSupplier(s.id)}>Delete</Btn>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {loading ? <Spinner /> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {perfs.length === 0 && (
            <Card><EmptyState message="No suppliers found. Add suppliers and create purchases to see performance data." /></Card>
          )}
          {perfs.map((sup) => (
            <Card key={sup.supplier_id}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
                <div style={{ flex: '0 0 200px', minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--color-text)' }}>{sup.supplier_name}</div>
                  <div style={{ fontSize: 12, color: sup.is_active ? '#16a34a' : 'var(--color-text-muted)', marginTop: 3 }}>
                    {sup.is_active ? '● Active' : '○ Inactive'}
                  </div>
                </div>

                <div className="stat-grid" style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, minWidth: 0 }}>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--color-text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Purchases</div>
                    <div style={{ fontWeight: 700, color: 'var(--color-text)' }}>{sup.purchase_count}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--color-text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Total Spend</div>
                    <div style={{ fontWeight: 700, color: 'var(--color-primary)' }}>MVR {parseFloat(String(sup.total_spend ?? 0)).toFixed(2)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--color-text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Overall</div>
                    <Stars rating={sup.overall_rating} />
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--color-text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Scores</div>
                    <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                      <span title="Quality">Q:{sup.avg_quality != null ? parseFloat(String(sup.avg_quality)).toFixed(1) : '—'}</span>
                      {' · '}
                      <span title="Delivery">D:{sup.avg_delivery != null ? parseFloat(String(sup.avg_delivery)).toFixed(1) : '—'}</span>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 8, flexDirection: 'column' }}>
                  <Btn
                    variant="secondary"
                    onClick={() => setRating({ supplierId: sup.supplier_id, supplierName: sup.supplier_name })}
                  >
                    Rate Supplier
                  </Btn>
                  <Btn
                    variant="secondary"
                    onClick={() => void openDrill(sup)}
                  >
                    View History
                  </Btn>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Price Comparison Modal */}
      {showCompare && (
        <Modal title="Price Comparison by Item" onClose={() => { setShowCompare(false); setCompareItem(null); setCompareData(null); }} maxWidth={580}>
          <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 14 }}>
            Search an inventory item to compare prices across all suppliers.
          </p>
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 6 }}>Inventory Item</label>
            <ItemSearch
              kind="inventory"
              value={compareItem}
              onChange={(v) => void openCompare(v)}
              placeholder="Search inventory by name or SKU…"
            />
          </div>

          {compareLoading ? <Spinner /> : compareData ? (
            <>
              {compareData.cheapest && (
                <div style={{ background: '#DCFCE7', color: '#166534', padding: '10px 14px', borderRadius: 8, marginBottom: 14, fontSize: 13, fontWeight: 600 }}>
                  ✓ Cheapest: {compareData.cheapest.supplier_name} — MVR {parseFloat(String(compareData.cheapest.unit_price ?? 0)).toFixed(2)}
                </div>
              )}
              {(compareData.prices ?? []).length === 0 ? (
                <EmptyState message="No price history found for this item from any supplier." />
              ) : (
                <TableCard>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr>
                        {['Supplier', 'Unit Price (MVR)', 'Unit', 'Last Recorded'].map((h) => (
                          <th key={h} style={TH}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {[...(compareData.prices ?? [])]
                        .sort((a, b) => a.unit_price - b.unit_price)
                        .map((p, i) => (
                          <tr key={p.supplier_id} style={{ background: i === 0 ? '#F0FDF4' : undefined }}>
                            <td style={{ ...TD, fontWeight: i === 0 ? 700 : 400, color: i === 0 ? '#166534' : 'var(--color-text)' }}>
                              {i === 0 && '🏆 '}{p.supplier_name}
                            </td>
                            <td style={{ ...TD, fontWeight: 700, color: i === 0 ? '#166534' : 'var(--color-primary)' }}>
                              {parseFloat(String(p.unit_price ?? 0)).toFixed(2)}
                            </td>
                            <td style={{ ...TD, color: 'var(--color-text-secondary)' }}>{p.unit}</td>
                            <td style={{ ...TD, color: 'var(--color-text-muted)', fontSize: 12 }}>
                              {new Date(p.recorded_at).toLocaleDateString()}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </TableCard>
              )}
            </>
          ) : !compareItem ? (
            <p style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>Search and select an item above to see price comparison.</p>
          ) : null}

          <ModalActions>
            <Btn variant="secondary" onClick={() => { setShowCompare(false); setCompareItem(null); setCompareData(null); }}>Close</Btn>
          </ModalActions>
        </Modal>
      )}

      {/* Drill-down Modal */}
      {drill && (
        <Modal title={drill.supplierName} onClose={() => { setDrill(null); setPriceItem(null); setPriceHistory([]); }} maxWidth={620}>
          {/* Tabs */}
          <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--color-border)', marginBottom: 20 }}>
            {(['ratings', 'prices'] as const).map((t) => (
              <button key={t} onClick={() => setDrillTab(t)} style={{
                padding: '8px 18px', border: 'none',
                borderBottom: drillTab === t ? '2px solid #D4783A' : '2px solid transparent',
                background: 'transparent', fontSize: 14,
                fontWeight: drillTab === t ? 700 : 500,
                color: drillTab === t ? '#D4783A' : 'var(--color-text-secondary)',
                cursor: 'pointer', fontFamily: 'inherit',
              }}>
                {t === 'ratings' ? 'Rating History' : 'Price History'}
              </button>
            ))}
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center' }}>
              <Btn small variant="secondary" onClick={() => void handleRefreshCache()} disabled={drillRefreshing}>
                {drillRefreshing ? '…' : '↻ Refresh Cache'}
              </Btn>
            </div>
          </div>

          {drillLoading ? <Spinner /> : drillTab === 'ratings' ? (
            drillRatings.length === 0 ? (
              <EmptyState message="No ratings yet for this supplier." />
            ) : (
              <TableCard>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr>
                      {['Date', 'Quality', 'Delivery', 'Pricing', 'Overall', 'Comment'].map((h) => (
                        <th key={h} style={TH}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {drillRatings.map((r) => (
                      <tr key={r.id}>
                        <td style={{ ...TD, whiteSpace: 'nowrap', color: 'var(--color-text-muted)', fontSize: 12 }}>
                          {new Date(r.created_at).toLocaleDateString()}
                        </td>
                        <td style={{ ...TD, textAlign: 'center' }}>
                          <span style={{ color: 'var(--color-warning)' }}>{'★'.repeat(Math.round(r.quality_score))}</span>
                        </td>
                        <td style={{ ...TD, textAlign: 'center' }}>
                          <span style={{ color: 'var(--color-warning)' }}>{'★'.repeat(Math.round(r.delivery_score))}</span>
                        </td>
                        <td style={{ ...TD, textAlign: 'center' }}>
                          <span style={{ color: 'var(--color-warning)' }}>{'★'.repeat(Math.round(r.pricing_score))}</span>
                        </td>
                        <td style={{ ...TD, textAlign: 'center', fontWeight: 700, color: 'var(--color-primary)' }}>
                          {parseFloat(String(r.overall_score ?? 0)).toFixed(1)}
                        </td>
                        <td style={{ ...TD, color: 'var(--color-text-secondary)', maxWidth: 180, fontSize: 12 }}>
                          {r.comment ?? '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableCard>
            )
          ) : (
            <div>
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 6 }}>
                  Search inventory item to see price history
                </label>
                <ItemSearch
                  kind="inventory"
                  value={priceItem}
                  onChange={(v) => void loadPriceHistory(v)}
                  placeholder="Search inventory by name or SKU…"
                />
              </div>
              {priceLoading ? <Spinner /> : priceHistory.length === 0 ? (
                <EmptyState message={priceItem ? 'No price history for this item from this supplier.' : 'Search and select an item above.'} />
              ) : (
                <TableCard>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr>
                        {['Date', 'Unit Price (MVR)', 'Unit', 'Purchase #'].map((h) => (
                          <th key={h} style={TH}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {priceHistory.map((ph, i) => (
                        <tr key={i}>
                          <td style={{ ...TD, whiteSpace: 'nowrap', color: 'var(--color-text-muted)', fontSize: 12 }}>
                            {new Date(ph.recorded_at).toLocaleDateString()}
                          </td>
                          <td style={{ ...TD, fontWeight: 700, color: 'var(--color-primary)' }}>
                            {parseFloat(String(ph.unit_price ?? 0)).toFixed(2)}
                          </td>
                          <td style={{ ...TD, color: 'var(--color-text-secondary)' }}>{ph.unit}</td>
                          <td style={TD}>
                            {ph.purchase_id ? (
                              <Link
                                to={`/purchase-orders?search=${encodeURIComponent(ph.purchase_number || String(ph.purchase_id))}`}
                                style={{ color: 'var(--color-primary)', fontWeight: 600, textDecoration: 'none', fontSize: 12 }}
                              >
                                {ph.purchase_number || `PO #${ph.purchase_id}`}
                              </Link>
                            ) : (
                              <span style={{ color: 'var(--color-text-muted)' }}>—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TableCard>
              )}
            </div>
          )}

          <ModalActions>
            <Btn variant="secondary" onClick={() => setDrill(null)}>Close</Btn>
          </ModalActions>
        </Modal>
      )}

      {/* Rate Supplier Modal */}
      {rating && (
        <Modal title={`Rate — ${rating.supplierName}`} onClose={() => setRating(null)}>
          <ScoreInput label="Quality (product quality received)" field="quality_score" />
          <ScoreInput label="Delivery (on-time, packaging)"      field="delivery_score" />
          <ScoreInput label="Accuracy (correct items, quantities)" field="accuracy_score" />
          <ScoreInput label="Price (value for money)"            field="price_score" />
          <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-secondary)', display: 'block', marginTop: 4 }}>
            Notes (optional)
            <textarea
              value={rateForm.notes}
              onChange={(e) => setRateForm((f) => ({ ...f, notes: e.target.value }))}
              rows={2}
              style={{ display: 'block', width: '100%', marginTop: 6, padding: '8px 10px', borderRadius: 10, border: '1.5px solid var(--color-border)', fontSize: 13, resize: 'vertical', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }}
            />
          </label>
          <ModalActions>
            <Btn variant="ghost" onClick={() => setRating(null)}>Cancel</Btn>
            <Btn onClick={handleRate} disabled={saving}>{saving ? 'Saving…' : 'Submit Rating'}</Btn>
          </ModalActions>
        </Modal>
      )}

      {/* Supplier create/edit modal */}
      {supplierModal && (
        <Modal title={supplierModal === 'new' ? 'Add Supplier' : 'Edit Supplier'} onClose={() => setSupplierModal(null)}>
          {supplierFormError && <ErrorMsg message={supplierFormError} />}
          <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--color-text-secondary)', marginBottom: 4 }}>Name *</label>
          <input value={supplierForm.name} onChange={(e) => setSupplierForm((f) => ({ ...f, name: e.target.value }))}
            style={{ width: '100%', padding: '8px 10px', borderRadius: 10, border: '1.5px solid var(--color-border)', fontSize: 13, fontFamily: 'inherit', marginBottom: 12, boxSizing: 'border-box' }} />
          <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--color-text-secondary)', marginBottom: 4 }}>Contact name</label>
          <input value={supplierForm.contact_name} onChange={(e) => setSupplierForm((f) => ({ ...f, contact_name: e.target.value }))}
            style={{ width: '100%', padding: '8px 10px', borderRadius: 10, border: '1.5px solid var(--color-border)', fontSize: 13, fontFamily: 'inherit', marginBottom: 12, boxSizing: 'border-box' }} />
          <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--color-text-secondary)', marginBottom: 4 }}>Phone</label>
          <input value={supplierForm.phone} onChange={(e) => setSupplierForm((f) => ({ ...f, phone: e.target.value }))}
            style={{ width: '100%', padding: '8px 10px', borderRadius: 10, border: '1.5px solid var(--color-border)', fontSize: 13, fontFamily: 'inherit', marginBottom: 12, boxSizing: 'border-box' }} />
          <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--color-text-secondary)', marginBottom: 4 }}>Email</label>
          <input type="email" value={supplierForm.email} onChange={(e) => setSupplierForm((f) => ({ ...f, email: e.target.value }))}
            style={{ width: '100%', padding: '8px 10px', borderRadius: 10, border: '1.5px solid var(--color-border)', fontSize: 13, fontFamily: 'inherit', marginBottom: 16, boxSizing: 'border-box' }} />
          <ModalActions>
            <Btn variant="ghost" onClick={() => setSupplierModal(null)}>Cancel</Btn>
            <Btn onClick={() => void handleSaveSupplier()} disabled={supplierSaving}>{supplierSaving ? 'Saving…' : 'Save'}</Btn>
          </ModalActions>
        </Modal>
      )}
    </>

    </PageShell>
  );
}
