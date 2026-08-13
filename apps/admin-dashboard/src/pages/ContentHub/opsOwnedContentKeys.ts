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
