import type { Stats } from '../types';

interface Props { stats: Stats }

export default function EarningsCard({ stats }: Props) {
  return (
    <div style={{
      background: 'var(--color-dark)',
      borderRadius: 'var(--radius-2xl)',
      padding: '1.25rem',
      boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
    }}>
      <p style={{ fontSize: '0.7rem', fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 14px' }}>
        Your Stats
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 14 }}>
        {[
          { label: 'Today', value: stats.today },
          { label: 'This Week', value: stats.this_week },
          { label: 'This Month', value: stats.this_month },
        ].map(item => (
          <div key={item.label} style={{ textAlign: 'center' }}>
            <p style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--color-primary)', margin: '0 0 2px', letterSpacing: '-0.02em' }}>
              {item.value}
            </p>
            <p style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.45)', margin: 0, fontWeight: 600 }}>
              {item.label}
            </p>
          </div>
        ))}
      </div>
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <p style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.45)', margin: '0 0 2px', fontWeight: 600 }}>Total Earned</p>
          <p style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--color-primary)', margin: 0 }}>
            MVR {stats.total_fees_mvr.toFixed(2)}
          </p>
        </div>
        {stats.avg_minutes != null && (
          <div style={{ textAlign: 'right' }}>
            <p style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.45)', margin: '0 0 2px', fontWeight: 600 }}>Avg. Time</p>
            <p style={{ fontSize: '1.25rem', fontWeight: 800, color: 'white', margin: 0 }}>{stats.avg_minutes}m</p>
          </div>
        )}
      </div>
    </div>
  );
}
