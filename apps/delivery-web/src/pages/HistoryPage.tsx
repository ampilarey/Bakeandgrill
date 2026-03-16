import { useState, useEffect, useCallback } from 'react';
import type { Delivery, Stats } from '../types';
import { api } from '../api';
import StatusBadge from '../components/StatusBadge';
import EarningsCard from '../components/EarningsCard';

export default function HistoryPage() {
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState('');
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);

  const load = useCallback(async (p = 1, d = '') => {
    setLoading(true);
    try {
      const [histRes, statsRes] = await Promise.all([
        api.getHistory(p, d || undefined),
        api.getStats(),
      ]);
      setDeliveries(histRes.deliveries);
      setLastPage(histRes.meta.last_page);
      setPage(histRes.meta.current_page);
      setStats(statsRes.stats);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(1, date); }, [load, date]);

  return (
    <div className="min-h-screen bg-[#F5EFE6] pb-24">
      {/* Header */}
      <div className="bg-[#1C1408] text-white px-4 pt-12 pb-5 safe-top">
        <h1 className="text-xl font-bold">Delivery History</h1>
      </div>

      <div className="px-4 pt-5 space-y-4">
        {stats && <EarningsCard stats={stats} />}

        {/* Date filter */}
        <div className="flex items-center gap-3">
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            className="flex-1 bg-white border border-[#EDE4D4] rounded-xl px-3 py-2 text-sm text-[#1C1408] focus:outline-none focus:border-[#D4813A]"
          />
          {date && (
            <button
              onClick={() => setDate('')}
              className="text-[#8B7355] text-sm font-medium"
            >
              Clear
            </button>
          )}
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="bg-white rounded-2xl h-20 animate-pulse border border-[#EDE4D4]" />
            ))}
          </div>
        ) : deliveries.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-5xl mb-3">📋</p>
            <p className="text-[#1C1408] font-semibold">No deliveries yet</p>
            {date && <p className="text-[#8B7355] text-sm mt-1">Try a different date</p>}
          </div>
        ) : (
          <div className="space-y-3">
            {deliveries.map(d => (
              <div key={d.id} className="bg-white rounded-2xl p-4 border border-[#EDE4D4] shadow-sm">
                <div className="flex items-start justify-between mb-2">
                  <span className="font-bold text-[#1C1408]">#{d.id}</span>
                  <StatusBadge status={d.status} />
                </div>
                <div className="text-sm text-[#8B7355] space-y-0.5">
                  {d.delivery_area && <p>📍 {d.delivery_area}</p>}
                  {d.delivered_at && (
                    <p>🕐 {new Date(d.delivered_at).toLocaleDateString()} {new Date(d.delivered_at).toLocaleTimeString()}</p>
                  )}
                </div>
                <div className="flex justify-between items-center mt-2 pt-2 border-t border-[#F5EFE6]">
                  <span className="text-sm text-[#8B7355]">{d.item_count} items</span>
                  <span className="text-sm font-semibold text-[#D4813A]">
                    MVR {parseFloat(String(d.total)).toFixed(2)}
                  </span>
                </div>
              </div>
            ))}

            {/* Pagination */}
            {lastPage > 1 && (
              <div className="flex items-center justify-center gap-3 py-2">
                <button
                  onClick={() => void load(page - 1, date)}
                  disabled={page <= 1}
                  className="px-4 py-2 text-sm font-medium text-[#D4813A] disabled:text-[#8B7355] disabled:cursor-not-allowed"
                >
                  ‹ Prev
                </button>
                <span className="text-sm text-[#8B7355]">{page} / {lastPage}</span>
                <button
                  onClick={() => void load(page + 1, date)}
                  disabled={page >= lastPage}
                  className="px-4 py-2 text-sm font-medium text-[#D4813A] disabled:text-[#8B7355] disabled:cursor-not-allowed"
                >
                  Next ›
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
