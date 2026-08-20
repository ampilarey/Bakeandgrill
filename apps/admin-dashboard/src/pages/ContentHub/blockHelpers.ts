import type { ContentBlock } from '../../api/content';

/**
 * Plain-English helper under every block label.
 * Prefer registry `description`; otherwise use a key-specific or patterned fallback.
 */
const KEY_HELPERS: Record<string, string> = {
  site_name: 'Your business name in the header, browser tab, and receipts.',
  site_tagline: 'Short line under the name on the website.',
  business_phone: 'Main phone number shown on the site and order app.',
  business_email: 'Public email customers can use to reach you.',
  business_address: 'Street address shown in the footer and contact pages.',
  business_landmark: 'Nearby landmark to help customers find you.',
  business_maps_url: 'Link that opens your location in Google Maps.',
  business_whatsapp: 'WhatsApp chat link for the contact buttons.',
  business_viber: 'Viber chat link for the contact buttons.',
  delivery_threshold: 'Read-only — free delivery threshold is managed in Ordering Control → Delivery Settings and drives checkout, invoices, receipts and public messaging.',
  delivery_time: 'Delivery time promise shown to customers.',
  logo: 'Logo for light backgrounds (header and navigation).',
  logo_dark: 'Logo for dark backgrounds; falls back to the light logo if empty.',
  favicon: 'Small icon in the browser tab and on phone home screens.',
  dhivehi_font: 'Thaana webfont for Dhivehi pages. Upload a TTF/OTF/WOFF/WOFF2 with Thaana letters. Empty uses shipped A_Faruma. Edit separately for Website vs Order App.',
  og_image: 'Image used when someone shares your site link on social apps.',
  primary_color: 'Brand accent colour for buttons and highlights on this app only.',
  default_item_image: 'Photo shown for menu items that do not have their own image.',
  hero_slides: 'Full-width banners at the top of the home page (image or muted video). Edit the current destination from its own Content Hub.',
  homepage_categories: 'Four category shortcuts on the home page.',
  trust_items: 'Trust strip icons and short lines on the home page.',
  proof_details: 'Small stats next to the social-proof section.',
  proof_stat: 'Big number in the social-proof section.',
  proof_label: 'Label under the big social-proof number.',
  meta_title: 'Default browser title and search result title for the website.',
  meta_description: 'Short summary search engines and link previews can show.',
  footer_text: 'Text in the website footer.',
  footer_links: 'Links listed in the footer.',
  nav_order_cta_text: 'Label on the “Order” button in the website navigation.',
  maps_embed_url: 'Google Maps embed URL for the contact/location map.',
  menu_page_title: 'Title at the top of the order-app menu.',
  menu_new_days: 'How many days an item stays marked as “New”.',
  language_switcher_enabled: 'Show the EN / ދވ language toggle on the website and order app. Off by default.',
  announcement_enabled: 'Show or hide the announcement banner.',
  announcement_text: 'Message inside the announcement banner.',
  announcement_url: 'Optional link when someone taps the announcement.',
  announcement_style: 'Visual style of the announcement banner (e.g. promo).',
  order_checkout_title: 'Heading on the checkout screen.',
  order_checkout_subtitle: 'Supporting line under the checkout heading.',
  order_payment_compliance: 'Payment / compliance note on checkout.',
  order_auth_privacy_line: 'Privacy note on the login screen.',
  order_home_reviews_title: 'Heading above reviews on the order-app home.',
  order_home_greeting_hello: 'Welcome line when the customer has no profile name (or is signed out).',
  order_home_greeting_named: 'Welcome line when a profile name is set. Use {name} for the customer’s name.',
  order_home_greeting_sub: 'Short line under the Hello greeting on the order-app home.',
  order_mode_delivery_hint: 'Hint under the Delivery mode card.',
  order_mode_pickup_hint: 'Hint under the Pickup mode card.',
  order_mode_dine_in_hint: 'Hint under the Eat here mode card.',
  order_mode_delivery_image: 'Photo on the Delivery mode card. Edit separately for Website vs Order App.',
  order_mode_pickup_image: 'Photo on the Pickup mode card. Edit separately for Website vs Order App.',
  order_mode_dine_in_image: 'Photo on the Eat here mode card. Edit separately for Website vs Order App.',
  order_mode_delivery_info: 'Explanation shown when someone taps Delivery (especially when it is closed).',
  order_mode_pickup_info: 'Explanation shown when someone taps Pickup (especially when it is closed).',
  order_mode_dine_in_info: 'Explanation shown when someone taps Eat here (especially when it is closed).',
  order_mode_status_available: 'Status line when a fulfilment mode is available right now.',
  order_mode_status_unavailable: 'Status line when a mode is off (and no reopening time is known).',
  order_mode_status_unavailable_opens: 'Status when a mode is closed by hours. Use {time} for the next opening time.',
  order_mode_learn_more: 'Link text on a closed mode card (opens the info sheet).',
  order_hours_open: 'Badge text when online ordering is open.',
  order_hours_closed: 'Badge text when online ordering is closed.',
  order_hours_open_closes: 'Open badge that includes closing time ({time}).',
  order_hours_closed_opens: 'Closed badge that includes next opening time ({time}).',
};

function patternedHelper(block: ContentBlock): string | null {
  const { key, label, type } = block;
  if (type === 'boolean' || key.startsWith('section_') && key.endsWith('_enabled')) {
    return `Show or hide this section. (${label})`;
  }
  if (/_eyebrow$/i.test(key)) return 'Small label above the section title.';
  if (/_subtitle$/i.test(key)) return 'Supporting line under the section title.';
  if (/_title$/i.test(key) && !/_meta_title$/i.test(key)) return 'Main heading for this section or page.';
  if (/_meta_title$/i.test(key)) return 'Browser tab title for this page.';
  if (/_meta_description$/i.test(key)) return 'Search / link-preview description for this page.';
  if (/featured/i.test(key)) return 'Copy for the featured-items section on the website home.';
  if (/specials|offers_/i.test(key)) return 'Copy for the specials / offers section.';
  if (/categories/i.test(key)) return 'Copy for the categories section on the home page.';
  if (/cta_band/i.test(key)) return 'Call-to-action band near the bottom of the website home.';
  if (/proof/i.test(key)) return 'Social-proof section on the website home.';
  if (/location/i.test(key)) return 'Location section on the website home.';
  if (/delivery/i.test(key)) return 'Delivery card copy on the website home.';
  if (/footer_/i.test(key)) return 'Website footer wording.';
  if (/contact_/i.test(key)) return 'Wording on the contact page.';
  if (/hours_/i.test(key)) return 'Wording on the opening-hours page.';
  if (/privacy_/i.test(key)) return 'Wording on the privacy page.';
  if (/terms_/i.test(key)) return 'Wording on the terms page.';
  if (/refund_/i.test(key)) return 'Wording on the refund page.';
  if (/events_/i.test(key) || /events_cta/i.test(key)) return 'Events section on the website.';
  if (/office_orders_/i.test(key)) return 'Office / corporate orders promo on the order app.';
  if (/about_/i.test(key)) return 'About page content.';
  if (/legal_/i.test(key)) return 'Legal page body override (leave blank to use the default).';
  if (/hero_fallback/i.test(key)) return 'Shown if a hero slide is missing a title or subtitle.';
  if (/badge/i.test(key)) return 'Status badge text on the home page.';
  return null;
}

function appsPhrase(block: ContentBlock): string {
  const hasWeb = block.apps.includes('website');
  const hasOrder = block.apps.includes('order_app');
  if (hasWeb && hasOrder) return 'website and order app';
  if (hasOrder) return 'order app';
  return 'website';
}

export function helperForBlock(block: ContentBlock): string {
  const fromRegistry = block.description?.trim();
  if (fromRegistry) return fromRegistry;
  const keyed = KEY_HELPERS[block.key];
  if (keyed) return keyed;
  const patterned = patternedHelper(block);
  if (patterned) return patterned;
  return `${block.label} — editable on the ${appsPhrase(block)}.`;
}
