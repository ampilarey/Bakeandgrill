import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  fetchItems,
  fetchOnlineOrderingStatus,
  fetchOffers,
  fetchCustomerOrders,
  getReorderPayload,
  fetchFeaturedReviews,
  API_ORIGIN,
  type FeaturedReview,
  type PageBlockRow,
} from '../api';
import type { Offer, Order } from '../api';
import { getLoyaltyAccount } from '../api/promotions';
import { usePageTitle } from '../hooks/usePageTitle';
import { usePageBlocks } from '../context/PageBlocksContext';
import { useSiteSettingsContext } from '../context/SiteSettingsContext';
import { OpeningStatusBadge } from '../components/OpeningStatusBadge';
import { TomorrowOrderingBadge } from '../components/TomorrowOrderingBadge';
import { PrayerBar } from '../components/PrayerBar';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { DESKTOP_SHELL_MQ } from '../components/shell/navTabs';

import { GreetingHeader } from '../components/home/GreetingHeader';
import { HomePhoneHeader } from '../components/home/HomePhoneHeader';
import { StatChipsRow } from '../components/home/StatChipsRow';
import { PromoCarousel } from '../components/home/PromoCarousel';
import { ModeEntryCards } from '../components/home/ModeEntryCards';
import { TrustStrip } from '../components/home/TrustStrip';
import { CategoryShortcuts } from '../components/home/CategoryShortcuts';
import { SpecialsCarousel } from '../components/home/SpecialsCarousel';
import { ReorderStrip } from '../components/home/ReorderStrip';
import { BrandFooter } from '../components/home/BrandFooter';
import { renderGenericBlock } from '../components/home/blocks';
import { applyReorderPayloadToCart } from '../utils/applyReorderToCart';
import { blocksForSurface } from '../utils/surfaceBlocks';

/**
 * page_blocks is the only source of the home layout. When empty/failed we keep
 * a minimal safe path into ordering — never blank, never silent chrome injects.
 */
const REQUIRED_BLOCKS: PageBlockRow[] = [
  { id: -1, app: 'order_app', page: 'home', block_type: 'mode_cards', position: 0, is_enabled: true, content_mode: 'own', settings: {} },
  { id: -2, app: 'order_app', page: 'home', block_type: 'brand_footer', position: 1, is_enabled: true, content_mode: 'shared', settings: { placement_desktop: 'footer', placement_mobile: 'footer' } },
];

export function HomePage() {
  const navigate = useNavigate();
  const { addItem, clearCart } = useCart();

  // ── Data state ─────────────────────────────────────────────────────────────
  const [offers, setOffers] = useState<Offer[]>([]);
  const [reviews, setReviews] = useState<FeaturedReview[]>([]);
  const [isOpen, setIsOpen] = useState<boolean | null>(null);
  const [hoursMsg, setHoursMsg] = useState<string | null>(null);
  const [hoursReason, setHoursReason] = useState<
    'master_switch_off' | 'schedule' | 'override_active' | null
  >(null);
  const [currentClose, setCurrentClose] = useState<string | null>(null);
  const [nextOpenWindow, setNextOpenWindow] = useState<string | null>(null);
  /** Collect-tomorrow gate (null until loaded). Independent of today’s online ordering. */
  const [tomorrowOpen, setTomorrowOpen] = useState<boolean | null>(null);
  const [recentOrders, setRecentOrders] = useState<Order[]>([]);
  const [reorderingId, setReorderingId] = useState<number | null>(null);
  const [loyaltyPoints, setLoyaltyPoints] = useState<number | null>(null);
  const [chipsLoading, setChipsLoading] = useState(true);
  const { blocks: rawPageBlocks, loading: pageBlocksLoading } = usePageBlocks();
  const pageBlocks =
    pageBlocksLoading && rawPageBlocks.length === 0
      ? null
      : (() => {
          const rows = rawPageBlocks.filter((b) => b.is_enabled);
          return rows.length > 0 ? rows : REQUIRED_BLOCKS;
        })();
  const {
    settings: s,
    heroSlides,
    trustItems,
    homepageCategories,
    text,
  } = useSiteSettingsContext();
  const { isAuthenticated, authReady, customerName } = useAuth();
  const { t } = useLanguage();
  /** Desktop/iPad uses TopNav; phone uses a sticky HomePhoneHeader. */
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
  const logoSrc = s.logo || '/logo.png';
  const siteName = s.site_name || 'Bake & Grill';

  usePageTitle(null);

  // ── Tomorrow-ordering gate (separate from today’s online ordering badge) ───
  // Open only when the owner gate is on AND at least one item allows pre-order.
  useEffect(() => {
    const loadTomorrowStatus = () => {
      Promise.all([fetchItems(), fetchOnlineOrderingStatus().catch(() => null)])
        .then(([{ data }, gate]) => {
          const gateOpen = gate?.order_for_tomorrow?.open !== false;
          const hasItems = (data ?? []).some((item) => Boolean(item.allow_pre_order));
          setTomorrowOpen(gateOpen && hasItems);
        })
        .catch(() => setTomorrowOpen(false));
    };
    loadTomorrowStatus();
    window.addEventListener('sales_channel_change', loadTomorrowStatus);
    return () => window.removeEventListener('sales_channel_change', loadTomorrowStatus);
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

    fetchOffers()
      .then(({ offers: rows }) => {
        const seen = new Set<string>();
        const unique = (rows ?? []).filter((o) => {
          if (seen.has(o.id)) return false;
          seen.add(o.id);
          return true;
        });
        setOffers(unique.slice(0, 12));
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
      const { added, needsPickerCount } = applyReorderPayloadToCart(payload, addItem);
      if (needsPickerCount > 0 && added === 0) {
        void navigate('/menu');
        return;
      }
      void navigate(needsPickerCount > 0 ? '/menu' : '/checkout');
    } catch {
      void navigate('/menu');
    } finally {
      setReorderingId(null);
    }
  };

  const statusBadge =
    isOpen !== null || tomorrowOpen !== null ? (
      <div className="home-ordering-status-stack" data-testid="home-ordering-status-stack">
        {isOpen !== null ? (
          <OpeningStatusBadge
            open={isOpen}
            reason={hoursReason}
            currentClose={currentClose}
            nextOpenWindow={nextOpenWindow}
            closedDetail={hoursMsg}
            timeDisplay="24h"
          />
        ) : null}
        <TomorrowOrderingBadge
          open={tomorrowOpen}
          openLabel={t('status.tomorrow_open')}
          closedLabel={t('status.tomorrow_closed')}
        />
      </div>
    ) : null;

  const chipsProps = {
    loading: chipsLoading,
    isAuthenticated,
    loyaltyPoints,
  };

  const allBlocks = pageBlocks ?? REQUIRED_BLOCKS;
  const device = isDesktopShell ? 'desktop' : 'mobile';
  const homeBlocks = blocksForSurface(allBlocks, device, 'home', true);
  const footerBlocks = blocksForSurface(allBlocks, device, 'footer', true);
  const openingStatusEnabled = allBlocks.some(
    (b) => b.block_type === 'opening_status' && b.is_enabled,
  );
  const heroEnabled = homeBlocks.some(
    (b) => b.block_type === 'hero' || b.block_type === 'promo_carousel',
  );
  const heroStatusSlot = openingStatusEnabled && heroEnabled ? statusBadge : null;

  const reviewSection = reviews.length > 0 ? (
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
  ) : null;

  const officeBlockNode = (key: string) => (
    <section
      key={key}
      data-home-block="office_orders"
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
        <button
          type="button"
          onClick={() => navigate('/events')}
          style={{
            width: '100%',
            padding: '0.875rem',
            background: 'var(--color-primary)',
            color: '#fff',
            border: 'none',
            borderRadius: '12px',
            fontWeight: 700,
            fontSize: '0.95rem',
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          Plan your event
        </button>
      </div>
    </section>
  );

  const renderBlock = (block: PageBlockRow): ReactNode => {
    const key = `${block.block_type}-${block.id}-${block.position}`;
    switch (block.block_type) {
      case 'greeting':
        return (
          <GreetingHeader
            key={key}
            customerName={customerName}
            isAuthenticated={isAuthenticated}
            chrome={isDesktopShell ? 'desktop' : 'phone'}
          />
        );
      case 'prayer_bar':
        return (
          <div key={key} className="home-prayer-wrap" data-home-block="prayer_bar">
            <PrayerBar />
          </div>
        );
      case 'hero':
      case 'promo_carousel':
        return (
          <PromoCarousel
            key={key}
            slides={heroSlides}
            apiOrigin={API_ORIGIN}
            logoSrc={logoSrc}
            siteName={siteName}
            fallbackTitle={text('home_hero_fallback_title', '')}
            fallbackSubtitle={text('home_hero_fallback_subtitle', '')}
            statusSlot={heroStatusSlot}
          />
        );
      case 'opening_status':
        if (!heroEnabled && statusBadge) {
          return (
            <div key={key} className="home-standalone-status" data-testid="home-standalone-status" data-home-block="opening_status">
              {statusBadge}
            </div>
          );
        }
        return null;
      case 'stat_chips':
        return (
          <StatChipsRow
            key={key}
            {...chipsProps}
            hideLoyalty={!isDesktopShell}
          />
        );
      case 'mode_cards':
        return <ModeEntryCards key={key} />;
      case 'trust_strip':
        return <TrustStrip key={key} items={trustItems} />;
      case 'specials':
        return <SpecialsCarousel key={key} offers={offers} apiOrigin={API_ORIGIN} />;
      case 'reviews':
        return reviewSection ? <div key={key} data-home-block="reviews">{reviewSection}</div> : null;
      case 'categories':
        return (
          <CategoryShortcuts
            key={key}
            categories={homepageCategories}
            eyebrow={text('home_categories_eyebrow', '')}
            title={text('home_categories_title', '')}
          />
        );
      case 'reorder_strip':
        return (
          <ReorderStrip
            key={key}
            orders={recentOrders}
            customerName={customerName}
            reorderingId={reorderingId}
            onReorder={(order) => void handleReorder(order)}
          />
        );
      case 'office_orders':
        return officeOrdersEnabled ? officeBlockNode(key) : null;
      case 'brand_footer':
      case 'site_footer':
        return (
          <BrandFooter
            key={key}
            whatsappLink={waLink}
            viberLink={viberLink}
            logoSrc={logoSrc}
            siteName={siteName}
            blurb={text('footer_text', '')}
            thanks={text('footer_thanks', '')}
            chatLabel={text('home_chat_label', 'Chat with us')}
          />
        );
      case 'announcement':
      case 'service_availability':
      case 'featured':
      case 'proof':
      case 'cta':
      case 'location':
      case 'events_band':
      case 'bottom_nav':
        // announcement/service/bottom_nav are shell chrome; featured/proof/cta/location/events
        // use generic or dedicated renderers when present.
        break;
      default:
        break;
    }

    const generic = renderGenericBlock(
      block.block_type,
      key,
      block.settings ?? {},
      block.media ?? null,
      API_ORIGIN,
    );
    return generic;
  };

  const nodes: ReactNode[] = [];
  for (const block of homeBlocks) {
    const node = renderBlock(block);
    if (node) nodes.push(node);
  }
  for (const block of footerBlocks) {
    if (block.block_type === 'bottom_nav') continue;
    const node = renderBlock(block);
    if (node) nodes.push(node);
  }

  return (
    <div className="home-page" data-surface={`order_app.${device}.home`}>
      {!isDesktopShell ? (
        <HomePhoneHeader
          customerName={customerName}
          isAuthenticated={isAuthenticated}
        />
      ) : null}
      {nodes}
    </div>
  );
}
