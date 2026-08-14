/**
 * Stage A — Website desktop landing cards removed as duplicate routes.
 * Every destination must remain reachable from the rail (or ⋯ tools menu).
 *
 * Do not delete this map when removing cards — it is the regression contract.
 */

export type WebsiteLandingRoute =
  | { kind: 'section'; id: string; section: string; via: 'task' | 'surface' }
  | { kind: 'tool'; id: string; toolTestId: string; via: 'task' };

/** The 13 Brand & pages task cards + 7 surface cards removed from Website desktop. */
export const WEBSITE_DESKTOP_REMOVED_LANDING_ROUTES: WebsiteLandingRoute[] = [
  // Task cards → rail sections
  { kind: 'section', id: 'brand_profile', section: 'Everywhere', via: 'task' },
  { kind: 'section', id: 'hero', section: 'Home', via: 'task' },
  { kind: 'section', id: 'announcement', section: 'Everywhere', via: 'task' },
  { kind: 'section', id: 'website_footer', section: 'Everywhere', via: 'task' },
  { kind: 'section', id: 'website_header', section: 'Home', via: 'task' },
  { kind: 'section', id: 'seo', section: 'Everywhere', via: 'task' },
  { kind: 'section', id: 'legal', section: 'Legal', via: 'task' },
  { kind: 'section', id: 'opening_hours', section: 'Hours page', via: 'task' },
  { kind: 'section', id: 'contact_map', section: 'Contact page', via: 'task' },
  { kind: 'section', id: 'catering_events', section: 'Home', via: 'task' },
  // Tool cards → header ⋯ menu
  { kind: 'tool', id: 'history', toolTestId: 'hub-more-history', via: 'task' },
  { kind: 'tool', id: 'schedule', toolTestId: 'hub-schedule-publish', via: 'task' },
  { kind: 'tool', id: 'import_export', toolTestId: 'hub-more-export', via: 'task' },
  // Surface cards → Home (layout) or Everywhere (chrome)
  { kind: 'section', id: 'website.desktop.header', section: 'Home', via: 'surface' },
  { kind: 'section', id: 'website.desktop.home', section: 'Home', via: 'surface' },
  { kind: 'section', id: 'website.desktop.footer', section: 'Everywhere', via: 'surface' },
  { kind: 'section', id: 'website.mobile.header', section: 'Home', via: 'surface' },
  { kind: 'section', id: 'website.mobile.home', section: 'Home', via: 'surface' },
  { kind: 'section', id: 'website.mobile.footer', section: 'Everywhere', via: 'surface' },
  { kind: 'section', id: 'website.mobile.bottom_navigation', section: 'Home', via: 'surface' },
];

export function websiteDesktopRemovedSectionNames(): string[] {
  return [...new Set(
    WEBSITE_DESKTOP_REMOVED_LANDING_ROUTES
      .filter((r): r is Extract<WebsiteLandingRoute, { kind: 'section' }> => r.kind === 'section')
      .map((r) => r.section),
  )];
}
