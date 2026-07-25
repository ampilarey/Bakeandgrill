/** Replace {{var}} tokens; unknown keys become blank (never leave raw braces). */
export function interpolate(text: string | null | undefined, vars: Record<string, string>): string {
  if (!text) return '';
  return text.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, key: string) => {
    const v = vars[key];
    return v == null ? '' : String(v);
  });
}

export function buildWeightedRotation(slides: Array<{ id: string; weight?: number }>): string[] {
  const weights: Record<string, number> = {};
  for (const s of slides) {
    if (!s.id) continue;
    weights[s.id] = Math.max(1, Number(s.weight ?? 1) || 1);
  }
  const remaining = { ...weights };
  const order: string[] = [];
  let guard = Object.values(weights).reduce((a, b) => a + b, 0) + Object.keys(weights).length;
  while (guard-- > 0 && Object.values(remaining).some((w) => w > 0)) {
    let bestId: string | null = null;
    let bestW = -1;
    for (const [id, w] of Object.entries(remaining)) {
      if (w > bestW) {
        bestW = w;
        bestId = id;
      }
    }
    if (!bestId || bestW <= 0) break;
    order.push(bestId);
    remaining[bestId] -= 1;
  }
  return order;
}
