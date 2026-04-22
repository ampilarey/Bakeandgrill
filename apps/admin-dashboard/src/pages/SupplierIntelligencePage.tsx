import { useEffect, useState } from 'react';
import {
  getSupplierPerformance, rateSupplier,
  getSupplierRatings, getSupplierPerformanceSingle, refreshSupplierCache,
  getSupplierPriceHistory, getPriceComparison, fetchInventoryItems,
  type SupplierPerf, type SupplierRating, type PriceHistory,
} from '../api';
import { Btn, Card, EmptyState, ErrorMsg, Modal, ModalActions, PageHeader, Spinner, TableCard, TD, TH } from '../components/Layout';
import { usePageTitle } from '../hooks/usePageTitle';

function Stars({ rating, max = 5 }: { rating: number | null; max?: number }) {
  if (rating === null) return <span style={{ color: '#9C8E7E', fontSize: 12 }}>Not rated</span>;
  return (
    <span style={{ fontSize: 13 }}>
      <span style={{ color: '#f59e0b' }}>{'★'.repeat(Math.round(rating))}</span>
      <span style={{ color: '#E8E0D8' }}>{'★'.repeat(max - Math.round(rating))}</span>
      <span style={{ color: '#9C8E7E', marginLeft: 6, fontSize: 12 }}>{parseFloat(String(rating ?? 0)).toFixed(1)}</span>
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
  const [compareItemId, setCompareItemId] = useState<number | null>(null);
  const [compareData, setCompareData]   = useState<{ inventory_item_id: number; prices: { supplier_id: number; supplier_name: string; unit_price: number; unit: string; recorded_at: string }[]; cheapest: { supplier_id: number; supplier_name: string; unit_price: number } | null } | null>(null);
  const [compareLoading, setCompareLoading] = useState(false);

  const [drill, setDrill]               = useState<DrillDown | null>(null);
  const [drillTab, setDrillTab]         = useState<'ratings' | 'prices'>('ratings');
  const [drillRatings, setDrillRatings] = useState<SupplierRating[]>([]);
  const [drillLoading, setDrillLoading] = useState(false);
  const [drillRefreshing, setDrillRefreshing] = useState(false);
  // Price history
  const [invItems, setInvItems]         = useState<{ id: number; name: string }[]>([]);
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null);
  const [priceHistory, setPriceHistory] = useState<PriceHistory[]>([]);
  const [priceLoading, setPriceLoading] = useState(false);

  const load = async () => {
    setLoading(true); setError('');
    try { setPerfs((await getSupplierPerformance()).suppliers); }
    catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  useEffect(() => {
    fetchInventoryItems({ page: 1 })
      .then((res) => setInvItems((res.data ?? []).map((i) => ({ id: i.id, name: i.name }))))
      .catch((e: Error) => setError(e.message || 'Failed to load inventory items.'));
  }, []);

  const openCompare = async (itemId: number) => {
    setCompareItemId(itemId);
    setCompareData(null);
    setCompareLoading(true);
    try {
      const res = await getPriceComparison(itemId);
      setCompareData(res);
    } catch (e) { setError((e as Error).message); }
    finally { setCompareLoading(false); }
  };

  const openDrill = async (sup: SupplierPerf) => {
    setDrill({ supplierId: sup.supplier_id, supplierName: sup.supplier_name });
    setDrillTab('ratings');
    setDrillRatings([]);
    setPriceHistory([]);
    setSelectedItemId(null);
    setDrillLoading(true);
    try {
      const [ratingsRes, itemsRes] = await Promise.all([
        getSupplierRatings(sup.supplier_id),
        fetchInventoryItems({ page: 1 }),
      ]);
      setDrillRatings(ratingsRes.data);
      setInvItems((itemsRes.data ?? []).map((i) => ({ id: i.id, name: i.name })));
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

  const loadPriceHistory = async (itemId: number) => {
    if (!drill) return;
    setSelectedItemId(itemId);
    setPriceLoading(true);
    try {
      const res = await getSupplierPriceHistory(drill.supplierId, itemId);
      setPriceHistory(res.data ?? []);
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
      <div style={{ fontSize: 12, fontWeight: 700, color: '#6B5D4F', marginBottom: 8 }}>{label}</div>
      <div style={{ display: 'flex', gap: 8 }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            onClick={() => setRateForm((f) => ({ ...f, [field]: n }))}
            style={{
              width: 36, height: 36, borderRadius: '50%',
              border: `2px solid ${rateForm[field] === n ? '#f59e0b' : '#E8E0D8'}`,
              cursor: 'pointer', fontWeight: 700, fontSize: 14,
              background: rateForm[field] === n ? '#f59e0b' : '#fff',
              color: rateForm[field] === n ? '#fff' : '#6B5D4F',
            }}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <>
      <PageHeader
        title="Supplier Intelligence"
        subtitle="Ratings, performance and price comparison"
        action={
          <div style={{ display: 'flex', gap: 8 }}>
            <Btn variant="secondary" onClick={() => { setShowCompare(true); setCompareItemId(null); setCompareData(null); }}>
              ⚖ Price Compare
            </Btn>
            <Btn onClick={load} variant="secondary">↻ Refresh</Btn>
          </div>
        }
      />
      {error && <ErrorMsg message={error} />}

      {loading ? <Spinner /> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {perfs.length === 0 && (
            <Card><EmptyState message="No suppliers found. Add suppliers and create purchases to see performance data." /></Card>
          )}
          {perfs.map((sup) => (
            <Card key={sup.supplier_id}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
                <div style={{ flex: '0 0 200px', minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 15, color: '#1C1408' }}>{sup.supplier_name}</div>
                  <div style={{ fontSize: 12, color: sup.is_active ? '#16a34a' : '#9C8E7E', marginTop: 3 }}>
                    {sup.is_active ? '● Active' : '○ Inactive'}
                  </div>
                </div>

                <div className="stat-grid" style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, minWidth: 0 }}>
                  <div>
                    <div style={{ fontSize: 11, color: '#9C8E7E', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Purchases</div>
                    <div style={{ fontWeight: 700, color: '#1C1408' }}>{sup.purchase_count}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: '#9C8E7E', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Total Spend</div>
                    <div style={{ fontWeight: 700, color: '#D4813A' }}>MVR {parseFloat(String(sup.total_spend ?? 0)).toFixed(2)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: '#9C8E7E', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Overall</div>
                    <Stars rating={sup.overall_rating} />
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: '#9C8E7E', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Scores</div>
                    <div style={{ fontSize: 12, color: '#6B5D4F' }}>
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
        <Modal title="Price Comparison by Item" onClose={() => setShowCompare(false)} maxWidth={580}>
          <p style={{ fontSize: 13, color: '#6B5D4F', marginBottom: 14 }}>
            Select an inventory item to compare prices across all suppliers.
          </p>
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: '#6B5D4F', display: 'block', marginBottom: 6 }}>Inventory Item</label>
            <select
              value={compareItemId ?? ''}
              onChange={(e) => { if (e.target.value) void openCompare(Number(e.target.value)); }}
              style={{ height: 36, padding: '0 10px', border: '1.5px solid #E8E0D8', borderRadius: 10, fontSize: 13, fontFamily: 'inherit', background: '#fff', color: '#1C1408', outline: 'none', minWidth: 280, cursor: 'pointer' }}
            >
              <option value="">Choose an item…</option>
              {invItems.map((item) => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
            </select>
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
                            <td style={{ ...TD, fontWeight: i === 0 ? 700 : 400, color: i === 0 ? '#166534' : '#1C1408' }}>
                              {i === 0 && '🏆 '}{p.supplier_name}
                            </td>
                            <td style={{ ...TD, fontWeight: 700, color: i === 0 ? '#166534' : '#D4813A' }}>
                              {parseFloat(String(p.unit_price ?? 0)).toFixed(2)}
                            </td>
                            <td style={{ ...TD, color: '#6B5D4F' }}>{p.unit}</td>
                            <td style={{ ...TD, color: '#9C8E7E', fontSize: 12 }}>
                              {new Date(p.recorded_at).toLocaleDateString()}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </TableCard>
              )}
            </>
          ) : !compareItemId ? (
            <p style={{ color: '#9C8E7E', fontSize: 13 }}>Select an item above to see price comparison.</p>
          ) : null}

          <ModalActions>
            <Btn variant="secondary" onClick={() => setShowCompare(false)}>Close</Btn>
          </ModalActions>
        </Modal>
      )}

      {/* Drill-down Modal */}
      {drill && (
        <Modal title={drill.supplierName} onClose={() => setDrill(null)} maxWidth={620}>
          {/* Tabs */}
          <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid #E8E0D8', marginBottom: 20 }}>
            {(['ratings', 'prices'] as const).map((t) => (
              <button key={t} onClick={() => setDrillTab(t)} style={{
                padding: '8px 18px', border: 'none',
                borderBottom: drillTab === t ? '2px solid #D4783A' : '2px solid transparent',
                background: 'transparent', fontSize: 14,
                fontWeight: drillTab === t ? 700 : 500,
                color: drillTab === t ? '#D4783A' : '#6B5D4F',
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
                        <td style={{ ...TD, whiteSpace: 'nowrap', color: '#9C8E7E', fontSize: 12 }}>
                          {new Date(r.created_at).toLocaleDateString()}
                        </td>
                        <td style={{ ...TD, textAlign: 'center' }}>
                          <span style={{ color: '#f59e0b' }}>{'★'.repeat(Math.round(r.quality_score))}</span>
                        </td>
                        <td style={{ ...TD, textAlign: 'center' }}>
                          <span style={{ color: '#f59e0b' }}>{'★'.repeat(Math.round(r.delivery_score))}</span>
                        </td>
                        <td style={{ ...TD, textAlign: 'center' }}>
                          <span style={{ color: '#f59e0b' }}>{'★'.repeat(Math.round(r.pricing_score))}</span>
                        </td>
                        <td style={{ ...TD, textAlign: 'center', fontWeight: 700, color: '#D4813A' }}>
                          {parseFloat(String(r.overall_score ?? 0)).toFixed(1)}
                        </td>
                        <td style={{ ...TD, color: '#6B5D4F', maxWidth: 180, fontSize: 12 }}>
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
                <label style={{ fontSize: 12, fontWeight: 700, color: '#6B5D4F', display: 'block', marginBottom: 6 }}>
                  Select inventory item to see price history
                </label>
                <select
                  value={selectedItemId ?? ''}
                  onChange={(e) => { if (e.target.value) void loadPriceHistory(Number(e.target.value)); }}
                  style={{ height: 36, padding: '0 10px', border: '1.5px solid #E8E0D8', borderRadius: 10, fontSize: 13, fontFamily: 'inherit', background: '#fff', color: '#1C1408', outline: 'none', minWidth: 240, cursor: 'pointer' }}
                >
                  <option value="">Choose an item…</option>
                  {invItems.map((item) => (
                    <option key={item.id} value={item.id}>{item.name}</option>
                  ))}
                </select>
              </div>
              {priceLoading ? <Spinner /> : priceHistory.length === 0 ? (
                <EmptyState message={selectedItemId ? 'No price history for this item from this supplier.' : 'Select an item above.'} />
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
                          <td style={{ ...TD, whiteSpace: 'nowrap', color: '#9C8E7E', fontSize: 12 }}>
                            {new Date(ph.recorded_at).toLocaleDateString()}
                          </td>
                          <td style={{ ...TD, fontWeight: 700, color: '#D4813A' }}>
                            {parseFloat(String(ph.unit_price ?? 0)).toFixed(2)}
                          </td>
                          <td style={{ ...TD, color: '#6B5D4F' }}>{ph.unit}</td>
                          <td style={{ ...TD, color: '#9C8E7E' }}>{ph.purchase_id ? `#${ph.purchase_id}` : '—'}</td>
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
          <label style={{ fontSize: 12, fontWeight: 700, color: '#6B5D4F', display: 'block', marginTop: 4 }}>
            Notes (optional)
            <textarea
              value={rateForm.notes}
              onChange={(e) => setRateForm((f) => ({ ...f, notes: e.target.value }))}
              rows={2}
              style={{ display: 'block', width: '100%', marginTop: 6, padding: '8px 10px', borderRadius: 10, border: '1.5px solid #E8E0D8', fontSize: 13, resize: 'vertical', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }}
            />
          </label>
          <ModalActions>
            <Btn variant="ghost" onClick={() => setRating(null)}>Cancel</Btn>
            <Btn onClick={handleRate} disabled={saving}>{saving ? 'Saving…' : 'Submit Rating'}</Btn>
          </ModalActions>
        </Modal>
      )}
    </>
  );
}
