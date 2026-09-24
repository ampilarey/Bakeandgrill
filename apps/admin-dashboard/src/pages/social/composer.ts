import type { SocialItemPreview, SocialPlatformCaps } from '../../api';

/**
 * Pure helpers for the Social Hub composer (audit fixes, 2026-09-24):
 * per-platform caption limits, schedule-time conversion that keeps the
 * browser's zone, and the starter caption for a linked item.
 */

export const PLATFORM_LABELS: Record<string, string> = {
  facebook: 'Facebook Page',
  instagram: 'Instagram',
  telegram: 'Telegram',
  viber: 'Viber Channel',
};

export const PLATFORM_SHORT: Record<string, string> = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  telegram: 'Telegram',
  viber: 'Viber',
};

/**
 * The tightest caption limit among the selected platforms, given whether
 * a photo is attached (Telegram allows 4096 on text but 1024 on a photo).
 * Null when nothing is selected or the capabilities are unknown.
 */
export function tightestCaptionLimit(
  selectedPlatforms: string[],
  platforms: Record<string, SocialPlatformCaps>,
  hasImage: boolean,
): { limit: number; platform: string } | null {
  let best: { limit: number; platform: string } | null = null;
  for (const platform of selectedPlatforms) {
    const caps = platforms[platform];
    if (!caps) continue;
    const limit = hasImage ? caps.caption_max_photo : caps.caption_max;
    if (!limit || limit <= 0) continue;
    if (best === null || limit < best.limit) best = { limit, platform };
  }
  return best;
}

/** Selected platforms that cannot post without a photo. */
export function platformsNeedingImage(
  selectedPlatforms: string[],
  platforms: Record<string, SocialPlatformCaps>,
): string[] {
  return selectedPlatforms.filter((p) => platforms[p]?.requires_photo);
}

/** Count as the platforms do: code points, so a Dhivehi letter is one, not two. */
export function captionLength(caption: string): number {
  return Array.from(caption).length;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** ISO instant → the value a `datetime-local` input shows in this browser's zone. */
export function toLocalDateTimeInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * `datetime-local` value → ISO 8601 with the browser's offset, so the
 * server schedules the same instant whatever zone the phone is set to.
 */
export function fromLocalDateTimeInput(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** A starter caption for a linked item: name (and Dhivehi), price, link; the offer's badge and last day when shared from a special. */
export function suggestCaption(item: SocialItemPreview): string {
  const name = item.name_dv ? `${item.name} · ${item.name_dv}` : item.name;
  const special = item.special;
  if (special) {
    const badge = special.badge_label ? `${special.badge_label}: ` : 'Special: ';
    const until = special.end_date ? ` Until ${new Date(`${special.end_date}T00:00:00`).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}.` : '';
    return `${badge}${name} — MVR ${item.price.toFixed(2)}${until}\nOrder now: ${item.link_url}`;
  }
  return `${name} — MVR ${item.price.toFixed(2)}\nOrder now: ${item.link_url}`;
}

/** Facebook and Instagram fold long captions behind "See more" at about this length. */
export const FOLD_AT: Record<string, number> = { facebook: 125, instagram: 125 };

/** Full-page navigation (Facebook's login dialog cannot live inside the SPA). Wrapped so tests can stub it. */
export function navigateTo(url: string): void {
  window.location.href = url;
}

/** "12:00 and 20:00" from the best-times report, or null when there is not enough data. */
export function bestTimesHint(report: { enough: boolean; top_hours: number[]; sample: number } | null | undefined): string | null {
  if (!report || !report.enough || report.top_hours.length === 0) return null;
  const label = (h: number) => `${String(h).padStart(2, '0')}:00`;
  const hours = report.top_hours.map(label);
  return `Your posts do best around ${hours.join(' and ')} (based on ${report.sample} posts).`;
}
