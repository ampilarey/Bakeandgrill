import type { ReactNode } from 'react';
import { HelpCircle } from 'lucide-react';

/*
 * The one-line "?" on each fold of the label forms (round 4 of the usability
 * work, owner, 2026-10-13: plain words everywhere): what the fold is for, in
 * everyday words, at the top of its content.
 */
export function FoldHelp({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <p className={`flex items-start gap-1.5 text-xs text-[var(--color-text-muted)] ${className}`} data-testid="fold-help">
      <HelpCircle size={14} aria-hidden className="shrink-0 mt-0.5 text-[var(--color-text-muted)]" />
      <span>{children}</span>
    </p>
  );
}
