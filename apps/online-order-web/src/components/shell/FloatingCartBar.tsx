import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { fetchOnlineOrderingStatus } from '../../api';
import { useCart } from '../../context/CartContext';
import { useLanguage } from '../../context/LanguageContext';
import { useServiceStatusContext } from '../../context/ServiceStatusContext';
import { useShellNav } from '../../context/ShellNavContext';
import { useSiteSettingsContext } from '../../context/SiteSettingsContext';
import { isEventFlowPath } from '../../utils/eventFlowPath';
import { CartSheet } from '../CartSheet';

/**
 * Logo cart FAB → CartSheet. All breakpoints — only when the cart has items.
 * Hidden on event/quote flows so the immediate cart doesn't compete with event lines.
 */
export function FloatingCartBar() {
  const { t } = useLanguage();
  const { cart, cartTotal } = useCart();
  const { hideNav, cartSheetOpen, openCartSheet, closeCartSheet } = useShellNav();
  const { settings: s } = useSiteSettingsContext();
  const { isAvailable, get } = useServiceStatusContext();
  const location = useLocation();
  const [orderingOpen, setOrderingOpen] = useState(true);
  const [closedMessage, setClosedMessage] = useState<string | null>(null);
  const checkoutAvailable = isAvailable('online_checkout');
  const orderingServiceAvailable = isAvailable('online_ordering');
  const checkoutState = get('online_checkout');
  const orderingState = get('online_ordering');
  const effectiveOpen = orderingOpen && checkoutAvailable && orderingServiceAvailable;
  const effectiveMessage = !orderingServiceAvailable
    ? (orderingState?.public_message?.trim() || t('cart.closed_cta'))
    : !checkoutAvailable
      ? (checkoutState?.public_message ?? 'Online checkout is temporarily unavailable.')
      : (closedMessage || (!orderingOpen ? t('cart.closed_cta') : null));

  const count = cart.reduce((sum, e) => sum + e.quantity, 0);
  const logoSrc = s.logo || '/logo.png';
  const onEventFlow = isEventFlowPath(location.pathname);

  useEffect(() => {
    let cancelled = false;
    fetchOnlineOrderingStatus()
      .then((gate) => {
        if (cancelled) return;
        setOrderingOpen(gate.open);
        setClosedMessage(gate.open ? null : (gate.message ?? null));
      })
      .catch(() => {
        if (!cancelled) setOrderingOpen(true);
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
        closedMessage={effectiveMessage}
      />
    </>
  );
}
