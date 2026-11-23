import { useState } from 'react';
import { Tag } from 'lucide-react';

/**
 * The small picture on a label's row: the first address that loads, else the
 * tag icon. A picture whose file has gone drew an empty box on an iPhone
 * (owner, 2026-11-23: Theluli Rihaakuru's row), so a failed one steps on to
 * the next (the brand's logo) and never leaves the box blank.
 */
export function LabelThumb({ srcs }: { srcs: Array<string | null | undefined> }) {
  const list = srcs.filter((s): s is string => !!s);
  const [at, setAt] = useState(0);
  const src = list[at];
  if (!src) return <Tag size={18} className="text-[var(--color-text-muted)]" data-testid="label-thumb-icon" />;
  // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- a load failure, not a control
  return <img key={src} src={src} alt="" className="max-w-full max-h-full object-contain" onError={() => setAt((n) => n + 1)} />;
}
