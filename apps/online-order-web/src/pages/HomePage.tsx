import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { fetchItems, fetchOnlineOrderingStatus, fetchActiveSpecials, fetchCustomerOrders, getReorderPayload, fetchFeaturedReviews, submitCorporateInquiry, API_ORIGIN } from '../api';
import type { Item, DailySpecial, Order, FeaturedReview } from '../api';
import { WhatsAppIcon, ViberIcon } from '../components/icons';
import { usePageTitle } from '../hooks/usePageTitle';
import { useSiteSettingsContext } from '../context/SiteSettingsContext';
import { OpeningStatusBadge } from '../components/OpeningStatusBadge';
import { HeroCarousel } from '../components/HeroCarousel';
import { useCart } from '../context/CartContext';

// ─── Category shortcuts data ──────────────────────────────────────────────────
const CATEGORIES = [
  { icon: '🥐', name: 'Hedhikaa', slug: 'hedhikaa', hook: 'Ready by 7am, made the right way', color: 'var(--color-surface-alt)' },
  { icon: '🍞', name: 'Fresh Bakes', slug: 'fresh-bakes', hook: 'Croissants that crackle. Baked at dawn.', color: 'var(--color-surface-alt)' },
  { icon: '🔥', name: 'Grills', slug: 'grills', hook: 'Proper char. Proper flavor.', color: 'var(--color-surface-alt)' },
  { icon: '🎂', name: 'Special Orders', slug: 'special-orders', hook: 'Cakes made to order. Call ahead.', color: 'var(--color-surface-alt)' },
];

function showDiscountPctUnderBadge(badge: string | null | undefined, discountPct: number | null | undefined): boolean {
  if (!badge || !discountPct || discountPct <= 0) return false;
  return !badge.includes(`${discountPct}%`);
}

const corpInputStyle = {
  width: '100%',
  padding: '0.75rem 1rem',
  border: '1.5px solid var(--color-border)',
  borderRadius: '10px',
  fontSize: '0.9rem',
  fontFamily: 'inherit',
  background: 'var(--color-surface)',
  boxSizing: 'border-box' as const,
};

export function HomePage() {
  const navigate = useNavigate();
  const { addItem, clearCart } = useCart();
  const [featuredItems, setFeaturedItems] = useState<Item[]>([]);
  const [specials, setSpecials] = useState<DailySpecial[]>([]);
  const [isOpen, setIsOpen] = useState<boolean | null>(null);
  const [hoursMsg, setHoursMsg] = useState<string | null>(null);
  const [hoursReason, setHoursReason] = useState<'master_switch_off' | 'schedule' | 'override_active' | null>(null);
  const [currentClose, setCurrentClose] = useState<string | null>(null);
  const [nextOpenWindow, setNextOpenWindow] = useState<string | null>(null);
  const [, setDeliveryAvailable] = useState<boolean>(true);
  const [lastOrder, setLastOrder] = useState<Order | null>(null);
  const [reordering, setReordering] = useState(false);
  const [featuredReviews, setFeaturedReviews] = useState<FeaturedReview[]>([]);
  const [corpForm, setCorpForm] = useState({ contact_name: '', phone: '', company: '', headcount: '', notes: '' });
  const [corpSubmitting, setCorpSubmitting] = useState(false);
  const [corpMessage, setCorpMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const { settings: s, trustItems, heroSlides } = useSiteSettingsContext();
  const reorderFetched = useRef(false);

  const waLink    = s.business_whatsapp || 'https://wa.me/9609120011';
  const viberLink = s.business_viber   || 'viber://chat?number=9609120011';
  const officeOrdersEnabled = s.office_orders_enabled !== '0' && s.office_orders_enabled !== 'false';
  const officeHeadline = s.office_orders_headline || 'Office breakfast & team catering';
  const officeSubtext = s.office_orders_subtext || 'Minimum 10 guests. We deliver across Malé — tell us your date and headcount.';
  const officeMinGuests = Math.max(1, parseInt(s.office_orders_min_guests ?? '10', 10) || 10);

  usePageTitle(null);

  useEffect(() => {
    const loadFeatured = () => {
      fetchItems().then((res) => {
        setFeaturedItems((res.data ?? []).slice(0, 4));
      }).catch(() => { /* section simply stays hidden on failure */ });
    };
    loadFeatured();
    window.addEventListener('sales_channel_change', loadFeatured);
    return () => window.removeEventListener('sales_channel_change', loadFeatured);
  }, []);

  useEffect(() => {
    fetchOnlineOrderingStatus().then((gate) => {
      setIsOpen(gate.open);
      setHoursMsg(gate.open ? null : (gate.message ?? null));
      setHoursReason(gate.reason ?? null);
      setCurrentClose(gate.current_close ?? null);
      setNextOpenWindow(gate.next_open_window ?? null);
      setDeliveryAvailable(gate.delivery_available ?? true); // kept for future use
    }).catch(() => setIsOpen(false));

    fetchActiveSpecials().then(({ specials: sp }) => {
      setSpecials((sp ?? []).slice(0, 6));
    }).catch(() => { /* non-blocking */ });

    fetchFeaturedReviews(6).then(({ reviews }) => {
      setFeaturedReviews(reviews ?? []);
    }).catch(() => { /* non-blocking */ });
  }, []);

  // Load last order for returning customers (non-blocking)
  useEffect(() => {
    if (reorderFetched.current) return;
    const token = localStorage.getItem('online_token');
    if (!token) return;
    reorderFetched.current = true;
    fetchCustomerOrders(token).then(({ data }) => {
      const completed = (data ?? []).find((o) => ['completed', 'delivered', 'paid'].includes(o.status));
      if (completed) setLastOrder(completed);
    }).catch(() => { /* non-blocking */ });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const statusBadge =
    isOpen !== null ? (
      <OpeningStatusBadge
        open={isOpen}
        reason={hoursReason}
        currentClose={currentClose}
        nextOpenWindow={nextOpenWindow}
        closedDetail={hoursMsg}
        className="opening-status-badge-hero"
        timeDisplay="24h"
      />
    ) : null;  const gradientHeroFallback = (
    <section
      className="home-hero"
      style={{
        background: 'linear-gradient(135deg, var(--color-primary-light) 0%, var(--color-surface-alt) 40%, var(--color-bg) 100%)',
        borderBottom: '1px solid var(--color-border)',
        padding: '3.5rem var(--page-gutter) 3rem',
        textAlign: 'center',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {statusBadge}
      <div style={{ maxWidth: '640px', margin: '0 auto' }}>
        <span className="home-banner-eyebrow">Malé&apos;s neighbourhood café</span>
        <h1 className="home-banner-title">
          Where Dhivehi breakfast
          <br />
          meets <em>artisan baking</em>
        </h1>
        <p className="home-banner-sub">
          Real food. Proper char. Baked fresh every morning at 5am.
        </p>
        <div className="home-banner-ctas">
          <Link to="/menu" className="home-banner-cta-primary btn-primary-hover">
            Order Now →
          </Link>
          <Link to="/menu" className="home-banner-cta-secondary btn-ghost-hover">
            View Menu
          </Link>
        </div>
      </div>
    </section>
  );

  return (
    <div>

      {/* Online ordering status — shown inside hero top-right corner always */}

      <HeroCarousel
        slides={heroSlides}
        apiOrigin={API_ORIGIN}
        fallback={gradientHeroFallback}
        statusSlot={statusBadge}
      />

      {/* ── "Your usual" returning-customer block ──────────────────────────── */}
      {lastOrder && (
        <section style={{ background: 'var(--color-surface-alt)', borderBottom: '1px solid var(--color-border)', padding: '1.25rem var(--page-gutter)' }}>
          <div style={{ maxWidth: 'var(--layout-max)', margin: '0 auto', display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', justifyContent: 'space-between' }}>
            <div>
              <p style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-primary)', margin: '0 0 0.2rem' }}>
                Welcome back!
              </p>
              <p style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--color-dark)', margin: 0 }}>
                Order #{lastOrder.order_number}
                {lastOrder.items && lastOrder.items.length > 0 && (
                  <span style={{ fontWeight: 400, color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
                    {' — '}{lastOrder.items.slice(0, 3).map((i) => i.item_name).join(', ')}
                    {lastOrder.items.length > 3 ? ` +${lastOrder.items.length - 3} more` : ''}
                  </span>
                )}
              </p>
            </div>
            <button
              type="button"
              disabled={reordering}
              onClick={async () => {
                const token = localStorage.getItem('online_token');
                if (!token) { navigate('/account'); return; }
                setReordering(true);
                try {
                  const payload = await getReorderPayload(token, lastOrder.id);
                  clearCart();
                  for (const i of payload.items) {
                    const fakeItem = { id: i.item_id, name: i.item_name, base_price: i.unit_price, has_variants: false, is_available: true } as any;
                    addItem(fakeItem, i.quantity, [], null);
                  }
                  navigate('/checkout');
                } catch {
                  navigate('/menu');
                } finally {
                  setReordering(false);
                }
              }}
              style={{
                padding: '0.65rem 1.5rem',
                background: 'var(--color-primary)', color: '#fff',
                border: 'none', borderRadius: '10px',
                fontSize: '0.9rem', fontWeight: 700,
                cursor: reordering ? 'wait' : 'pointer',
                fontFamily: 'inherit', whiteSpace: 'nowrap', flexShrink: 0,
                opacity: reordering ? 0.7 : 1,
              }}
            >
              {reordering ? 'Adding…' : '🔁 Reorder'}
            </button>
          </div>
        </section>
      )}

      {/* ── Trust strip (Blade .trust-strip parity) ───────────────────────── */}
      <div className="order-trust-strip">
        <div className="order-trust-inner">
          {trustItems.map((ti, i) => (
            <div key={i} className="order-trust-item">
              <div className="order-trust-icon-wrap">{ti.icon ?? ''}</div>
              <div className="order-trust-text">
                <strong>{ti.heading ?? ''}</strong>
                <span>{ti.subtext ?? ''}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Category shortcuts ────────────────────────────────── */}
      <section className="home-section" style={{ paddingLeft: 'var(--page-gutter)', paddingRight: 'var(--page-gutter)', maxWidth: 'var(--layout-max)', margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
          <p style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--color-primary)', marginBottom: '0.4rem' }}>
            What we're known for
          </p>
          <h2 style={{ fontSize: 'clamp(1.4rem, 4vw, 2rem)', fontWeight: 800, color: 'var(--color-dark)', letterSpacing: '-0.03em' }}>
            Made for Malé
          </h2>
        </div>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '1rem',
        }}>
          {CATEGORIES.map((cat) => (
            <Link
              key={cat.name}
              to="/menu"
              className="cat-card-hover"
              style={{
                display: 'block',
                background: cat.color,
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-2xl)',
                padding: '1.5rem',
                textDecoration: 'none',
              }}
            >
              <div style={{ fontSize: '2rem', marginBottom: '0.75rem', lineHeight: 1 }}>{cat.icon}</div>
              <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--color-dark)', marginBottom: '0.35rem' }}>{cat.name}</h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', lineHeight: 1.5, margin: 0 }}>{cat.hook}</p>
              <div style={{ marginTop: '0.875rem', fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-primary)' }}>
                Order →
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* ── Today's Specials ──────────────────────────────────── */}
      {specials.length > 0 && (
        <section className="home-section" style={{ paddingLeft: 'var(--page-gutter)', paddingRight: 'var(--page-gutter)', borderTop: '1px solid var(--color-border)' }}>
          <div style={{ maxWidth: 'var(--layout-max)', margin: '0 auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.25rem' }}>
              <div>
                <h2 style={{ fontSize: '1.375rem', fontWeight: 800, color: 'var(--color-dark)', margin: 0 }}>Today's Specials</h2>
                <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', margin: '0.2rem 0 0' }}>Limited-time deals, today only</p>
              </div>
              <Link to="/menu" style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--color-primary)', textDecoration: 'none' }}>View all →</Link>
            </div>
            <div style={{ display: 'flex', gap: '1rem', overflowX: 'auto', paddingBottom: '0.5rem' }}>
              {specials.map((sp) => {
                const cardKey = sp.variant_id ? `${sp.id}-${sp.variant_id}` : String(sp.id);
                const imgSrc = sp.item_image
                  ? sp.item_image.startsWith('http') ? sp.item_image : `${API_ORIGIN}${sp.item_image.startsWith('/') ? '' : '/'}${sp.item_image}`
                  : null;
                const price = Number(sp.effective_price ?? 0);
                const wasPrice = sp.original_price != null && Number(sp.original_price) > price
                  ? Number(sp.original_price)
                  : null;
                const badge = sp.badge_label ?? (sp.discount_pct ? `${sp.discount_pct}% OFF` : 'Special Offer');
                const pctUnderBadge = showDiscountPctUnderBadge(sp.badge_label, sp.discount_pct);
                return (
                  <Link
                    key={cardKey}
                    to={`/menu?item=${sp.item_id}`}
                    style={{
                      flexShrink: 0, width: 180, borderRadius: 'var(--radius-2xl)',
                      background: 'var(--color-surface)', border: '1px solid var(--color-border)',
                      overflow: 'hidden', textDecoration: 'none', display: 'flex', flexDirection: 'column',
                    }}
                  >
                    <div style={{ height: 110, background: 'var(--color-surface-alt)', position: 'relative', overflow: 'hidden' }}>
                      {imgSrc
                        ? <img src={imgSrc} alt={sp.item_name ?? ''} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        : <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontSize: 32, opacity: 0.3 }}>🍽️</div>
                      }
                      {(badge || sp.discount_pct) && (
                        <div style={{ position: 'absolute', top: 8, left: 8, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4, zIndex: 2 }}>
                          <div style={{ background: 'var(--color-primary)', color: '#fff', fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99, lineHeight: 1.3 }}>
                            {badge}
                          </div>
                          {pctUnderBadge && (
                            <div style={{ background: 'var(--color-primary)', color: '#fff', fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99, lineHeight: 1.3 }}>
                              {sp.discount_pct}% OFF
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    <div style={{ padding: '0.75rem', flex: 1 }}>
                      <p style={{ margin: '0 0 4px', fontWeight: 700, fontSize: 13, color: 'var(--color-dark)', lineHeight: 1.3 }}>{sp.item_name}</p>
                      {sp.variant_name && (
                        <p style={{ margin: '0 0 4px', fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)', lineHeight: 1.3 }}>{sp.variant_name}</p>
                      )}
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                        <span style={{ fontWeight: 800, fontSize: 14, color: 'var(--color-primary)' }}>MVR {price.toFixed(2)}</span>
                        {wasPrice && <span style={{ fontSize: 11, color: 'var(--color-text-muted)', textDecoration: 'line-through' }}>MVR {wasPrice.toFixed(2)}</span>}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* ── Popular Items ─────────────────────────────────────── */}
      {featuredItems.length > 0 && (
        <section className="home-section" style={{ background: 'var(--color-surface-alt)', paddingLeft: 'var(--page-gutter)', paddingRight: 'var(--page-gutter)', borderTop: '1px solid var(--color-border)' }}>
          <div style={{ maxWidth: 'var(--layout-max)', margin: '0 auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
              <div>
                <p style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--color-primary)', marginBottom: '0.25rem' }}>
                  🔥 Most ordered
                </p>
                <h2 style={{ fontSize: 'clamp(1.3rem, 3.5vw, 1.75rem)', fontWeight: 800, color: 'var(--color-dark)', letterSpacing: '-0.03em', margin: 0 }}>
                  Popular right now
                </h2>
              </div>
              <Link
                to="/menu"
                style={{ color: 'var(--color-primary)', fontWeight: 600, fontSize: 'var(--text-base)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
              >
                See full menu →
              </Link>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '1rem' }}>
              {featuredItems.map((item) => {
                const imgSrc = item.image_url
                  ? item.image_url.startsWith('http') ? item.image_url : `${API_ORIGIN}${item.image_url.startsWith('/') ? '' : '/'}${item.image_url}`
                  : null;
                return (
                  <Link
                    key={item.id}
                    to={`/menu?item=${item.id}`}
                    className="feat-card-hover"
                    style={{
                      textDecoration: 'none',
                      display: 'flex', flexDirection: 'column',
                      background: 'var(--color-surface)',
                      border: '1px solid var(--color-border)',
                      borderRadius: 'var(--radius-2xl)',
                      overflow: 'hidden',
                    }}
                  >
                    <div style={{
                      height: '150px', flexShrink: 0, overflow: 'hidden',
                      background: imgSrc ? undefined : 'linear-gradient(135deg, var(--color-primary-light), var(--color-surface-alt))',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {imgSrc ? (
                        <img src={imgSrc} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" decoding="async" />
                      ) : (
                        <span style={{ fontSize: '2.5rem', opacity: 0.4 }}>🍽️</span>
                      )}
                    </div>
                    <div style={{ padding: '0.875rem 1rem' }}>
                      <h3 style={{ fontSize: 'var(--text-base)', fontWeight: 600, color: 'var(--color-text)', marginBottom: '0.375rem', lineHeight: 1.3 }}>
                        {item.name}
                      </h3>
                      <p style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--color-primary)', margin: 0 }}>
                        MVR {Number(item.base_price).toFixed(2)}
                      </p>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* ── Customer reviews (social proof) ───────────────── */}
      {featuredReviews.length > 0 && (
        <section className="home-section" style={{ paddingLeft: 'var(--page-gutter)', paddingRight: 'var(--page-gutter)', borderTop: '1px solid var(--color-border)' }}>
          <div style={{ maxWidth: 'var(--layout-max)', margin: '0 auto' }}>
            <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
              <p style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--color-primary)', marginBottom: '0.35rem' }}>
                Loved by locals
              </p>
              <h2 style={{ fontSize: 'clamp(1.3rem, 3.5vw, 1.75rem)', fontWeight: 800, color: 'var(--color-dark)', letterSpacing: '-0.03em', margin: 0 }}>
                What customers say
              </h2>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
              {featuredReviews.map((review) => (
                <div
                  key={review.id}
                  style={{
                    background: 'var(--color-surface)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-2xl)',
                    padding: '1.25rem',
                  }}
                >
                  <div style={{ fontSize: '0.95rem', color: '#f59e0b', marginBottom: '0.5rem', letterSpacing: '0.05em' }}>
                    {'★'.repeat(review.rating)}{'☆'.repeat(5 - review.rating)}
                  </div>
                  {review.comment && (
                    <p style={{ fontSize: '0.9rem', color: 'var(--color-text)', lineHeight: 1.55, margin: '0 0 0.75rem' }}>
                      &ldquo;{review.comment}&rdquo;
                    </p>
                  )}
                  <p style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', margin: 0 }}>
                    {review.author}
                    {review.item?.name ? ` · ${review.item.name}` : ''}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── Office / corporate catering inquiry ─────────────── */}
      {officeOrdersEnabled && (
        <section className="home-section" style={{ background: 'var(--color-surface-alt)', paddingLeft: 'var(--page-gutter)', paddingRight: 'var(--page-gutter)', borderTop: '1px solid var(--color-border)' }}>
          <div style={{ maxWidth: '520px', margin: '0 auto' }}>
            <div style={{ textAlign: 'center', marginBottom: '1.25rem' }}>
              <p style={{ fontSize: '1.5rem', marginBottom: '0.35rem' }}>🏢</p>
              <h2 style={{ fontSize: 'clamp(1.2rem, 3vw, 1.5rem)', fontWeight: 800, color: 'var(--color-dark)', margin: '0 0 0.5rem' }}>
                {officeHeadline}
              </h2>
              <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', margin: 0, lineHeight: 1.55 }}>
                {officeSubtext}
              </p>
            </div>
            {corpMessage?.type === 'ok' ? (
              <div style={{ textAlign: 'center', padding: '1.5rem', background: 'var(--color-success-bg)', borderRadius: 'var(--radius-xl)', border: '1px solid rgba(16,185,129,0.25)' }}>
                <p style={{ fontWeight: 700, color: 'var(--color-success)', margin: '0 0 0.35rem' }}>Thanks — we&apos;ll be in touch!</p>
                <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', margin: 0 }}>{corpMessage.text}</p>
              </div>
            ) : (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  setCorpMessage(null);
                  if (!corpForm.contact_name.trim() || !corpForm.phone.trim()) {
                    setCorpMessage({ type: 'err', text: 'Name and phone are required.' });
                    return;
                  }
                  const headcount = corpForm.headcount ? parseInt(corpForm.headcount, 10) : undefined;
                  if (headcount != null && headcount < officeMinGuests) {
                    setCorpMessage({ type: 'err', text: `Minimum ${officeMinGuests} guests for office orders.` });
                    return;
                  }
                  setCorpSubmitting(true);
                  try {
                    const res = await submitCorporateInquiry({
                      contact_name: corpForm.contact_name.trim(),
                      phone: corpForm.phone.trim(),
                      company: corpForm.company.trim() || undefined,
                      headcount,
                      notes: corpForm.notes.trim() || undefined,
                    });
                    setCorpMessage({ type: 'ok', text: res.message });
                    setCorpForm({ contact_name: '', phone: '', company: '', headcount: '', notes: '' });
                  } catch (err) {
                    setCorpMessage({ type: 'err', text: (err as Error).message });
                  } finally {
                    setCorpSubmitting(false);
                  }
                }}
                style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}
              >
                {corpMessage?.type === 'err' && (
                  <p style={{ color: 'var(--color-error)', fontSize: '0.85rem', margin: 0 }}>{corpMessage.text}</p>
                )}
                <input required placeholder="Your name *" value={corpForm.contact_name} onChange={(e) => setCorpForm((f) => ({ ...f, contact_name: e.target.value }))} style={corpInputStyle} />
                <input required placeholder="Phone *" value={corpForm.phone} onChange={(e) => setCorpForm((f) => ({ ...f, phone: e.target.value }))} style={corpInputStyle} />
                <input placeholder="Company / organisation" value={corpForm.company} onChange={(e) => setCorpForm((f) => ({ ...f, company: e.target.value }))} style={corpInputStyle} />
                <input type="number" min={officeMinGuests} placeholder={`Headcount (min ${officeMinGuests})`} value={corpForm.headcount} onChange={(e) => setCorpForm((f) => ({ ...f, headcount: e.target.value }))} style={corpInputStyle} />
                <textarea placeholder="Event date, dietary needs, delivery address…" value={corpForm.notes} onChange={(e) => setCorpForm((f) => ({ ...f, notes: e.target.value }))} rows={3} style={{ ...corpInputStyle, resize: 'vertical' }} />
                <button type="submit" disabled={corpSubmitting} style={{ padding: '0.875rem', background: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: '12px', fontWeight: 700, fontSize: '0.95rem', cursor: corpSubmitting ? 'wait' : 'pointer', fontFamily: 'inherit', opacity: corpSubmitting ? 0.7 : 1 }}>
                  {corpSubmitting ? 'Sending…' : 'Request a quote →'}
                </button>
              </form>
            )}
          </div>
        </section>
      )}

      {/* ── Chat with us ──────────────────────────────────────── */}
      <section className="home-section" style={{
        paddingLeft: 'var(--page-gutter)',
        paddingRight: 'var(--page-gutter)',
        borderTop: '1px solid var(--color-border)',
        background: 'var(--color-surface)',
      }}>
        <div className="chat-block" style={{ maxWidth: '440px', margin: '0 auto' }}>
          <p style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>💬</p>
          <p className="chat-block-heading">Questions? We reply fast.</p>
          <p className="chat-block-sub" style={{ marginBottom: '1.25rem' }}>
            Reach us on WhatsApp or Viber — usually within 10 minutes.
          </p>
          <div className="chat-btns">
            <a
              href={waLink}
              target="_blank"
              rel="noopener noreferrer"
              className="chat-btn chat-btn-wa"
              aria-label="Chat on WhatsApp"
            >
              <WhatsAppIcon /> WhatsApp
            </a>
            <a
              href={viberLink}
              className="chat-btn chat-btn-viber"
              aria-label="Chat on Viber"
            >
              <ViberIcon /> Viber
            </a>
          </div>
        </div>
      </section>

      {/* ── Browse menu CTA ───────────────────────────────────── */}
      <section className="home-section" style={{ background: 'var(--color-footer-bg)', paddingLeft: 'var(--page-gutter)', paddingRight: 'var(--page-gutter)', textAlign: 'center' }}>
        <div style={{ maxWidth: '520px', margin: '0 auto' }}>
          <h2 style={{ fontSize: 'clamp(1.4rem, 4vw, 2rem)', fontWeight: 800, color: 'white', marginBottom: '0.75rem', letterSpacing: '-0.03em' }}>
            Hungry? Browse the menu.
          </h2>
          <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: 'var(--text-body)', marginBottom: '1.75rem', lineHeight: 1.65 }}>
            Order in seconds — no app needed.
          </p>
          <Link
            to="/menu"
            className="btn-primary-hover"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
              background: 'var(--color-primary)',
              color: 'white',
              padding: '0.875rem 2.25rem',
              borderRadius: 'var(--radius-full)',
              fontWeight: 700, fontSize: 'var(--text-md)',
              boxShadow: '0 4px 18px var(--color-primary-glow)',
              textDecoration: 'none',
            }}
          >
            Browse Full Menu →
          </Link>
        </div>
      </section>

    </div>
  );
}
