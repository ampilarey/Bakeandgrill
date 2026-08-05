import { useServiceStatusContext } from '../context/ServiceStatusContext';
import type { ServiceKey } from '../api/serviceStatus';

/**
 * Order-app service / ordering-gate banner.
 *
 * Precedence: checkout > payment > pickup > catering > registration.
 * MenuPage may pass `gateClosedMessage` so the shop-hours gate (with reopen
 * time) surfaces even when browsing stays live.
 *
 * `online_delivery` is intentionally NOT bannered: the delivery window being
 * closed is routine daily state, is shown contextually (dimmed card + reason
 * in the pickup/delivery sheet, and at checkout), and tomorrow delivery
 * orders are accepted regardless of today's window.
 */
const BANNER_PRIORITY: ServiceKey[] = [
  'online_ordering',
  'online_checkout',
  'online_payment',
  'online_pickup',
  'catering_inquiry',
  'customer_registration',
];

const DEFAULT_MESSAGES: Partial<Record<ServiceKey, string>> = {
  online_ordering: 'Online ordering is temporarily unavailable.',
  online_checkout: 'Online ordering is temporarily unavailable — please call us or visit us.',
  online_payment: 'Online payment is temporarily unavailable. Cash on collection is still available.',
  online_pickup: 'Pickup orders are temporarily paused.',
  catering_inquiry: 'Catering inquiries are temporarily paused.',
  customer_registration: 'New account signups are temporarily paused.',
};

export type ServiceBannerProps = {
  /**
   * When the online ordering gate is closed, MenuPage passes a composed
   * closed + reopen notice. Forces the online_ordering banner with this text.
   */
  gateClosedMessage?: string | null;
};

function BannerShell({
  testId,
  message,
  alternatives,
}: {
  testId: string;
  message: string;
  alternatives?: string[];
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid={testId}
      style={{
        width: '100%',
        padding: '0.55rem 1.25rem',
        background: 'var(--color-warning-bg, #fef3c7)',
        borderBottom: '1px solid var(--color-warning, #f59e0b)',
        color: 'var(--color-warning, #92400e)',
        fontSize: '0.85rem',
        fontWeight: 600,
        textAlign: 'center',
      }}
    >
      {message}
      {alternatives && alternatives.length > 0 && (
        <span style={{ marginInlineStart: '0.4rem', fontWeight: 500, opacity: 0.85 }}>
          (Try: {alternatives.join(', ')})
        </span>
      )}
    </div>
  );
}

export function ServiceBanner({ gateClosedMessage }: ServiceBannerProps = {}) {
  const { get } = useServiceStatusContext();
  const forced = gateClosedMessage?.trim();

  if (forced) {
    return (
      <BannerShell
        testId="service-banner-online_ordering"
        message={forced}
      />
    );
  }

  for (const key of BANNER_PRIORITY) {
    const entry = get(key);
    if (entry && !entry.available) {
      const message = entry.public_message?.trim() || DEFAULT_MESSAGES[key] || 'This service is temporarily unavailable.';
      return (
        <BannerShell
          testId={`service-banner-${key}`}
          message={message}
          alternatives={entry.alternatives}
        />
      );
    }
  }

  return null;
}
