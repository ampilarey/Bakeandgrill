const CONTROL_CHARS = /[\u0000-\u001F\u007F]/g;

export function safePublicUrl(url: string | null | undefined): string | null {
  const trimmed = String(url ?? '').replace(CONTROL_CHARS, '').trim();
  if (trimmed === '') return null;
  if (trimmed.startsWith('//')) return null;
  if (trimmed.startsWith('/')) return trimmed;
  if (/^https?:\/\/\S+$/i.test(trimmed)) return trimmed;
  if (/^(mailto|tel|viber|whatsapp):\S+$/i.test(trimmed)) return trimmed;
  // Common deep-link form used for Viber chat intents.
  if (/^viber:\/\/\S+$/i.test(trimmed)) return trimmed;
  return null;
}
