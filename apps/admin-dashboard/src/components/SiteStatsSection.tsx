import { useEffect, useState } from 'react';
import { Globe, ShoppingBag, Users, Wallet } from 'lucide-react';
import { fetchSiteStats, type SiteStats } from '../api';
import { SectionLabel, StatCard } from './Layout';

const fmt = (n: number) => n.toLocaleString('en-US');

/**
 * The "big numbers" row on the dashboard: lifetime orders / customers /
 * revenue plus the self-hosted visitor counts. Hidden entirely when the
 * stats endpoint refuses (no reports.view) or fails — never blocks the
 * rest of the dashboard.
 */
export function SiteStatsSection() {
  const [stats, setStats] = useState<SiteStats | null>(null);

  useEffect(() => {
    fetchSiteStats().then(setStats).catch(() => setStats(null));
  }, []);

  if (stats === null) return null;

  return (
    <>
      <SectionLabel>Site totals</SectionLabel>
      <div
        className="stat-grid"
        data-responsive-grid
        style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 14, marginBottom: 20 }}
      >
        <StatCard
          label="Total orders"
          value={fmt(stats.orders.total)}
          sub={
            `${fmt(stats.orders.this_month)} this month · ${fmt(stats.orders.today)} today`
            + (stats.orders.breakdown.wholesale + stats.orders.breakdown.catering > 0
              ? ` · incl. ${fmt(stats.orders.breakdown.wholesale)} wholesale, ${fmt(stats.orders.breakdown.catering)} catering`
              : '')
          }
          icon={ShoppingBag}
        />
        <StatCard
          label="Registered customers"
          value={fmt(stats.customers.total)}
          sub={`+${fmt(stats.customers.new_this_month)} this month`}
          icon={Users}
        />
        <StatCard
          label="Revenue (paid, incl. GST)"
          value={`MVR ${fmt(Math.round(stats.revenue.lifetime))}`}
          sub={`MVR ${fmt(Math.round(stats.revenue.this_month))} this month`}
          icon={Wallet}
        />
        <StatCard
          label="Visitors (30 days)"
          value={fmt(stats.visits.last_30.uniques)}
          sub={`${fmt(stats.visits.today.uniques)} today · ${fmt(stats.visits.last_7.uniques)} in 7 days · ${fmt(stats.visits.last_30.views)} page views`}
          icon={Globe}
        />
      </div>
    </>
  );
}
