/**
 * Normalize CMS footer_text for the compact brand footer.
 * Legacy rows stored a copyright line here — treat those as unset and fall
 * back to the site tagline (matches website layout.blade.php).
 */
export function normalizeFooterBlurb(raw: string, tagline = ''): string {
  const text = (raw ?? '').trim();
  const fallback = (tagline ?? '').trim();
  if (text === '') return fallback;
  const lower = text.toLowerCase();
  if (text.includes('©') || lower.includes('all rights reserved')) {
    return fallback;
  }
  return text;
}

export const FOOTER_THANKS_DEFAULT = 'Thanks for choosing Bake & Grill — see you soon.';
