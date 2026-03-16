import { useState, useEffect, useCallback } from 'react';
import type { Delivery, Driver } from '../types';
import { api } from '../api';
import DeliveryCard from '../components/DeliveryCard';

interface Props { driver: Driver }

export default function ActivePage({ driver }: Props) {
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const { deliveries: d } = await api.getDeliveries();
      setDeliveries(d);
      setError('');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Poll every 30s for new assignments
  useEffect(() => {
    const id = setInterval(() => void load(), 30_000);
    return () => clearInterval(id);
  }, [load]);

  return (
    <div className="min-h-screen bg-[#F5EFE6] pb-24">
      {/* Header */}
      <div className="bg-[#1C1408] text-white px-4 pt-12 pb-6 safe-top">
        <p className="text-[#8B7355] text-xs font-medium uppercase tracking-wide mb-1">Good day,</p>
        <h1 className="text-xl font-bold">{driver.name}</h1>
        {driver.vehicle_type && (
          <p className="text-[#8B7355] text-sm mt-0.5">🚗 {driver.vehicle_type}</p>
        )}
      </div>

      <div className="px-4 pt-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-[#1C1408]">Active Deliveries</h2>
          <button
            onClick={() => { setLoading(true); void load(); }}
            className="text-[#D4813A] text-sm font-medium"
          >
            Refresh
          </button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
            {error}
          </div>
        )}

        {loading ? (
          <div className="space-y-3">
            {[1, 2].map(i => (
              <div key={i} className="bg-white rounded-2xl h-32 animate-pulse border border-[#EDE4D4]" />
            ))}
          </div>
        ) : deliveries.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-5xl mb-3">🎉</div>
            <p className="text-[#1C1408] font-semibold">No active deliveries</p>
            <p className="text-[#8B7355] text-sm mt-1">You're all caught up!</p>
          </div>
        ) : (
          <div className="space-y-3">
            {deliveries.map(d => <DeliveryCard key={d.id} delivery={d} />)}
          </div>
        )}
      </div>
    </div>
  );
}
