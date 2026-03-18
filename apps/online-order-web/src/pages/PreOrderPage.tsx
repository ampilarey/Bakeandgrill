import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchItems, createPreOrder } from '../api';
import type { Item, PreOrderResult } from '../api';
import { AuthBlock } from '../components/AuthBlock';
import { useSiteSettings } from '../context/SiteSettingsContext';

// ── Helpers ───────────────────────────────────────────────────────────────────
function mvrToDisplay(mvr: number) { return mvr.toFixed(2); }

// Minimum fulfillment date: 24 hours from now
function minFulfillmentDate(): string {
  const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
  d.setSeconds(0, 0);
  return d.toISOString().slice(0, 16);
}

// ── Page ─────────────────────────────────────────────────────────────────────
export function PreOrderPage() {
  const s = useSiteSettings();
  const waLink = s.business_whatsapp || 'https://wa.me/9609120011';
  const [step, setStep] = useState<'items' | 'details' | 'confirm' | 'done'>('items');
  const [items, setItems] = useState<Item[]>([]);
  const [quantities, setQuantities] = useState<Record<number, number>>({});
  const [fulfillmentDate, setFulfillmentDate] = useState('');
  const [notes, setNotes] = useState('');
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('online_token'));
  const [customerName, setCustomerName] = useState<string | null>(() => localStorage.getItem('online_customer_name'));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<PreOrderResult | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => { document.title = 'Pre-Order — Bake & Grill'; }, []);
  useEffect(() => {
    fetchItems().then(({ data }) => setItems(data)).catch(() => {});
  }, []);

  // ── Derived ───────────────────────────────────────────────────────────────
  const selectedLines = items.filter(i => (quantities[i.id] ?? 0) > 0);
  const total = selectedLines.reduce((s, i) => s + (Number(i.base_price) * (quantities[i.id] ?? 0)), 0);
  const filteredItems = items.filter(i =>
    i.name.toLowerCase().includes(search.toLowerCase()),
  );

  const setQty = (id: number, delta: number) =>
    setQuantities(prev => {
      const next = Math.max(0, (prev[id] ?? 0) + delta);
      if (next === 0) { const { [id]: _, ...rest } = prev; return rest; }
      return { ...prev, [id]: next };
    });

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      const res = await createPreOrder(token, {
        items: selectedLines.map(i => ({ item_id: i.id, quantity: quantities[i.id] })),
        fulfillment_date: new Date(fulfillmentDate).toISOString(),
        customer_notes: notes || undefined,
      });
      setResult(res.pre_order);
      setStep('done');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={S.page}>
      <div style={S.container}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
          <h1 style={S.heading}>Event Pre-Order</h1>
          <p style={S.sub}>
            Ordering for a gathering or event? Select your items, choose a fulfillment date,
            and we'll prepare everything fresh for collection.
          </p>
          <div style={S.notice}>
            ⏰ Pre-orders require <strong>at least 24 hours' notice</strong>. Our team will confirm your order by phone.
          </div>
        </div>

        {/* Step indicator */}
        {step !== 'done' && (
          <div style={S.steps}>
            {(['items', 'details', 'confirm'] as const).map((s, i) => (
              <div key={s} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <div style={{
                  ...S.stepDot,
                  background: step === s ? 'var(--color-primary)' : (
                    ['items','details','confirm'].indexOf(step) > i ? 'var(--color-success)' : 'var(--color-border)'
                  ),
                  color: ['items','details','confirm'].indexOf(step) >= i ? 'white' : 'var(--color-text-muted)',
                }}>
                  {['items','details','confirm'].indexOf(step) > i ? '✓' : i + 1}
                </div>
                <span style={{ fontSize: '0.8rem', fontWeight: 600, color: step === s ? 'var(--color-primary)' : 'var(--color-text-muted)' }}>
                  {s === 'items' ? 'Choose Items' : s === 'details' ? 'Event Details' : 'Confirm'}
                </span>
                {i < 2 && <div style={{ flex: 1, height: 2, background: 'var(--color-border)', margin: '0 0.5rem' }} />}
              </div>
            ))}
          </div>
        )}

        {/* ── Step 1: Items ── */}
        {step === 'items' && (
          <>
            <div style={{ marginBottom: '1.25rem' }}>
              <input
                style={S.input}
                placeholder="Search items or categories…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>

            <div style={S.grid}>
              {filteredItems.map(item => {
                const qty = quantities[item.id] ?? 0;
                return (
                  <div key={item.id} style={{ ...S.card, opacity: item.is_available ? 1 : 0.55 }}>
                    <div style={{ fontWeight: 700, color: 'var(--color-text)', marginBottom: '0.25rem', lineHeight: 1.3 }}>{item.name}</div>
                    <div style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--color-primary)', marginBottom: '0.75rem' }}>
                      MVR {mvrToDisplay(Number(item.base_price))}
                    </div>

                    {item.is_available ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <button style={S.qtyBtn} onClick={() => setQty(item.id, -1)} disabled={qty === 0} aria-label="Remove one">−</button>
                        <span style={{ minWidth: '1.5rem', textAlign: 'center', fontWeight: 700, fontSize: '1rem', color: qty > 0 ? 'var(--color-primary)' : 'var(--color-text-muted)' }}>
                          {qty || '0'}
                        </span>
                        <button style={S.qtyBtn} onClick={() => setQty(item.id, 1)} aria-label="Add one">+</button>
                        {qty > 0 && (
                          <span style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', marginLeft: 'auto' }}>
                            = MVR {mvrToDisplay(Number(item.base_price) * qty)}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>Unavailable</span>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Running total */}
            {selectedLines.length > 0 && (
              <div style={S.totalBar}>
                <div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: '0.2rem' }}>
                    {selectedLines.length} item{selectedLines.length !== 1 ? 's' : ''} selected
                  </div>
                  <div style={{ fontWeight: 800, fontSize: '1.15rem', color: 'var(--color-text)' }}>
                    MVR {mvrToDisplay(total)} total
                  </div>
                </div>
                <button style={S.primaryBtn} onClick={() => setStep('details')}>
                  Next: Event Details →
                </button>
              </div>
            )}
          </>
        )}

        {/* ── Step 2: Details ── */}
        {step === 'details' && (
          <div style={{ ...S.card, maxWidth: '520px', margin: '0 auto' }}>
            <h2 style={S.cardTitle}>Event Details</h2>

            <label style={S.label}>Fulfillment Date &amp; Time *</label>
            <input
              type="datetime-local"
              style={S.input}
              value={fulfillmentDate}
              min={minFulfillmentDate()}
              onChange={e => setFulfillmentDate(e.target.value)}
            />
            <p style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', marginBottom: '1rem' }}>
              Must be at least 24 hours from now. We'll contact you to confirm.
            </p>

            <label style={S.label}>Special Instructions (optional)</label>
            <textarea
              style={{ ...S.input, height: 100, resize: 'vertical' }}
              placeholder="Allergens, delivery location, setup notes…"
              value={notes}
              onChange={e => setNotes(e.target.value)}
            />

            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
              <button style={S.ghostBtn} onClick={() => setStep('items')}>← Back</button>
              <button style={{ ...S.primaryBtn, flex: 1 }} onClick={() => setStep('confirm')} disabled={!fulfillmentDate}>
                Review Order →
              </button>
            </div>
          </div>
        )}

        {/* ── Step 3: Confirm ── */}
        {step === 'confirm' && (
          <div style={{ ...S.card, maxWidth: '520px', margin: '0 auto' }}>
            <h2 style={S.cardTitle}>Review Your Pre-Order</h2>

            {/* Items summary */}
            <div style={{ marginBottom: '1.25rem' }}>
              {selectedLines.map(item => (
                <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid var(--color-border)', fontSize: '0.9rem' }}>
                  <span>{item.name} × {quantities[item.id]}</span>
                  <span style={{ fontWeight: 600 }}>MVR {mvrToDisplay(Number(item.base_price) * quantities[item.id])}</span>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem 0 0', fontWeight: 800, fontSize: '1rem' }}>
                <span>Total</span>
                <span style={{ color: 'var(--color-primary)' }}>MVR {mvrToDisplay(total)}</span>
              </div>
            </div>

            <div style={{ ...S.infoRow, marginBottom: '1rem' }}>
              <span style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>📅 Fulfillment</span>
              <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>{new Date(fulfillmentDate).toLocaleString()}</span>
            </div>

            {notes && (
              <div style={{ ...S.infoRow, marginBottom: '1rem' }}>
                <span style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>📝 Notes</span>
                <span style={{ fontSize: '0.875rem' }}>{notes}</span>
              </div>
            )}

            {/* Auth if needed */}
            {!token ? (
              <AuthBlock onSuccess={(t, name) => { setToken(t); setCustomerName(name); }} />
            ) : (
              <div style={{ background: 'var(--color-surface-alt)', borderRadius: '10px', padding: '0.875rem 1rem', marginBottom: '1rem', fontSize: '0.875rem' }}>
                ✅ Ordering as <strong>{customerName}</strong>
              </div>
            )}

            {error && (
              <div style={{ background: 'var(--color-error-bg)', border: '1px solid rgba(220,38,38,0.2)', borderRadius: '8px', padding: '0.75rem', color: 'var(--color-error)', fontSize: '0.875rem', marginBottom: '1rem' }}>
                {error}
              </div>
            )}

            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button style={S.ghostBtn} onClick={() => setStep('details')}>← Back</button>
              <button
                style={{ ...S.primaryBtn, flex: 1, opacity: (!token || loading) ? 0.55 : 1, cursor: (!token || loading) ? 'not-allowed' : 'pointer' }}
                onClick={handleSubmit}
                disabled={!token || loading}
              >
                {loading ? 'Submitting…' : 'Submit Pre-Order'}
              </button>
            </div>
          </div>
        )}

        {/* ── Step 4: Done ── */}
        {step === 'done' && result && (
          <div style={{ ...S.card, maxWidth: '520px', margin: '0 auto', textAlign: 'center' }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🎉</div>
            <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--color-text)', marginBottom: '0.5rem' }}>Pre-Order Submitted!</h2>
            <p style={{ color: 'var(--color-text-muted)', marginBottom: '1.5rem', lineHeight: 1.6 }}>
              Your order <strong>{result.order_number}</strong> has been received. Our team will call you to confirm within a few hours.
            </p>

            <div style={{ background: 'var(--color-surface-alt)', borderRadius: '10px', padding: '1rem', marginBottom: '1.5rem', textAlign: 'left' }}>
              {result.items.map((item, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem', padding: '0.3rem 0' }}>
                  <span>{item.name} × {item.quantity}</span>
                  <span>MVR {mvrToDisplay(item.total)}</span>
                </div>
              ))}
              <div style={{ borderTop: '1px solid var(--color-border)', marginTop: '0.5rem', paddingTop: '0.5rem', fontWeight: 800 }}>
                <span>Total: MVR {mvrToDisplay(result.total)}</span>
              </div>
            </div>

            <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: '1.5rem' }}>
              📅 Fulfillment: {new Date(result.fulfillment_date).toLocaleString()}
            </p>

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
              <Link to="/menu" style={S.primaryBtn}>Browse Menu</Link>
              <a href={waLink} target="_blank" rel="noopener noreferrer" style={{ ...S.ghostBtn, textDecoration: 'none' }}>
                💬 WhatsApp Us
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const S: Record<string, React.CSSProperties> = {
  page: { minHeight: '100vh', background: 'var(--color-bg)', padding: '3rem 1rem 5rem' },
  container: { maxWidth: '900px', margin: '0 auto' },
  heading: { fontSize: 'clamp(1.75rem, 5vw, 2.5rem)', fontWeight: 800, color: 'var(--color-dark)', marginBottom: '0.75rem' },
  sub: { color: 'var(--color-text-muted)', fontSize: '1rem', lineHeight: 1.7, maxWidth: '540px', margin: '0 auto 1rem' },
  notice: {
    display: 'inline-block', background: 'var(--color-warning-bg)', border: '1px solid rgba(202,138,4,0.3)',
    borderRadius: '10px', padding: '0.625rem 1rem', fontSize: '0.875rem', color: 'var(--color-warning)',
  },
  steps: { display: 'flex', alignItems: 'center', gap: '0', marginBottom: '2rem', justifyContent: 'center' },
  stepDot: { width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 700, flexShrink: 0 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem', marginBottom: '2rem' },
  card: {
    background: 'var(--color-surface)', border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-lg)', padding: '1.125rem',
  },
  cardTitle: { fontSize: '1.1rem', fontWeight: 700, color: 'var(--color-text)', marginBottom: '1.25rem', paddingBottom: '0.75rem', borderBottom: '1px solid var(--color-border)' },
  label: { display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-text)', marginBottom: '0.4rem' },
  input: {
    width: '100%', padding: '0.7rem 0.875rem', border: '1.5px solid var(--color-border)',
    borderRadius: 'var(--radius-md)', fontSize: '0.95rem', marginBottom: '0.625rem',
    boxSizing: 'border-box', fontFamily: 'inherit', color: 'var(--color-text)', background: 'var(--color-surface)',
  },
  qtyBtn: {
    width: 32, height: 32, borderRadius: '8px', border: '1.5px solid var(--color-border)',
    background: 'var(--color-surface)', cursor: 'pointer', fontWeight: 700, fontSize: '1rem',
    display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit',
    color: 'var(--color-text)',
  },
  primaryBtn: {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    padding: '0.75rem 1.5rem', background: 'var(--color-primary)', color: 'white',
    border: 'none', borderRadius: 'var(--radius-md)', fontWeight: 700, fontSize: '0.95rem',
    cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'none',
  },
  ghostBtn: {
    padding: '0.75rem 1rem', background: 'transparent', color: 'var(--color-text-muted)',
    border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', fontWeight: 600,
    fontSize: '0.9rem', cursor: 'pointer', fontFamily: 'inherit',
  },
  totalBar: {
    position: 'sticky', bottom: 0, background: 'rgba(255,251,245,0.97)',
    backdropFilter: 'blur(12px)', borderTop: '1px solid var(--color-border)',
    padding: '1rem 1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    gap: '1rem', flexWrap: 'wrap',
  },
  infoRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' },
};
