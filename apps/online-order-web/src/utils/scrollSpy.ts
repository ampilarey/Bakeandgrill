/**
 * Pure decision for which section is "active" given IntersectionObserver entries.
 * Prefer the topmost intersecting section (smallest top within the root).
 */
export type SectionRatio = {
  id: number;
  /** Intersection ratio 0–1 */
  ratio: number;
  /** Bounding client top relative to viewport */
  top: number;
};

export function pickActiveSectionId(
  entries: SectionRatio[],
  previousId: number | null,
): number | null {
  const visible = entries.filter((e) => e.ratio > 0);
  if (visible.length === 0) return previousId;

  // Topmost visible section wins (smallest top)
  visible.sort((a, b) => a.top - b.top);
  return visible[0].id;
}
