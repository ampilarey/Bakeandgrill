import { describe, it, expect } from 'vitest';
import { BRAND_PAGE_TASKS, CONTENT_TASK_CLUSTERS } from './taskLandingConfig';
import { OPS_OWNED_CONTENT_KEYS } from './opsOwnedContentKeys';

/**
 * Owner report 2026-08-15: "Moved items are still there."
 *
 * The settings were correctly hidden from the API, but the landing cards still
 * advertised them — "Logo, colours, site name…" on a screen where those fields
 * no longer exist. A signpost to a room that was emptied is worse than the room.
 */
describe('Content landing cards do not advertise Business Details settings', () => {
  /** Words a card must not use, mapped to the moved setting they describe. */
  const FORBIDDEN: Array<{ word: RegExp; because: string }> = [
    { word: /\blogos?\b/i, because: 'logo moved to Business Details' },
    { word: /\bcolours?\b|\bcolors?\b/i, because: 'primary_color moved to Business Details' },
    { word: /\bsite name\b/i, because: 'site_name moved to Business Details' },
    { word: /\bsocials\b/i, because: 'social_* moved to Business Details' },
    { word: /\bfavicon\b/i, because: 'favicon moved to Business Details' },
    { word: /\btagline\b/i, because: 'site_tagline moved to Business Details' },
    { word: /tracking IDs?\b/i, because: 'google_*_id moved to Business Details' },
  ];

  const allCards = [
    ...BRAND_PAGE_TASKS,
    ...CONTENT_TASK_CLUSTERS.flatMap((c) => c.tasks),
  ];

  it('every moved key really is on the ops-owned list', () => {
    for (const key of ['logo', 'primary_color', 'site_name', 'social_instagram', 'favicon', 'site_tagline', 'google_analytics_id']) {
      expect(OPS_OWNED_CONTENT_KEYS.has(key), `${key} should be Business Details owned`).toBe(true);
    }
  });

  it.each(allCards.map((t) => [t.id, t.title, t.description] as const))(
    'card %s does not offer settings that moved away',
    (id, title, description) => {
      const text = `${title} ${description}`;
      for (const { word, because } of FORBIDDEN) {
        // A card may mention a moved setting only to say where it went.
        if (/moved to Business Details/i.test(description)) continue;
        expect(
          word.test(text),
          `card "${id}" says "${text}" — ${because}`,
        ).toBe(false);
      }
    },
  );
});
