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
      {icon && <div className="text-[#9C8E7E] mb-4 opacity-60">{icon}</div>}
      <p className="text-base font-semibold text-[#1C1408] mb-1">{title}</p>
      {description && <p className="text-sm text-[#9C8E7E] mb-4 max-w-xs">{description}</p>}
      {action}
    </div>
  );
}
