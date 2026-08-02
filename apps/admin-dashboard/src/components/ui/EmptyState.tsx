import type { ReactNode } from 'react';

interface Props {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ icon, title, description, action }: Props) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      {icon && <div className="text-[var(--color-text-muted)] mb-4 opacity-60">{icon}</div>}
      <p className="text-base font-semibold text-[var(--color-text)] mb-1">{title}</p>
      {description && <p className="text-sm text-[var(--color-text-muted)] mb-4 max-w-xs">{description}</p>}
      {action}
    </div>
  );
}
