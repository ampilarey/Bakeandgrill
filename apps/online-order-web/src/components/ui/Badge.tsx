import type { ReactNode } from 'react';

type BadgeVariant = 'combo' | 'spicy' | 'unavailable' | 'status-open' | 'status-closed' | 'default';

interface BadgeProps {
  variant?: BadgeVariant;
  children: ReactNode;
}

const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  combo:         'badge badge-combo',
  spicy:         'badge badge-spicy',
  unavailable:   'badge badge-unavail',
  'status-open': 'status-chip status-open',
  'status-closed':'status-chip status-closed',
  default:       'badge',
};

export function Badge({ variant = 'default', children }: BadgeProps) {
  return <span className={VARIANT_CLASSES[variant]}>{children}</span>;
}
