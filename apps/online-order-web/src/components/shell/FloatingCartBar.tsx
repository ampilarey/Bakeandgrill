import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { fetchOnlineOrderingStatus } from '../../api';
import { useCart } from '../../context/CartContext';
import { useLanguage } from '../../context/LanguageContext';
import { useShellNav } from '../../context/ShellNavContext';
import { useSiteSettingsContext } from '../../context/SiteSettingsContext';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { CartSheet } from '../CartSheet';
import { isMenuPath, MENU_CART_SIDEBAR_MQ } from './navTabs';

/**
 * Logo cart FAB → CartSheet, only when the cart has items.
 * Hidden on Menu ≥900px where the inline cart sidebar already shows the cart.
 */
export function FloatingCartBar() {
  const { t } = useLanguage();
  const { cart, cartTotal } = useCart();
  const { hideNav, cartSheetOpen, openCartSheet, closeCartSheet } = useShellNav();
  const { settings: s } = useSiteSettingsContext();
  const location = useLocation();
  const menuHasSidebar = useMediaQuery(MENU_CART_SIDEBAR_MQ);
  const [orderingOpen, setOrderingOpen] = useState(true);
  const [closedMessage, setClosedMessage] = useState<string | null>(null);

  const count = cart.reduce((sum, e) => sum + e.quantity, 0);
  const logoSrc = s.logo || '/logo.png';
  const onMenuWithSidebar = isMenuPath(location.pathname) && menuHasSidebar;

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
    if (count === 0 && cartSheetOpen) closeCartSheet();
  }, [count, cartSheetOpen, closeCartSheet]);

  // Don't stack FAB over the desktop menu sidebar.
  useEffect(() => {
    if (onMenuWithSidebar && cartSheetOpen) closeCartSheet();
  }, [onMenuWithSidebar, cartSheetOpen, closeCartSheet]);

  const showFab =
    !hideNav &&
    count > 0 &&
    !location.pathname.startsWith('/checkout') &&
    !onMenuWithSidebar;

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
        isOpen={orderingOpen}
        closedMessage={closedMessage}
      />
    </>
  );
}
