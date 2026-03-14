import { useEffect, useState } from 'react';
import { getSupplierPerformance, rateSupplier, type SupplierPerf } from '../api';
import { Btn, Card, ErrorMsg, PageHeader, Spinner } from '../components/Layout';
import { usePageTitle } from '../hooks/usePageTitle';

function Stars({ rating, max = 5 }: { rating: number | null; max?: number }) {
  if (rating === null) return <span style={{ color: '#94a3b8', fontSize: 12 }}>Not rated</span>;
  return (
    <span style={{ color: '#f59e0b', fontSize: 13 }}>
      {'★'.repeat(Math.round(rating))}{'☆'.repeat(max - Math.round(rating))}
      <span style={{ color: '#64748b', marginLeft: 6, fontSize: 12 }}>{rating.toFixed(1)}</span>
    </span>
  );
}

export function SupplierIntelligencePage() {
    usePageTitle('Supplier Intelligence');
  const [perfs, setPerfs]       = useState<SupplierPerf[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [rating, setRating]     = useState<{ supplierId: number; supplierName: string } | null>(null);
  const [rateForm, setRateForm] = useState({ quality_score: 3, delivery_score: 3, accuracy_score: 3, price_score: 3, notes: '' });
  const [saving, setSaving]     = useState(false);

  const load = async () => {
    setLoading(true); setError('');
    try {
      const res = await getSupplierPerformance();
      setPerfs(res.suppliers);
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

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

  const ScoreInput = ({ label, field }: { label: string; field: 'quality_score' | 'delivery_score' | 'accuracy_score' | 'price_score' }) => (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>{label}</div>
      <div style={{ display: 'flex', gap: 8 }}>
        {[1, 2, 3, 4, 5].map(n => (
          <button key={n} onClick={() => setRateForm(f => ({ ...f, [field]: n }))}
            style={{
              width: 36, height: 36, borderRadius: '50%', border: 'none', cursor: 'pointer',
              background: rateForm[field] === n ? '#f59e0b' : '#f1f5f9',
              color: rateForm[field] === n ? '#fff' : '#475569',
              fontWeight: 700, fontSize: 14,
            }}>
            {n}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <>
      <PageHeader title="Supplier Intelligence" subtitle="Ratings, performance and price comparison" />
      {error && <ErrorMsg message={error} />}

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <Btn onClick={load}>Refresh</Btn>
      </div>

      {loading ? <Spinner /> : (
        <div style={{ display: 'grid', gap: 16 }}>
          {perfs.length === 0 && (
            <Card><div style={{ color: '#94a3b8', textAlign: 'center', padding: 40 }}>No suppliers found. Add suppliers and create purchases to see performance data.</div></Card>
          )}
          {perfs.map(sup => (
            <Card key={sup.supplier_id}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                <div style={{ flex: '0 0 200px' }}>
                  <div style={{ fontWeight: 700, fontSize: 15, color: '#0f172a' }}>{sup.supplier_name}</div>
                  <div style={{ fontSize: 12, color: sup.is_active ? '#16a34a' : '#94a3b8', marginTop: 2 }}>
                    {sup.is_active ? 'Active' : 'Inactive'}
                  </div>
                </div>

                <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
                  <div>
                    <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 2 }}>PURCHASES</div>
                    <div style={{ fontWeight: 700 }}>{sup.purchase_count}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 2 }}>TOTAL SPEND</div>
                    <div style={{ fontWeight: 700 }}>MVR {sup.total_spend.toFixed(2)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 2 }}>OVERALL</div>
                    <Stars rating={sup.overall_rating} />
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>SCORES</div>
                    <div style={{ fontSize: 12, color: '#475569' }}>
                      <span title="Quality">Q:{sup.avg_quality?.toFixed(1) ?? '—'}</span> ·{' '}
                      <span title="Delivery">D:{sup.avg_delivery?.toFixed(1) ?? '—'}</span>
                    </div>
                  </div>
                </div>

                <Btn onClick={() => setRating({ supplierId: sup.supplier_id, supplierName: sup.supplier_name })}>
                  Rate Supplier
                </Btn>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Rate Supplier Modal */}
      {rating && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <Card style={{ width: 420 }}>
            <h3 style={{ fontWeight: 700, marginBottom: 4 }}>Rate Supplier</h3>
            <p style={{ color: '#64748b', marginBottom: 20, fontSize: 14 }}>{rating.supplierName}</p>
            <ScoreInput label="Quality (product quality received)" field="quality_score" />
            <ScoreInput label="Delivery (on-time, packaging)" field="delivery_score" />
            <ScoreInput label="Accuracy (correct items, quantities)" field="accuracy_score" />
            <ScoreInput label="Price (value for money)" field="price_score" />
            <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 16 }}>Notes (optional)
              <textarea value={rateForm.notes} onChange={e => setRateForm(f => ({ ...f, notes: e.target.value }))}
                rows={2} style={{ display: 'block', width: '100%', marginTop: 4, padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 14, resize: 'vertical' }} />
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <Btn onClick={handleRate} disabled={saving}>{saving ? 'Saving…' : 'Submit Rating'}</Btn>
              <button onClick={() => setRating(null)} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer' }}>Cancel</button>
            </div>
          </Card>
        </div>
      )}
    </>
  );
}
