/**
 * Menu card teaser from a multi-line description.
 * Card shows up to 2 non-empty lines (~140 chars); full text belongs in the detail sheet.
 */
export function cardDescriptionPreview(raw: string | null | undefined, maxChars = 140): {
  text: string;
  truncated: boolean;
} {
  if (!raw?.trim()) return { text: '', truncated: false };

  const normalized = raw.replace(/\r\n/g, '\n').trim();
  const nonEmpty = normalized
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (nonEmpty.length === 0) return { text: '', truncated: false };

  let text = nonEmpty.slice(0, 2).join('\n');
  let truncated = nonEmpty.length > 2;

  if (text.length > maxChars) {
    text = `${text.slice(0, maxChars).replace(/\s+\S*$/, '').trimEnd()}…`;
    truncated = true;
  } else if (truncated) {
    text = `${text}…`;
  }

  return { text, truncated };
}
