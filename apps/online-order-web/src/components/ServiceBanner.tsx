import { useServiceStatusContext } from '../context/ServiceStatusContext';
import type { ServiceKey } from '../api/serviceStatus';

/**
 * Order-app service maintenance banner.
 *
 * Read-only in Stage 2 — surfaces the first disabled public service so the
 * customer sees ONE clear message. Backend is authoritative for actual
 * gating; this banner is UX.
 *
 * Precedence order matches the plan: checkout > payment > pickup > delivery
 * > catering > registration. Umbrella `online_ordering` is checked first
 * for the "everything paused" case.
 */
const BANNER_PRIORITY: ServiceKey[] = [
  'online_ordering',
  'online_checkout',
  'online_payment',
  'online_pickup',
  'online_delivery',
  'catering_inquiry',
  'customer_registration',
];

const DEFAULT_MESSAGES: Partial<Record<ServiceKey, string>> = {
  online_ordering: 'Online ordering is temporarily unavailable.',
  online_checkout: 'Online ordering is temporarily unavailable — please call us or visit us.',
  online_payment: 'Online payment is temporarily unavailable. Cash on collection is still available.',
  online_pickup: 'Pickup orders are temporarily paused.',
  online_delivery: 'Delivery is temporarily unavailable — pickup is still available.',
  catering_inquiry: 'Catering inquiries are temporarily paused.',
  customer_registration: 'New account signups are temporarily paused.',
};

export function ServiceBanner() {
  const { get } = useServiceStatusContext();

  for (const key of BANNER_PRIORITY) {
    const entry = get(key);
    if (entry && !entry.available) {
      const message = entry.public_message?.trim() || DEFAULT_MESSAGES[key] || 'This service is temporarily unavailable.';
      return (
        <div
          role="status"
          aria-live="polite"
          data-testid={`service-banner-${key}`}
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
          {entry.alternatives && entry.alternatives.length > 0 && (
            <span style={{ marginInlineStart: '0.4rem', fontWeight: 500, opacity: 0.85 }}>
              (Try: {entry.alternatives.join(', ')})
            </span>
          )}
        </div>
      );
    }
  }

  return null;
}
