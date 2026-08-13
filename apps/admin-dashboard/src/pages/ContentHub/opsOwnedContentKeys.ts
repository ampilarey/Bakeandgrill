import type { ContentManagedBy } from '../../api/content';

/**
 * Mirrors backend OpsOwnedContent — Content Hub must not draft/publish these.
 * Keep in sync with backend/app/Domains/Settings/OpsOwnedContent.php
 */
export const OPS_OWNED_CONTENT_KEYS = new Set([
  'delivery_threshold',
  'site_name',
  'business_website',
  'business_phone',
  'business_email',
  'business_address',
  'business_address_line1',
  'business_address_city',
  'business_address_country',
  'business_landmark',
  'business_maps_url',
  'maps_embed_url',
  'business_whatsapp',
  'business_viber',
]);

export function isOpsOwnedContentKey(key: string): boolean {
  return OPS_OWNED_CONTENT_KEYS.has(key);
}

/** Client fallback when API omits managed_by (keeps Hub read-only even on stale payloads). */
export function fallbackManagedBy(
  key: string,
  currentValue?: string | null,
): ContentManagedBy | null {
  if (key === 'delivery_threshold') {
    return {
      owner_label: 'Ordering Control Center → Delivery Settings',
      owner_path: '/admin/delivery-settings',
      note: 'Free delivery threshold used at checkout, invoices, receipts and public messaging.',
      current_value: currentValue ?? null,
    };
  }
  if (isOpsOwnedContentKey(key)) {
    return {
      owner_label: 'Business Details',
      owner_path: '/admin/business-details',
      note: 'Shared operational business profile used on receipts, invoices, signage and public contact.',
      current_value: currentValue ?? null,
    };
  }
  return null;
}
