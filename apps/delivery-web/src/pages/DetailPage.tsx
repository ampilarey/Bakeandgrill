import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { Delivery, DeliveryStatus } from '../types';
import { api } from '../api';
import StatusStepper from '../components/StatusStepper';
import ContactBar from '../components/ContactBar';

export default function DetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [delivery, setDelivery] = useState<Delivery | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const { delivery: d } = await api.getDelivery(parseInt(id, 10));
      setDelivery(d);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load delivery.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  const handleStatusUpdate = async (next: DeliveryStatus) => {
    if (!delivery) return;
    setUpdating(true);
    setError('');
    try {
      const { delivery: updated } = await api.updateStatus(delivery.id, next);
      setDelivery(prev => prev ? { ...prev, ...updated, status: updated.status as import('../types').DeliveryStatus } : prev);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update status.');
    } finally {
      setUpdating(false);
    }
  };

  const mapsLink = delivery?.delivery_address
    ? `https://maps.google.com/?q=${encodeURIComponent(
        [delivery.delivery_area, delivery.delivery_address, delivery.delivery_building]
          .filter(Boolean).join(', ')
      )}`
    : null;

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F5EFE6] flex items-center justify-center">
        <div className="text-[#D4813A] text-4xl animate-spin">⟳</div>
      </div>
    );
  }

  if (!delivery) {
    return (
      <div className="min-h-screen bg-[#F5EFE6] flex flex-col items-center justify-center px-4">
        <p className="text-[#1C1408] font-semibold">Delivery not found.</p>
        <button onClick={() => navigate('/')} className="mt-4 text-[#D4813A] font-medium">← Back</button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5EFE6] pb-28">
      {/* Header */}
      <div className="bg-[#1C1408] text-white px-4 pt-12 pb-5 safe-top">
        <button onClick={() => navigate('/')} className="text-[#D4813A] text-sm font-medium mb-3 flex items-center gap-1">
          ‹ Back
        </button>
        <h1 className="text-xl font-bold">Delivery #{delivery.id}</h1>
        <p className="text-[#8B7355] text-sm mt-0.5">MVR {parseFloat(String(delivery.total)).toFixed(2)}</p>
      </div>

      <div className="px-4 pt-5 space-y-4">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
            {error}
          </div>
        )}

        {/* Status stepper */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-[#EDE4D4]">
          <p className="text-xs font-medium text-[#8B7355] uppercase tracking-wide mb-4">Delivery Status</p>
          <StatusStepper
            status={delivery.status as DeliveryStatus}
            onUpdate={handleStatusUpdate}
            loading={updating}
          />
        </div>

        {/* Delivery address */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-[#EDE4D4]">
          <p className="text-xs font-medium text-[#8B7355] uppercase tracking-wide mb-3">Delivery Address</p>
          <div className="space-y-1 text-sm text-[#1C1408]">
            {delivery.delivery_area && <p className="font-semibold">{delivery.delivery_area}</p>}
            {delivery.delivery_address && <p>{delivery.delivery_address}</p>}
            {delivery.delivery_building && <p>Building: {delivery.delivery_building}</p>}
            {delivery.delivery_floor && <p>Floor: {delivery.delivery_floor}</p>}
            {delivery.delivery_notes && (
              <p className="text-[#8B7355] mt-2 italic">Note: {delivery.delivery_notes}</p>
            )}
          </div>
          {mapsLink && (
            <a
              href={mapsLink}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 flex items-center gap-2 text-[#D4813A] text-sm font-semibold"
            >
              🗺️ Open in Google Maps
            </a>
          )}
        </div>

        {/* Contact */}
        <ContactBar
          name={delivery.customer_name}
          phone={delivery.customer_phone ?? delivery.customer?.phone ?? null}
        />

        {/* Items */}
        {delivery.items && delivery.items.length > 0 && (
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-[#EDE4D4]">
            <p className="text-xs font-medium text-[#8B7355] uppercase tracking-wide mb-3">
              Items ({delivery.items.length})
            </p>
            <div className="space-y-3">
              {delivery.items.map((item, i) => (
                <div key={i} className="flex justify-between items-start gap-3">
                  <div className="flex-1">
                    <p className="font-medium text-[#1C1408] text-sm">
                      {item.quantity}× {item.name}
                    </p>
                    {item.variant && (
                      <p className="text-[#8B7355] text-xs">{item.variant}</p>
                    )}
                    {item.modifiers.length > 0 && (
                      <p className="text-[#8B7355] text-xs">{item.modifiers.join(', ')}</p>
                    )}
                    {item.notes && (
                      <p className="text-[#8B7355] text-xs italic">{item.notes}</p>
                    )}
                  </div>
                  <p className="text-sm font-semibold text-[#1C1408] whitespace-nowrap">
                    MVR {parseFloat(String(item.total_price)).toFixed(2)}
                  </p>
                </div>
              ))}
            </div>
            <div className="border-t border-[#F5EFE6] mt-3 pt-3 flex justify-between">
              <span className="text-sm font-semibold text-[#1C1408]">Total</span>
              <span className="text-sm font-bold text-[#D4813A]">
                MVR {parseFloat(String(delivery.total)).toFixed(2)}
              </span>
            </div>
          </div>
        )}

        {/* Timing */}
        {(delivery.driver_assigned_at || delivery.picked_up_at || delivery.delivered_at) && (
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-[#EDE4D4]">
            <p className="text-xs font-medium text-[#8B7355] uppercase tracking-wide mb-3">Timeline</p>
            <div className="space-y-2 text-sm">
              {delivery.driver_assigned_at && (
                <div className="flex justify-between">
                  <span className="text-[#8B7355]">Assigned</span>
                  <span className="text-[#1C1408]">{new Date(delivery.driver_assigned_at).toLocaleTimeString()}</span>
                </div>
              )}
              {delivery.picked_up_at && (
                <div className="flex justify-between">
                  <span className="text-[#8B7355]">Picked up</span>
                  <span className="text-[#1C1408]">{new Date(delivery.picked_up_at).toLocaleTimeString()}</span>
                </div>
              )}
              {delivery.delivered_at && (
                <div className="flex justify-between">
                  <span className="text-[#8B7355]">Delivered</span>
                  <span className="text-[#1C1408]">{new Date(delivery.delivered_at).toLocaleTimeString()}</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
