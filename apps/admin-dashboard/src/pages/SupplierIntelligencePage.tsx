import { useEffect, useState } from 'react';
import { getSupplierPerformance, rateSupplier, type SupplierPerf } from '../api';
import { Btn, Card, EmptyState, ErrorMsg, Modal, ModalActions, PageHeader, Spinner } from '../components/Layout';
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
    try { setPerfs((await getSupplierPerformance()).suppliers); }
    catch (e) { setError((e as Error).message); }
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
        action={<Btn onClick={load} variant="secondary">↻ Refresh</Btn>}
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

                <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, minWidth: 0 }}>
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

                <Btn
                  variant="secondary"
                  onClick={() => setRating({ supplierId: sup.supplier_id, supplierName: sup.supplier_name })}
                >
                  Rate Supplier
                </Btn>
              </div>
            </Card>
          ))}
        </div>
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
