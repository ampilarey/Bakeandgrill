import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { fetchOnlineOrderingStatus } from '../../api';
import { useCart } from '../../context/CartContext';
import { useLanguage } from '../../context/LanguageContext';
import { useServiceStatusContext } from '../../context/ServiceStatusContext';
import { useShellNav } from '../../context/ShellNavContext';
import { useSiteSettingsContext } from '../../context/SiteSettingsContext';
import { cartCheckoutCta } from '../../utils/collectOn';
import { isEventFlowPath } from '../../utils/eventFlowPath';
import { CartSheet } from '../CartSheet';

function formatOpenTime(iso: string | null | undefined): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  } catch {
    return '';
  }
}

/**
 * Logo cart FAB → CartSheet. All breakpoints — only when the cart has items.
 * Hidden on event/quote flows so the immediate cart doesn't compete with event lines.
 * While ordering is closed the cart stays visible; the CTA says when it reopens
 * (or "Ordering is closed") instead of offering checkout.
 */
export function FloatingCartBar() {
  const { t } = useLanguage();
  const { cart, cartTotal } = useCart();
  const { hideNav, cartSheetOpen, openCartSheet, closeCartSheet } = useShellNav();
  const { settings: s } = useSiteSettingsContext();
  const { isAvailable, get } = useServiceStatusContext();
  const location = useLocation();
  const [orderingOpen, setOrderingOpen] = useState(true);
  const [nextOpenWindow, setNextOpenWindow] = useState<string | null>(null);
  const [tomorrowOrderingOpen, setTomorrowOrderingOpen] = useState(true);
  const checkoutAvailable = isAvailable('online_checkout');
  const orderingServiceAvailable = isAvailable('online_ordering');
  const checkoutState = get('online_checkout');
  const orderingState = get('online_ordering');
  const servicesOk = checkoutAvailable && orderingServiceAvailable;
  /** Hours + services — drives closed UI / tip; tomorrow path uses hours alone. */
  const effectiveOpen = orderingOpen && servicesOk;

  /** Single derived CTA — CartSheet/CartDrawer must not invent a second rule. */
  const checkoutCta = cartCheckoutCta({
    shopOpen: orderingOpen,
    orderingEnabled: servicesOk,
    tomorrowOrderingEnabled: tomorrowOrderingOpen,
    lines: cart.map((e) => ({ allow_pre_order: e.item?.allow_pre_order })),
  });

  const closedCta = (() => {
    if (effectiveOpen) return null;
    // Tomorrow-eligible carts (hours closed, services on) get an enabled
    // checkout label — keep reopen copy off so it doesn't fight the CTA.
    if (checkoutCta.checkoutForTomorrow) return null;
    if (!orderingServiceAvailable) {
      return orderingState?.public_message?.trim() || t('cart.closed_cta');
    }
    if (!checkoutAvailable) {
      return checkoutState?.public_message?.trim() || t('cart.closed_cta');
    }
    const openAt = formatOpenTime(nextOpenWindow);
    if (openAt) return t('cart.opens_at_cta').replace('{time}', openAt);
    return t('cart.closed_cta');
  })();

  const count = cart.reduce((sum, e) => sum + e.quantity, 0);
  const logoSrc = s.logo || '/logo.png';
  const onEventFlow = isEventFlowPath(location.pathname);

  useEffect(() => {
    let cancelled = false;
    fetchOnlineOrderingStatus()
      .then((gate) => {
        if (cancelled) return;
        setOrderingOpen(gate.open);
        setNextOpenWindow(gate.open ? null : (gate.next_open_window ?? null));
        setTomorrowOrderingOpen(gate.order_for_tomorrow?.open !== false);
      })
      .catch(() => {
        if (!cancelled) {
          setOrderingOpen(true);
          setNextOpenWindow(null);
          setTomorrowOrderingOpen(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if ((count === 0 || onEventFlow) && cartSheetOpen) closeCartSheet();
  }, [count, onEventFlow, cartSheetOpen, closeCartSheet]);

  const showFab =
    !hideNav &&
    !onEventFlow &&
    count > 0 &&
    !location.pathname.startsWith('/checkout');

  if (!showFab && !cartSheetOpen) {
    return null;
  }

  return (
    <>
      {showFab && (
        <button
          type="button"
          className="float-cart-fab"
          onClick={() => openCartSheet()}
          aria-expanded={cartSheetOpen}
          aria-label={`${t('cart.view')} — ${count} — ${Math.round(cartTotal)}/-`}
        >
          <span className="float-cart-fab__logo-wrap">
            <img
              className="float-cart-fab__logo"
              src={logoSrc}
              alt=""
              width={56}
              height={56}
              decoding="async"
            />
            <span className="float-cart-fab__badge" aria-hidden>
              {count > 99 ? '99+' : count}
            </span>
          </span>
          <span className="float-cart-fab__total" aria-hidden>
            {Math.round(cartTotal)}/-
          </span>
        </button>
      )}

      <CartSheet
        open={cartSheetOpen}
        onClose={closeCartSheet}
        isOpen={effectiveOpen}
        closedMessage={closedCta}
        canCheckout={checkoutCta.canCheckout}
        checkoutForTomorrow={checkoutCta.checkoutForTomorrow}
      />
    </>
  );
}
