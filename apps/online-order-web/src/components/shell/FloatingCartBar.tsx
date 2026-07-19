import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { fetchOnlineOrderingStatus } from '../../api';
import { useCart } from '../../context/CartContext';
import { useLanguage } from '../../context/LanguageContext';
import { useShellNav } from '../../context/ShellNavContext';
import { useSiteSettingsContext } from '../../context/SiteSettingsContext';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { CartSheet } from '../CartSheet';
import { DESKTOP_SHELL_MQ } from './navTabs';

/**
 * Phone: ZUS-style cart FAB (logo + badge + total) → CartSheet.
 * Tablet/desktop (≥768): FAB hidden — TopNav cart opens the same sheet.
 * Menu ≥900 already has a cart sidebar; FAB stays phone-only so they never stack.
 */
export function FloatingCartBar() {
  const { t } = useLanguage();
  const { cart, cartTotal } = useCart();
  const { hideNav, cartSheetOpen, openCartSheet, closeCartSheet } = useShellNav();
  const { settings: s } = useSiteSettingsContext();
  const location = useLocation();
  const isDesktopShell = useMediaQuery(DESKTOP_SHELL_MQ);
  const [orderingOpen, setOrderingOpen] = useState(true);
  const [closedMessage, setClosedMessage] = useState<string | null>(null);

  const count = cart.reduce((sum, e) => sum + e.quantity, 0);
  const logoSrc = s.logo || '/logo.png';

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

  const showFab =
    !hideNav &&
    !isDesktopShell &&
    count > 0 &&
    !location.pathname.startsWith('/checkout');

  // Keep mounted whenever the sheet is open (TopNav opens it on desktop)
  // or the phone FAB is visible.
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
