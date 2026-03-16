import { useNavigate } from 'react-router-dom';
import type { Delivery } from '../types';
import StatusBadge from './StatusBadge';

interface Props { delivery: Delivery }

function timeSince(iso: string | null): string {
  if (!iso) return '';
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m ago`;
}

export default function DeliveryCard({ delivery }: Props) {
  const navigate = useNavigate();

  return (
    <button
      onClick={() => navigate(`/delivery/${delivery.id}`)}
      className="w-full bg-white rounded-2xl shadow-sm border border-[#EDE4D4] p-4 text-left active:scale-[0.98] transition-transform"
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <span className="text-lg font-bold text-[#1C1408]">#{delivery.id}</span>
          <StatusBadge status={delivery.status} />
        </div>
        <span className="text-xs text-[#8B7355] whitespace-nowrap">
          {timeSince(delivery.driver_assigned_at)}
        </span>
      </div>

      <div className="space-y-1.5">
        {delivery.delivery_area && (
          <div className="flex items-center gap-2 text-sm text-[#1C1408]">
            <span>📍</span>
            <span className="font-medium">{delivery.delivery_area}</span>
          </div>
        )}
        {delivery.delivery_address && (
          <div className="text-sm text-[#8B7355] pl-6 line-clamp-1">{delivery.delivery_address}</div>
        )}
        {delivery.customer_name && (
          <div className="flex items-center gap-2 text-sm text-[#8B7355]">
            <span>👤</span>
            <span>{delivery.customer_name}</span>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between mt-3 pt-3 border-t border-[#F5EFE6]">
        <span className="text-sm text-[#8B7355]">{delivery.item_count} item{delivery.item_count !== 1 ? 's' : ''}</span>
        <div className="flex items-center gap-1 text-[#D4813A] text-sm font-semibold">
          <span>MVR {parseFloat(String(delivery.total)).toFixed(2)}</span>
          <span className="text-[#8B7355]">›</span>
        </div>
      </div>
    </button>
  );
}
