export function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {label}
      </label>
      {children}
    </div>
  );
}

export const inputStyle: React.CSSProperties = {
  padding: '10px 12px',
  border: '1.5px solid var(--color-border)',
  borderRadius: 10,
  fontSize: 14,
  fontFamily: 'inherit',
  outline: 'none',
  background: 'var(--color-surface)',
  color: 'var(--color-text)',
  width: '100%',
  boxSizing: 'border-box',
};

export const btnStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  height: 42, padding: '0 20px',
  background: 'var(--color-primary)', color: '#fff',
  border: 'none', borderRadius: 10,
  fontSize: 14, fontWeight: 700,
  fontFamily: 'inherit', cursor: 'pointer',
};

export const alertStyle = (type: 'error' | 'success'): React.CSSProperties => ({
  padding: '10px 14px',
  borderRadius: 10,
  fontSize: 13,
  background: type === 'error' ? 'var(--color-error-bg)' : 'var(--color-success-bg)',
  color: type === 'error' ? 'var(--color-error)' : 'var(--color-success)',
  border: `1px solid ${type === 'error' ? 'var(--color-error)' : 'var(--color-success)'}`,
});

export function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: 'var(--color-surface)',
      border: '1px solid var(--color-border)',
      borderRadius: 16,
      padding: '20px 24px',
    }}>
      <h2 style={{ fontSize: 16, fontWeight: 800, color: 'var(--color-dark)', margin: '0 0 18px' }}>{title}</h2>
      {children}
    </div>
  );
}

export const TIER_COLOR: Record<string, { bg: string; text: string; border: string }> = {
  bronze:   { bg: 'var(--tier-bronze-bg)',   text: 'var(--tier-bronze-text)',   border: 'var(--tier-bronze-border)' },
  silver:   { bg: 'var(--tier-silver-bg)',   text: 'var(--tier-silver-text)',   border: 'var(--tier-silver-border)' },
  gold:     { bg: 'var(--tier-gold-bg)',     text: 'var(--tier-gold-text)',     border: 'var(--tier-gold-border)' },
  platinum: { bg: 'var(--tier-platinum-bg)', text: 'var(--tier-platinum-text)', border: 'var(--tier-platinum-border)' },
};

export const tabStyle = (active: boolean): React.CSSProperties => ({
  padding: '8px 16px', borderRadius: 20, border: 'none',
  background: active ? 'var(--color-primary)' : 'transparent',
  color: active ? '#fff' : 'var(--color-text-muted)',
  fontSize: 13, fontWeight: active ? 700 : 500,
  fontFamily: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap',
});

export function statusBadge(s: string) {
  const colors: Record<string, { bg: string; color: string }> = {
    confirmed: { bg: 'var(--color-success-bg)', color: 'var(--color-success)' },
    pending:   { bg: 'var(--color-warning-bg)', color: 'var(--color-warning)' },
    cancelled: { bg: 'var(--color-error-bg)',   color: 'var(--color-error)' },
    no_show:   { bg: 'var(--color-surface-alt)', color: 'var(--color-text-muted)' },
    completed: { bg: 'var(--color-primary-light)', color: 'var(--color-primary)' },
  };
  const c = colors[s] ?? { bg: '#F3F4F6', color: '#374151' };
  return (
    <span style={{ padding: '2px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700, background: c.bg, color: c.color, textTransform: 'capitalize' }}>
      {s.split('_').join(' ')}
    </span>
  );
}
