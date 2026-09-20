import { API_ORIGIN } from '../api';

type CategoryRef = { id: number; name: string; slug?: string | null };

/**
 * The link a category is shared by: its page on the website menu, which shows
 * that category alone with a way back to the full menu (owner, 2026-09-21).
 * The same link the website's own Share buttons hand out, so a category has
 * one address wherever it is shared from.
 */
export function categoryShareUrl(category: CategoryRef): string {
  const slug = (category.slug ?? '').trim();
  return `${siteOrigin()}/menu/c/${slug !== '' ? encodeURIComponent(slug) : category.id}`;
}

/**
 * An absolute origin, always: the app is served from the same site as the
 * API, so API_ORIGIN is often empty, and a shared link has to carry the
 * domain or it means nothing in a chat.
 */
function siteOrigin(): string {
  if (/^https?:\/\//.test(API_ORIGIN)) return API_ORIGIN.replace(/\/+$/, '');
  return typeof window !== 'undefined' ? window.location.origin : '';
}

export function categoryShareProps(category: CategoryRef) {
  return {
    url: categoryShareUrl(category),
    title: `${category.name} – Bake & Grill menu`,
    text: `See our ${category.name} menu at Bake & Grill`,
    ariaLabel: `Share ${category.name}`,
  };
}
