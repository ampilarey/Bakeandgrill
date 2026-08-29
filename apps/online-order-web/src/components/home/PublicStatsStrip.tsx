import { useEffect, useState } from 'react';
import { fetchPublicStats, type PublicStat } from '../../api';

/**
 * "Public counters" home block — the owner places and configures it in the
 * Customer Surface Builder; /public-stats serves only the counters that
 * block enables. Renders nothing while loading, on error, or when the
 * block is absent; never blocks the page.
 */
export function PublicStatsStrip() {
  const [stats, setStats] = useState<PublicStat[] | null>(null);

  useEffect(() => {
    fetchPublicStats()
      .then((res) => setStats(res.enabled && res.stats.length > 0 ? res.stats : null))
      .catch(() => setStats(null));
  }, []);

  if (stats === null) return null;

  return (
    <section
      data-testid="public-stats"
      style={{ padding: '1.75rem 1.25rem', background: 'var(--amber-light, #FEF3E8)' }}
    >
      <div
        style={{
          maxWidth: 900, margin: '0 auto', display: 'flex', flexWrap: 'wrap',
          justifyContent: 'center', gap: '1.25rem 2.5rem', textAlign: 'center',
        }}
      >
        {stats.map((stat) => (
          <div key={stat.key} style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: '7rem' }}>
            <span style={{
              fontSize: '1.7rem', fontWeight: 800, letterSpacing: '-0.03em',
              color: 'var(--amber, #D4813A)', fontVariantNumeric: 'tabular-nums',
            }}>
              {stat.display}
            </span>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--muted, #6b5d4f)' }}>
              {stat.label}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
