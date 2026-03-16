import type { DeliveryStatus } from '../types';

const CONFIG: Record<DeliveryStatus, { label: string; color: string }> = {
  out_for_delivery: { label: 'Assigned',    color: 'bg-blue-100 text-blue-700' },
  picked_up:        { label: 'Picked Up',   color: 'bg-yellow-100 text-yellow-700' },
  on_the_way:       { label: 'On the Way',  color: 'bg-orange-100 text-orange-700' },
  delivered:        { label: 'Delivered',   color: 'bg-green-100 text-green-700' },
  completed:        { label: 'Completed',   color: 'bg-gray-100 text-gray-600' },
};

interface Props { status: DeliveryStatus }

export default function StatusBadge({ status }: Props) {
  const cfg = CONFIG[status] ?? { label: status, color: 'bg-gray-100 text-gray-600' };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${cfg.color}`}>
      {cfg.label}
    </span>
  );
}
