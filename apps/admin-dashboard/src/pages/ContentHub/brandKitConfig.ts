export type BrandKitPreviewKind =
  | 'header-light'
  | 'header-dark'
  | 'browser-tab'
  | 'share-card'
  | 'color'
  | 'menu-circle';

export type BrandKitCardMeta = {
  key: string;
  title: string;
  where: string;
  requirements: string;
  preview: BrandKitPreviewKind;
};

/** Ordered Brand Kit cards (Branding section only). */
export const BRAND_KIT_CARDS: BrandKitCardMeta[] = [
  {
    key: 'logo',
    title: 'Logo — for light backgrounds',
    where: 'Header and navigation when the site is in light mode.',
    requirements: 'PNG or WebP with a see-through background. Saved whole, in its own shape, up to 1200 px.',
    preview: 'header-light',
  },
  {
    key: 'logo_dark',
    title: 'Logo — for dark backgrounds',
    where: 'Header and navigation when the site is in dark mode. Falls back to the light logo if empty.',
    requirements: 'Light lettering on a see-through background, PNG or WebP. Saved whole, up to 1200 px.',
    preview: 'header-dark',
  },
  {
    key: 'favicon',
    title: 'Browser tab icon',
    where: 'The small icon in the browser tab and on phone home screens.',
    requirements: 'Square works best, 512×512 or bigger. Any other shape is centred on a clear square.',
    preview: 'browser-tab',
  },
  {
    key: 'og_image',
    title: 'Link preview image',
    where: 'Shown when someone shares a link on WhatsApp, Facebook, or iMessage.',
    requirements: 'Saved at 1200×630. Other shapes are trimmed from the middle; keep words off the edges.',
    preview: 'share-card',
  },
  {
    key: 'primary_color',
    title: 'Brand colour',
    where: 'Buttons, accents, and highlights on the website and order app.',
    requirements: 'Any hex colour. Hover and glow shades are derived automatically.',
    preview: 'color',
  },
  {
    key: 'default_item_image',
    title: 'Fallback photo for items with no picture',
    where: 'Circular menu cards when a dish has no photo of its own.',
    requirements: 'Square photo, at least 600×600. Food looks best centered.',
    preview: 'menu-circle',
  },
];

export const BRAND_KIT_KEYS = BRAND_KIT_CARDS.map((c) => c.key);
