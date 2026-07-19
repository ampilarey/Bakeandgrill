import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  fetchItems,
  fetchOnlineOrderingStatus,
  fetchActiveSpecials,
  fetchCustomerOrders,
  getReorderPayload,
  fetchFeaturedReviews,
  submitCorporateInquiry,
  API_ORIGIN,
  type FeaturedReview,
} from '../api';
import type { Item, DailySpecial, Order } from '../api';
import { getLoyaltyAccount } from '../api/promotions';
import { usePageTitle } from '../hooks/usePageTitle';
import { useSiteSettingsContext } from '../context/SiteSettingsContext';
import { OpeningStatusBadge } from '../components/OpeningStatusBadge';
import { PrayerBar } from '../components/PrayerBar';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { useActiveOrder } from '../hooks/useActiveOrder';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { DESKTOP_SHELL_MQ } from '../components/shell/navTabs';

import { GreetingHeader } from '../components/home/GreetingHeader';
import { StatChipsRow } from '../components/home/StatChipsRow';
import { PromoCarousel } from '../components/home/PromoCarousel';
import { ModeEntryCards } from '../components/home/ModeEntryCards';
import { TrustStrip } from '../components/home/TrustStrip';
import { CategoryShortcuts } from '../components/home/CategoryShortcuts';
import { SpecialsCarousel } from '../components/home/SpecialsCarousel';
import { ReorderStrip } from '../components/home/ReorderStrip';
import { BrandFooter } from '../components/home/BrandFooter';

const corpInputStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.75rem 1rem',
  border: '1.5px solid var(--color-border)',
  borderRadius: '10px',
  fontSize: '0.9rem',
  fontFamily: 'inherit',
  background: 'var(--color-surface)',
  boxSizing: 'border-box',
};

export function HomePage() {
  const navigate = useNavigate();
  const { addItem, clearCart } = useCart();

  // ── Data state ─────────────────────────────────────────────────────────────
  const [specials, setSpecials] = useState<DailySpecial[]>([]);
  const [reviews, setReviews] = useState<FeaturedReview[]>([]);
  const [isOpen, setIsOpen] = useState<boolean | null>(null);
  const [hoursMsg, setHoursMsg] = useState<string | null>(null);
  const [hoursReason, setHoursReason] = useState<
    'master_switch_off' | 'schedule' | 'override_active' | null
  >(null);
  const [currentClose, setCurrentClose] = useState<string | null>(null);
  const [nextOpenWindow, setNextOpenWindow] = useState<string | null>(null);
  const [recentOrders, setRecentOrders] = useState<Order[]>([]);
  const [reorderingId, setReorderingId] = useState<number | null>(null);
  const [loyaltyPoints, setLoyaltyPoints] = useState<number | null>(null);
  const [chipsLoading, setChipsLoading] = useState(true);
  const [corpForm, setCorpForm] = useState({
    contact_name: '',
    phone: '',
    company: '',
    headcount: '',
    notes: '',
  });
  const [corpSubmitting, setCorpSubmitting] = useState(false);
  const [corpMessage, setCorpMessage] = useState<{
    type: 'ok' | 'err';
    text: string;
  } | null>(null);

  const {
    settings: s,
    heroSlides,
    trustItems,
    homepageCategories,
    text,
  } = useSiteSettingsContext();
  const { isAuthenticated, authReady, customerName } = useAuth();
  const { t } = useLanguage();
  const { activeOrder } = useActiveOrder();
  /** Desktop/iPad home chrome; phone keeps the original greeting stack. */
  const isDesktopShell = useMediaQuery(DESKTOP_SHELL_MQ);
  const reorderFetched = useRef(false);
  const loyaltyFetched = useRef(false);

  // ── Derived settings ───────────────────────────────────────────────────────
  const waLink = s.business_whatsapp || 'https://wa.me/9609120011';
  const viberLink = s.business_viber || 'viber://chat?number=9609120011';
  const officeOrdersEnabled =
    s.office_orders_enabled !== '0' && s.office_orders_enabled !== 'false';
  const officeHeadline =
    s.office_orders_headline || t('home.corp_headline_default');
  const officeSubtext =
    s.office_orders_subtext || t('home.corp_sub_default');
  const officeMinGuests = Math.max(
    1,
    parseInt(s.office_orders_min_guests ?? '10', 10) || 10,
  );
  const logoSrc = s.logo || '/logo.png';
  const siteName = s.site_name || 'Bake & Grill';

  usePageTitle(null);

  // ── Load featured items (kept for potential future use, kept non-blocking) ─
  useEffect(() => {
    const loadFeatured = () => {
      fetchItems().catch(() => {});
    };
    loadFeatured();
    window.addEventListener('sales_channel_change', loadFeatured);
    return () => window.removeEventListener('sales_channel_change', loadFeatured);
  }, []);

  // ── Load ordering status + specials + reviews ──────────────────────────────
  useEffect(() => {
    fetchOnlineOrderingStatus()
      .then((gate) => {
        setIsOpen(gate.open);
        setHoursMsg(gate.open ? null : (gate.message ?? null));
        setHoursReason(gate.reason ?? null);
        setCurrentClose(gate.current_close ?? null);
        setNextOpenWindow(gate.next_open_window ?? null);
      })
      .catch(() => setIsOpen(false));

    fetchActiveSpecials()
      .then(({ specials: sp }) => {
        setSpecials((sp ?? []).slice(0, 6));
      })
      .catch(() => {});

    fetchFeaturedReviews(6)
      .then((res) => setReviews((res.reviews ?? []).filter((r) => r.comment)))
      .catch(() => {});
  }, []);

  // ── Load recent completed orders for reorder strip ─────────────────────────
  useEffect(() => {
    if (reorderFetched.current || !authReady || !isAuthenticated) return;
    reorderFetched.current = true;
    fetchCustomerOrders()
      .then(({ data }) => {
        const completed = (data ?? [])
          .filter((o) => ['completed', 'delivered', 'paid'].includes(o.status))
          .slice(0, 3);
        setRecentOrders(completed);
      })
      .catch(() => {});
  }, [authReady, isAuthenticated]);

  // ── Load loyalty points for stat chip ─────────────────────────────────────
  useEffect(() => {
    if (loyaltyFetched.current || !authReady) return;
    if (!isAuthenticated) {
      setChipsLoading(false);
      return;
    }
    loyaltyFetched.current = true;
    getLoyaltyAccount()
      .then((res) => {
        setLoyaltyPoints(res.account?.points_balance ?? null);
      })
      .catch(() => {
        setLoyaltyPoints(null);
      })
      .finally(() => setChipsLoading(false));
  }, [authReady, isAuthenticated]);

  // Chips stop loading once auth is ready and not authenticated
  useEffect(() => {
    if (!authReady) return;
    if (!isAuthenticated) setChipsLoading(false);
  }, [authReady, isAuthenticated]);

  // ── Reorder handler ────────────────────────────────────────────────────────
  const handleReorder = async (order: Order) => {
    if (!isAuthenticated) {
      void navigate('/account');
      return;
    }
    setReorderingId(order.id);
    try {
      const payload = await getReorderPayload(order.id);
      clearCart();
      for (const line of payload.items) {
        const fakeItem = {
          id: line.item_id,
          name: line.item_name,
          base_price: line.unit_price,
          has_variants: false,
          is_available: true,
        } as Item;
        const mods = (line.modifiers ?? []).map((m) => ({
          id: m.id,
          name: m.name,
          price: m.price ?? 0,
        }));
        addItem(fakeItem, line.quantity, mods, null);
      }
      void navigate('/checkout');
    } catch {
      void navigate('/menu');
    } finally {
      setReorderingId(null);
    }
  };

  const statusBadge =
    isOpen !== null ? (
      <OpeningStatusBadge
        className={isDesktopShell ? 'opening-status-badge-hero' : undefined}
        open={isOpen}
        reason={hoursReason}
        currentClose={currentClose}
        nextOpenWindow={nextOpenWindow}
        closedDetail={hoursMsg}
        timeDisplay="24h"
      />
    ) : null;

  const chipsProps = {
    loading: chipsLoading,
    isAuthenticated,
    loyaltyPoints,
    activeOrder: activeOrder
      ? { id: activeOrder.id, status: activeOrder.status }
      : null,
    specialsCount: specials.length,
  };

  return (
    <div className="home-page">
      {isDesktopShell ? (
        <>
          {/* Desktop/iPad: tight stack — prayer → hero (status on banner) → chips */}
          <div className="home-prayer-wrap">
            <PrayerBar />
          </div>
          <PromoCarousel
            slides={heroSlides}
            apiOrigin={API_ORIGIN}
            logoSrc={logoSrc}
            siteName={siteName}
            fallbackTitle={text('home_hero_fallback_title', '')}
            fallbackSubtitle={text('home_hero_fallback_subtitle', '')}
            statusSlot={statusBadge}
          />
          <StatChipsRow {...chipsProps} compact />
        </>
      ) : (
        <>
          {/* Phone: original stack — greeting → prayer → chips → hero */}
          <GreetingHeader
            customerName={customerName}
            isAuthenticated={isAuthenticated}
            statusBadge={statusBadge}
          />
          <div
            style={{
              padding: '0.35rem var(--page-gutter) 0.75rem',
              maxWidth: 'var(--layout-max)',
              margin: '0 auto',
            }}
          >
            <PrayerBar />
          </div>
          <StatChipsRow {...chipsProps} />
          <PromoCarousel
            slides={heroSlides}
            apiOrigin={API_ORIGIN}
            logoSrc={logoSrc}
            siteName={siteName}
            fallbackTitle={text('home_hero_fallback_title', '')}
            fallbackSubtitle={text('home_hero_fallback_subtitle', '')}
          />
        </>
      )}

      <ModeEntryCards />

      {/* ── 5b. Trust strip (CMS) ─────────────────────────────────────────── */}
      <TrustStrip items={trustItems} />

      {/* ── 5c. Category shortcuts (CMS) ──────────────────────────────────── */}
      <CategoryShortcuts
        categories={homepageCategories}
        eyebrow={text('home_categories_eyebrow', '')}
        title={text('home_categories_title', '')}
      />

      {/* ── 6. Today's specials ───────────────────────────────────────────── */}
      <SpecialsCarousel specials={specials} apiOrigin={API_ORIGIN} />

      {/* ── 7. Reorder strip ──────────────────────────────────────────────── */}
      <ReorderStrip
        orders={recentOrders}
        customerName={customerName}
        reorderingId={reorderingId}
        onReorder={(order) => void handleReorder(order)}
      />

      {reviews.length > 0 && (
        <section
          style={{
            padding: '1.25rem var(--page-gutter) 0.5rem',
            maxWidth: 'var(--layout-max)',
            margin: '0 auto',
          }}
        >
          <h2 style={{ fontSize: '1.1rem', fontWeight: 800, margin: '0 0 0.75rem', color: 'var(--color-dark)' }}>
            {text('order_home_reviews_title', text('home_proof_eyebrow', 'What guests say'))}
          </h2>
          <div style={{ display: 'flex', gap: '0.75rem', overflowX: 'auto', paddingBottom: 8 }}>
            {reviews.map((r) => (
              <article
                key={r.id}
                style={{
                  minWidth: 240,
                  maxWidth: 280,
                  flex: '0 0 auto',
                  background: 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 14,
                  padding: '0.9rem 1rem',
                }}
              >
                <p style={{ margin: '0 0 0.4rem', color: 'var(--color-primary)', fontWeight: 800, letterSpacing: 1 }}>
                  {'★'.repeat(r.rating)}{'☆'.repeat(Math.max(0, 5 - r.rating))}
                </p>
                <p style={{ margin: '0 0 0.5rem', fontSize: 13, lineHeight: 1.45, color: 'var(--color-dark)' }}>
                  “{r.comment}”
                </p>
                <p style={{ margin: 0, fontSize: 12, color: 'var(--color-text-muted)' }}>
                  — {r.author}{r.item?.name ? ` · ${r.item.name}` : ''}
                </p>
              </article>
            ))}
          </div>
        </section>
      )}

      {/* ── 8. Corporate / office catering block ─────────────────────────── */}
      {officeOrdersEnabled && (
        <section
          style={{
            borderTop: '1px solid var(--color-border)',
            padding: '2rem var(--page-gutter)',
            background: 'var(--color-surface-alt)',
          }}
        >
          <div
            style={{
              maxWidth: '520px',
              margin: '0 auto',
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-2xl)',
              padding: '1.5rem',
            }}
          >
            <div style={{ textAlign: 'center', marginBottom: '1.25rem' }}>
              <h2
                style={{
                  fontSize: 'clamp(1.2rem, 3vw, 1.5rem)',
                  fontWeight: 800,
                  color: 'var(--color-dark)',
                  margin: '0 0 0.5rem',
                }}
              >
                {officeHeadline}
              </h2>
              <p
                style={{
                  fontSize: '0.875rem',
                  color: 'var(--color-text-muted)',
                  margin: 0,
                  lineHeight: 1.55,
                }}
              >
                {officeSubtext}
              </p>
            </div>

            {corpMessage?.type === 'ok' ? (
              <div
                style={{
                  textAlign: 'center',
                  padding: '1.5rem',
                  background: 'var(--color-success-bg)',
                  borderRadius: 'var(--radius-xl)',
                  border: '1px solid rgba(16,185,129,0.25)',
                }}
              >
                <p
                  style={{
                    fontWeight: 700,
                    color: 'var(--color-success)',
                    margin: '0 0 0.35rem',
                  }}
                >
                  {t('home.corporate_thanks')}
                </p>
                <p
                  style={{
                    fontSize: '0.85rem',
                    color: 'var(--color-text-muted)',
                    margin: 0,
                  }}
                >
                  {corpMessage.text}
                </p>
              </div>
            ) : (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  setCorpMessage(null);
                  if (!corpForm.contact_name.trim() || !corpForm.phone.trim()) {
                    setCorpMessage({
                      type: 'err',
                      text: t('home.corp_name_required'),
                    });
                    return;
                  }
                  const headcount = corpForm.headcount
                    ? parseInt(corpForm.headcount, 10)
                    : undefined;
                  if (headcount != null && headcount < officeMinGuests) {
                    setCorpMessage({
                      type: 'err',
                      text: t('home.corp_min_guests').replace('{n}', String(officeMinGuests)),
                    });
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
                    setCorpForm({
                      contact_name: '',
                      phone: '',
                      company: '',
                      headcount: '',
                      notes: '',
                    });
                  } catch (err) {
                    setCorpMessage({
                      type: 'err',
                      text: (err as Error).message,
                    });
                  } finally {
                    setCorpSubmitting(false);
                  }
                }}
                style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}
              >
                {corpMessage?.type === 'err' && (
                  <p
                    style={{
                      color: 'var(--color-error)',
                      fontSize: '0.85rem',
                      margin: 0,
                    }}
                  >
                    {corpMessage.text}
                  </p>
                )}
                <input
                  required
                  placeholder={t('home.corp_ph_name')}
                  value={corpForm.contact_name}
                  onChange={(e) =>
                    setCorpForm((f) => ({ ...f, contact_name: e.target.value }))
                  }
                  style={corpInputStyle}
                />
                <input
                  required
                  placeholder={t('home.corp_ph_phone')}
                  value={corpForm.phone}
                  onChange={(e) =>
                    setCorpForm((f) => ({ ...f, phone: e.target.value }))
                  }
                  style={corpInputStyle}
                />
                <input
                  placeholder={t('home.corp_ph_company')}
                  value={corpForm.company}
                  onChange={(e) =>
                    setCorpForm((f) => ({ ...f, company: e.target.value }))
                  }
                  style={corpInputStyle}
                />
                <input
                  type="number"
                  min={officeMinGuests}
                  placeholder={t('home.corp_ph_headcount').replace('{n}', String(officeMinGuests))}
                  value={corpForm.headcount}
                  onChange={(e) =>
                    setCorpForm((f) => ({ ...f, headcount: e.target.value }))
                  }
                  style={corpInputStyle}
                />
                <textarea
                  placeholder={t('home.corp_ph_notes')}
                  value={corpForm.notes}
                  onChange={(e) =>
                    setCorpForm((f) => ({ ...f, notes: e.target.value }))
                  }
                  rows={3}
                  style={{ ...corpInputStyle, resize: 'vertical' }}
                />
                <button
                  type="submit"
                  disabled={corpSubmitting}
                  style={{
                    padding: '0.875rem',
                    background: 'var(--color-primary)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '12px',
                    fontWeight: 700,
                    fontSize: '0.95rem',
                    cursor: corpSubmitting ? 'wait' : 'pointer',
                    fontFamily: 'inherit',
                    opacity: corpSubmitting ? 0.7 : 1,
                  }}
                >
                  {corpSubmitting ? t('home.corp_sending') : t('home.corp_submit')}
                </button>
              </form>
            )}
          </div>
        </section>
      )}

      {/* ── 9. Brand footer ───────────────────────────────────────────────── */}
      <BrandFooter
        whatsappLink={waLink}
        viberLink={viberLink}
        logoSrc={logoSrc}
        siteName={siteName}
        tagline={text('footer_text', text('site_tagline', ''))}
        chatLabel={text('home_chat_label', '')}
      />
    </div>
  );
}
