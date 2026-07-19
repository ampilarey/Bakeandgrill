import { Link, useLocation } from 'react-router-dom';
import { useLanguage } from '../../context/LanguageContext';
import { useShellNav } from '../../context/ShellNavContext';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { isActiveOrderStatus, useActiveOrder } from '../../hooks/useActiveOrder';
import { DESKTOP_SHELL_MQ } from './navTabs';

const STATUS_KEYS: Record<string, string> = {
  payment_pending: 'order.status.payment_pending',
  pending: 'order.status.pending',
  paid: 'order.status.paid',
  preparing: 'order.status.preparing',
  ready: 'order.status.ready',
  completed: 'order.status.completed',
  cancelled: 'order.status.cancelled',
};

/**
 * Desktop/iPad pill above the content (Home + Orders).
 * Phone uses the Orders tab count in BottomNav instead.
 */
export function ActiveOrderCapsule() {
  const { t } = useLanguage();
  const { hideNav } = useShellNav();
  const location = useLocation();
  const { activeOrder } = useActiveOrder();
  const isDesktopShell = useMediaQuery(DESKTOP_SHELL_MQ);

  const onHomeOrOrders =
    location.pathname === '/' ||
    location.pathname === '/order-history' ||
    location.pathname.startsWith('/order-history/');

  if (!isDesktopShell || hideNav || !onHomeOrOrders || !activeOrder) return null;

  const statusKey = STATUS_KEYS[activeOrder.status];
  const statusLabel = statusKey ? t(statusKey) : activeOrder.status;
  const orderNo = activeOrder.order_number ?? activeOrder.id;

  return (
    <Link
      to={`/orders/${activeOrder.id}`}
      className="active-order-capsule"
      aria-label={`${t('orders.active_capsule')} #${orderNo}`}
    >
      <span
        className={isActiveOrderStatus(activeOrder.status) ? 'status-dot-pulse' : undefined}
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: 'var(--color-primary)',
          flexShrink: 0,
        }}
      />
      <span className="active-order-capsule__text">
        {t('orders.active_capsule')} #{orderNo}
        <span className="active-order-capsule__sep">·</span>
        {statusLabel}
      </span>
      <span className="active-order-capsule__chevron" aria-hidden="true">▸</span>
    </Link>
  );
}
