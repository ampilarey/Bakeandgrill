import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  fetchItems,
  fetchOnlineOrderingStatus,
  fetchOffers,
  fetchCustomerOrders,
  getReorderPayload,
  fetchFeaturedReviews,
  fetchPageBlocks,
  API_ORIGIN,
  type FeaturedReview,
  type PageBlockRow,
} from '../api';
import type { Offer, Order } from '../api';
import { getLoyaltyAccount } from '../api/promotions';
import { usePageTitle } from '../hooks/usePageTitle';
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
import { StatChipsRow } from '../components/home/StatChipsRow';
import { PromoCarousel } from '../components/home/PromoCarousel';
import { ModeEntryCards } from '../components/home/ModeEntryCards';
import { TrustStrip } from '../components/home/TrustStrip';
import { CategoryShortcuts } from '../components/home/CategoryShortcuts';
import { SpecialsCarousel } from '../components/home/SpecialsCarousel';
import { ReorderStrip } from '../components/home/ReorderStrip';
import { BrandFooter } from '../components/home/BrandFooter';
import { renderGenericBlock } from '../components/home/blocks';
import { ServiceBanner } from '../components/ServiceBanner';
import { applyReorderPayloadToCart } from '../utils/applyReorderToCart';

/**
 * Safe fallback when page_blocks is empty or the request fails — never blank
 * the page. Owners can turn these off in a real layout; this is only a net.
 */
const REQUIRED_BLOCKS: PageBlockRow[] = [
  { id: -1, app: 'order_app', page: 'home', block_type: 'mode_cards', position: 0, is_enabled: true, content_mode: 'own', settings: {} },
  { id: -2, app: 'order_app', page: 'home', block_type: 'brand_footer', position: 1, is_enabled: true, content_mode: 'shared', settings: {} },
];

function deviceVisible(settings: Record<string, unknown> | undefined, isDesktop: boolean): boolean {
  const key = isDesktop ? 'show_desktop' : 'show_mobile';
  const v = settings?.[key];
  if (v === undefined || v === null) return true;
  return Boolean(v);
}

function placementOf(settings: Record<string, unknown> | undefined, isDesktop: boolean): 'home' | 'header' {
  const key = isDesktop ? 'placement_desktop' : 'placement_mobile';
  const v = settings?.[key];
  return v === 'header' ? 'header' : 'home';
}

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
  const [pageBlocks, setPageBlocks] = useState<PageBlockRow[] | null>(null);
  const {
    settings: s,
    heroSlides,
    trustItems,
    homepageCategories,
    text,
  } = useSiteSettingsContext();
  const { isAuthenticated, authReady, customerName } = useAuth();
  const { t } = useLanguage();
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
  const logoSrc = s.logo || '/logo.png';
  const siteName = s.site_name || 'Bake & Grill';

  usePageTitle(null);

  // ── Home layout from page_blocks (the only source) ─────────────────────────
  useEffect(() => {
    const previewToken = new URLSearchParams(window.location.search).get('previewToken');
    fetchPageBlocks({ app: 'order_app', previewToken })
      .then((res) => {
        const rows = (res.blocks ?? []).filter((b) => b.is_enabled);
        setPageBlocks(rows.length > 0 ? rows : REQUIRED_BLOCKS);
      })
      .catch(() => setPageBlocks(REQUIRED_BLOCKS));
  }, []);

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

  const blocks = pageBlocks ?? REQUIRED_BLOCKS;

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

  const officeBlock = (key: string) =>
    officeOrdersEnabled ? (
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
    ) : null;

  const nodes: ReactNode[] = [];

  for (const block of blocks) {
    if (!block.is_enabled) continue;
    if (!deviceVisible(block.settings, isDesktopShell)) continue;

    const key = `${block.block_type}-${block.id}-${block.position}`;
    const type = block.block_type === 'promo_carousel' ? 'hero' : block.block_type;

    switch (type) {
      case 'greeting':
        nodes.push(
          <GreetingHeader
            key={key}
            customerName={customerName}
            isAuthenticated={isAuthenticated}
            chrome={isDesktopShell ? 'desktop' : 'phone'}
          />,
        );
        break;
      case 'prayer_bar': {
        if (placementOf(block.settings, isDesktopShell) !== 'home') break;
        nodes.push(
          <div key={key} className="home-prayer-wrap" data-home-block="prayer_bar">
            <PrayerBar />
          </div>,
        );
        break;
      }
      case 'announcement': {
        if (placementOf(block.settings, isDesktopShell) !== 'home') break;
        const annText = (s.announcement_text || '').trim();
        if (s.announcement_enabled !== 'true' || !annText) break;
        nodes.push(
          <div
            key={key}
            data-home-block="announcement"
            role="status"
            style={{
              width: '100%',
              padding: '0.55rem 1.25rem',
              background: 'var(--color-primary-light)',
              borderBottom: '1px solid var(--color-border)',
              color: 'var(--color-primary)',
              fontSize: '0.85rem',
              fontWeight: 600,
              textAlign: 'center',
            }}
          >
            {annText}
          </div>,
        );
        break;
      }
      case 'service_availability':
        nodes.push(
          <div key={key} data-home-block="service_availability">
            <ServiceBanner />
          </div>,
        );
        break;
      case 'hero':
        nodes.push(
          <PromoCarousel
            key={key}
            slides={heroSlides}
            apiOrigin={API_ORIGIN}
            logoSrc={logoSrc}
            siteName={siteName}
            fallbackTitle={text('home_hero_fallback_title', '')}
            fallbackSubtitle={text('home_hero_fallback_subtitle', '')}
            statusSlot={null}
          />,
        );
        break;
      case 'stat_chips':
        nodes.push(
          <StatChipsRow
            key={key}
            {...chipsProps}
            hideLoyalty={!isDesktopShell}
          />,
        );
        break;
      case 'opening_status':
        if (statusBadge) {
          nodes.push(
            <div key={key} className="home-standalone-status" data-testid="home-standalone-status" data-home-block="opening_status">
              {statusBadge}
            </div>,
          );
        }
        break;
      case 'mode_cards':
        nodes.push(<ModeEntryCards key={key} />);
        break;
      case 'trust_strip':
        nodes.push(<TrustStrip key={key} items={trustItems} />);
        break;
      case 'specials':
        nodes.push(<SpecialsCarousel key={key} offers={offers} apiOrigin={API_ORIGIN} />);
        break;
      case 'reviews':
        if (reviewSection) nodes.push(<div key={key}>{reviewSection}</div>);
        break;
      case 'categories':
        nodes.push(
          <CategoryShortcuts
            key={key}
            categories={homepageCategories}
            eyebrow={text('home_categories_eyebrow', '')}
            title={text('home_categories_title', '')}
          />,
        );
        break;
      case 'featured':
      case 'proof':
      case 'cta':
      case 'location':
        nodes.push(
          <section
            key={key}
            data-home-block={type}
            style={{
              padding: '1.25rem var(--page-gutter)',
              maxWidth: 'var(--layout-max)',
              margin: '0 auto',
            }}
          >
            <a
              href={type === 'cta' || type === 'featured' ? '/menu' : type === 'location' ? '/contact' : '/'}
              style={{ fontWeight: 700, color: 'var(--color-primary)' }}
            >
              {type === 'featured' && (text('home_featured_title', 'Featured items') || 'Featured items')}
              {type === 'proof' && (text('home_proof_eyebrow', 'Why guests choose us') || 'Why guests choose us')}
              {type === 'cta' && (text('cta_band_headline', 'Hungry?') || 'Hungry?')}
              {type === 'location' && (text('home_visit_card_title', 'Visit us') || 'Visit us')}
            </a>
          </section>,
        );
        break;
      case 'events_band':
        nodes.push(
          <section
            key={key}
            data-home-block="events_band"
            style={{
              padding: '2rem var(--page-gutter)',
              borderTop: '1px solid var(--color-border)',
              textAlign: 'center',
            }}
          >
            <h2 style={{ fontWeight: 800, margin: '0 0 0.5rem' }}>
              {text('events_section_headline', 'Events & Catering')}
            </h2>
            <p style={{ color: 'var(--color-text-muted)', margin: '0 0 1rem' }}>
              {text('events_section_blurb', '')}
            </p>
            <button type="button" onClick={() => navigate('/events')} style={{ fontWeight: 700 }}>
              {text('events_section_plan_cta', 'Plan your event')}
            </button>
          </section>,
        );
        break;
      case 'office_orders': {
        const node = officeBlock(key);
        if (node) nodes.push(node);
        break;
      }
      case 'reorder_strip':
        nodes.push(
          <ReorderStrip
            key={key}
            orders={recentOrders}
            customerName={customerName}
            reorderingId={reorderingId}
            onReorder={(order) => void handleReorder(order)}
          />,
        );
        break;
      case 'brand_footer':
        nodes.push(
          <BrandFooter
            key={key}
            whatsappLink={waLink}
            viberLink={viberLink}
            logoSrc={logoSrc}
            siteName={siteName}
            blurb={text('footer_text', '')}
            thanks={text('footer_thanks', '')}
            chatLabel={text('home_chat_label', '')}
          />,
        );
        break;
      default: {
        const generic = renderGenericBlock(
          type,
          key,
          block.settings ?? {},
          block.media ?? null,
          API_ORIGIN,
        );
        if (generic) nodes.push(generic);
        break;
      }
    }
  }

  return <div className="home-page">{nodes}</div>;
}
