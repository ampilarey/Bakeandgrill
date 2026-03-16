interface Props {
  name: string | null;
  phone: string | null;
}

export default function ContactBar({ name, phone }: Props) {
  if (!phone) return null;
  const clean = phone.replace(/\s+/g, '').replace(/^\+/, '');
  const waLink = `https://wa.me/${clean}`;

  return (
    <div style={{
      background: 'var(--color-surface)',
      border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius-2xl)',
      padding: '1rem',
      boxShadow: 'var(--shadow-sm)',
    }}>
      <p style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 10px' }}>
        Customer Contact
      </p>
      {name && (
        <p style={{ fontWeight: 700, fontSize: '0.9375rem', color: 'var(--color-text)', margin: '0 0 10px' }}>{name}</p>
      )}
      <div style={{ display: 'flex', gap: 10 }}>
        <a
          href={`tel:${phone}`}
          style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: 6, background: 'var(--color-dark)', color: 'white',
            fontWeight: 700, fontSize: '0.875rem', padding: '10px 0',
            borderRadius: 'var(--radius-lg)', textDecoration: 'none',
          }}
        >
          📞 Call
        </a>
        <a
          href={waLink}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: 6, background: '#25D366', color: 'white',
            fontWeight: 700, fontSize: '0.875rem', padding: '10px 0',
            borderRadius: 'var(--radius-lg)', textDecoration: 'none',
          }}
        >
          💬 WhatsApp
        </a>
      </div>
    </div>
  );
}
