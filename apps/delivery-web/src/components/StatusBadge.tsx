import type { DeliveryStatus } from '../types';

const CONFIG: Record<DeliveryStatus, { label: string; bg: string; color: string }> = {
  out_for_delivery: { label: 'Assigned',   bg: '#dbeafe', color: '#1d4ed8' },
  picked_up:        { label: 'Picked Up',  bg: '#fef9c3', color: '#854d0e' },
  on_the_way:       { label: 'On the Way', bg: '#ffedd5', color: '#9a3412' },
  delivered:        { label: 'Delivered',  bg: '#dcfce7', color: '#15803d' },
  completed:        { label: 'Completed',  bg: 'var(--color-surface-alt)', color: 'var(--color-text-muted)' },
};

interface Props { status: DeliveryStatus }

export default function StatusBadge({ status }: Props) {
  const cfg = CONFIG[status] ?? { label: status, bg: 'var(--color-surface-alt)', color: 'var(--color-text-muted)' };
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: '3px 10px', borderRadius: 9999,
      fontSize: '0.7rem', fontWeight: 700,
      textTransform: 'uppercase', letterSpacing: '0.05em',
      background: cfg.bg, color: cfg.color,
      whiteSpace: 'nowrap',
    }}>
      {cfg.label}
    </span>
  );
}
