import { Link, useLocation } from 'react-router-dom';
import { useCart } from '../../context/CartContext';
import { useLanguage } from '../../context/LanguageContext';
import { useShellNav } from '../../context/ShellNavContext';

/**
 * Persistent cart CTA above BottomNav. Visible when cart has items (except checkout).
 */
export function FloatingCartBar() {
  const { t } = useLanguage();
  const { cart, cartTotal } = useCart();
  const { hideNav } = useShellNav();
  const location = useLocation();
  const count = cart.reduce((s, e) => s + e.quantity, 0);

  if (
    hideNav ||
    count === 0 ||
    location.pathname.startsWith('/checkout')
  ) {
    return null;
  }

  return (
    <Link
      to="/menu?openCart=1"
      className="float-cart-bar"
      aria-label={`${t('cart.view')} — ${count}`}
    >
      <span>
        {t('cart.view')}
        <span style={{ opacity: 0.85, fontWeight: 600 }}> · {count}</span>
      </span>
      <span>MVR {cartTotal.toFixed(2)}</span>
    </Link>
  );
}
