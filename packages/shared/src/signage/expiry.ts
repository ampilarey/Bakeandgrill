/**
 * Things the server put in the config with a use-by time — notice slides
 * and notice ticker lines. The config is cached for a while on the server
 * and refreshed every couple of minutes by the board, so the board drops
 * them itself the moment they expire.
 */
export function isExpired(expiresAt: unknown, nowMs: number): boolean {
  if (typeof expiresAt !== 'string' || expiresAt === '') return false;
  const t = Date.parse(expiresAt);
  return Number.isFinite(t) && t <= nowMs;
}

export function dropExpired<T extends { expires_at?: string | null }>(list: T[], nowMs: number): T[] {
  return list.filter((x) => !isExpired(x.expires_at, nowMs));
}
