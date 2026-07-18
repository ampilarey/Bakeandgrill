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

import { GreetingHeader } from '../components/home/GreetingHeader';
import { StatChipsRow } from '../components/home/StatChipsRow';
import { PromoCarousel } from '../components/home/PromoCarousel';
import { ModeEntryCards } from '../components/home/ModeEntryCards';
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

  const { settings: s, heroSlides } = useSiteSettingsContext();
  const { isAuthenticated, authReady, customerName } = useAuth();
  const { t } = useLanguage();
  const { activeOrder } = useActiveOrder();
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

    // Fetch reviews but don't render them (wireframe §11 excludes reviews)
    fetchFeaturedReviews(6).catch(() => {});
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

  // ── Opening status badge (passed into GreetingHeader) ─────────────────────
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
    ) : null;

  return (
    <div>
      {/* ── 1. Greeting + avatar/sign-in + opening badge ──────────────────── */}
      <GreetingHeader
        customerName={customerName}
        isAuthenticated={isAuthenticated}
        statusBadge={statusBadge}
      />

      {/* ── 2. Prayer banner (§12) — no top portal strip on Home ──────────── */}
      <div
        style={{
          padding: '16px var(--page-gutter) 24px',
          maxWidth: 'var(--layout-max)',
          margin: '0 auto',
        }}
      >
        <PrayerBar />
      </div>

      {/* ── 3. Stat chips (loyalty / active order / specials) ─────────────── */}
      <StatChipsRow
        loading={chipsLoading}
        isAuthenticated={isAuthenticated}
        loyaltyPoints={loyaltyPoints}
        activeOrder={
          activeOrder
            ? { id: activeOrder.id, status: activeOrder.status }
            : null
        }
        specialsCount={specials.length}
      />

      {/* ── 4. Promo carousel (16:9) ──────────────────────────────────────── */}
      <PromoCarousel slides={heroSlides} apiOrigin={API_ORIGIN} />

      {/* ── 5. Mode entry cards (Delivery / Pickup) ───────────────────────── */}
      <ModeEntryCards />

      {/* ── 6. Today's specials ───────────────────────────────────────────── */}
      <SpecialsCarousel specials={specials} apiOrigin={API_ORIGIN} />

      {/* ── 7. Reorder strip ──────────────────────────────────────────────── */}
      <ReorderStrip
        orders={recentOrders}
        customerName={customerName}
        reorderingId={reorderingId}
        onReorder={(order) => void handleReorder(order)}
      />

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
      />
    </div>
  );
}
