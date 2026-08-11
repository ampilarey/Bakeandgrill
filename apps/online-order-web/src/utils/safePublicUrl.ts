const CONTROL_CHARS = /[\u0000-\u001F\u007F]/g;

export function safePublicUrl(url: string | null | undefined): string | null {
  const trimmed = String(url ?? '').replace(CONTROL_CHARS, '').trim();
  if (trimmed === '') return null;
  if (trimmed.startsWith('//')) return null;
  if (trimmed.startsWith('/')) return trimmed;
  if (/^https?:\/\/\S+$/i.test(trimmed)) return trimmed;
  if (/^(mailto|tel):\S+$/i.test(trimmed)) return trimmed;
  return null;
}
