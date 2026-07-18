import { useEffect, useState, type MouseEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { fetchOnlineOrderingStatus } from '../../api';
import { useCart } from '../../context/CartContext';
import { useLanguage } from '../../context/LanguageContext';
import { useShellNav } from '../../context/ShellNavContext';
import { useSiteSettingsContext } from '../../context/SiteSettingsContext';
import { CartSheet } from '../CartSheet';

/**
 * ZUS-style minimized cart bar above BottomNav.
 * Logo + count badge · total · Checkout. Tap bar/logo expands CartSheet.
 */
export function FloatingCartBar() {
  const { t } = useLanguage();
  const { cart, cartTotal } = useCart();
  const { hideNav, cartSheetOpen, openCartSheet, closeCartSheet } = useShellNav();
  const { settings: s } = useSiteSettingsContext();
  const location = useLocation();
  const navigate = useNavigate();
  const [orderingOpen, setOrderingOpen] = useState(true);
  const [closedMessage, setClosedMessage] = useState<string | null>(null);

  const count = cart.reduce((sum, e) => sum + e.quantity, 0);
  const logoSrc = s.logo || '/logo.png';
  const siteName = s.site_name || 'Bake & Grill';

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

  // Close sheet if cart becomes empty while open.
  useEffect(() => {
    if (count === 0 && cartSheetOpen) closeCartSheet();
  }, [count, cartSheetOpen, closeCartSheet]);

  const hidden =
    hideNav ||
    count === 0 ||
    location.pathname.startsWith('/checkout');

  if (hidden && !cartSheetOpen) {
    return null;
  }

  const expand = () => openCartSheet();

  const goCheckout = (e: MouseEvent) => {
    e.stopPropagation();
    closeCartSheet();
    navigate('/checkout');
  };

  return (
    <>
      {!hidden && (
        <div
          className="float-cart-bar"
          role="region"
          aria-label={`${t('cart.view')} — ${count}`}
        >
          <button
            type="button"
            className="float-cart-bar__main"
            onClick={expand}
            aria-expanded={cartSheetOpen}
            aria-label={t('cart.view')}
          >
            <span className="float-cart-bar__logo-wrap">
              <img
                className="float-cart-bar__logo"
                src={logoSrc}
                alt=""
                width={52}
                height={52}
                decoding="async"
              />
              <span className="float-cart-bar__badge" aria-hidden>
                {count > 99 ? '99+' : count}
              </span>
            </span>
            <span className="float-cart-bar__meta">
              <span className="float-cart-bar__brand">{siteName}</span>
              <span className="float-cart-bar__total">
                MVR {cartTotal.toFixed(2)}
              </span>
            </span>
          </button>

          <button
            type="button"
            className="float-cart-bar__checkout"
            onClick={goCheckout}
            disabled={!orderingOpen}
          >
            {t('cart.checkout_short')}
          </button>
        </div>
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
