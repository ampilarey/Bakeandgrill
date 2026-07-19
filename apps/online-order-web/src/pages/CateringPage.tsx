import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ENDPOINTS } from '@shared/api';
import { request } from '../api/client';
import type { MenuItem } from '../api/menu';
import { PageHeader } from '../components/shell/PageHeader';
import { usePageTitle } from '../hooks/usePageTitle';

type Occasion = 'office_breakfast' | 'event' | 'other';

async function submitCateringRequest(body: Record<string, unknown>) {
  return request<{ message: string; request: { id: number } }>(ENDPOINTS.CATERING_REQUESTS, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

function minEventDate(): string {
  const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

export function CateringPage() {
  usePageTitle('Catering & Events');
  const navigate = useNavigate();
  const [occasion, setOccasion] = useState<Occasion>('office_breakfast');
  const [contactName, setContactName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState('');
  const [eventDate, setEventDate] = useState(minEventDate());
  const [headcount, setHeadcount] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<MenuItem[]>([]);
  const [selected, setSelected] = useState<Record<number, boolean>>({});
  const [website, setWebsite] = useState(''); // honeypot
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    request<{ data: MenuItem[] }>(`${ENDPOINTS.ITEMS}?available_only=1&channel=catering`)
      .then((res) => setItems(res.data ?? []))
      .catch(() => setItems([]));
  }, []);

  const selectedIds = useMemo(
    () => Object.entries(selected).filter(([, v]) => v).map(([id]) => Number(id)),
    [selected],
  );

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!contactName.trim() || !phone.trim()) {
      setError('Name and phone are required.');
      return;
    }
    if (!eventDate) {
      setError('Please choose an event date.');
      return;
    }
    setLoading(true);
    try {
      await submitCateringRequest({
        occasion,
        contact_name: contactName.trim(),
        phone: phone.trim(),
        email: email.trim() || undefined,
        company: company.trim() || undefined,
        event_date: eventDate,
        headcount: headcount ? parseInt(headcount, 10) : undefined,
        notes: notes.trim() || undefined,
        interested_items: selectedIds,
        website,
      });
      setDone(true);
    } catch (err) {
      setError((err as Error).message || 'Could not submit. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <PageHeader title="Catering & Events" onBack={() => navigate(-1)} />
      <div style={S.page}>
        {done ? (
          <div style={S.card}>
            <h2 style={S.h2}>Thanks — we&apos;ll be in touch</h2>
            <p style={S.p}>
              Our team will review your request and send a quote. Confirmed jobs are fulfilled through our café kitchen.
            </p>
            <Link to="/" style={S.link}>Back to menu</Link>
          </div>
        ) : (
          <form onSubmit={onSubmit} style={S.card}>
            <p style={S.p}>
              Tell us about your office breakfast or event. We&apos;ll quote you — no online prices for catering packages.
            </p>

            <label style={S.label}>Occasion</label>
            <select style={S.input} value={occasion} onChange={(e) => setOccasion(e.target.value as Occasion)}>
              <option value="office_breakfast">Office breakfast</option>
              <option value="event">Event</option>
              <option value="other">Other</option>
            </select>

            <label style={S.label}>Event date</label>
            <input style={S.input} type="date" min={minEventDate()} value={eventDate} onChange={(e) => setEventDate(e.target.value)} required />

            <label style={S.label}>Headcount</label>
            <input style={S.input} type="number" min={1} max={5000} value={headcount} onChange={(e) => setHeadcount(e.target.value)} placeholder="e.g. 25" />

            <label style={S.label}>Your name *</label>
            <input style={S.input} value={contactName} onChange={(e) => setContactName(e.target.value)} required />

            <label style={S.label}>Phone *</label>
            <input style={S.input} value={phone} onChange={(e) => setPhone(e.target.value)} required inputMode="tel" />

            <label style={S.label}>Email</label>
            <input style={S.input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />

            <label style={S.label}>Company</label>
            <input style={S.input} value={company} onChange={(e) => setCompany(e.target.value)} />

            <label style={S.label}>Notes</label>
            <textarea style={{ ...S.input, minHeight: 88 }} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Dietary needs, delivery location, timing…" />

            {/* honeypot */}
            <input
              tabIndex={-1}
              autoComplete="off"
              aria-hidden
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              style={{ position: 'absolute', left: -9999, opacity: 0, height: 0, width: 0 }}
            />

            {items.length > 0 && (
              <>
                <p style={{ ...S.label, marginTop: 16 }}>Interested in (optional)</p>
                <p style={{ ...S.p, marginTop: 0, fontSize: 13 }}>Names only — we&apos;ll quote separately.</p>
                <div style={S.itemList}>
                  {items.map((item) => (
                    <label key={item.id} style={S.itemRow}>
                      <input
                        type="checkbox"
                        checked={!!selected[item.id]}
                        onChange={(e) => setSelected((prev) => ({ ...prev, [item.id]: e.target.checked }))}
                      />
                      <span>{item.name}</span>
                    </label>
                  ))}
                </div>
              </>
            )}

            {error && <p style={S.error}>{error}</p>}

            <button type="submit" style={S.btn} disabled={loading}>
              {loading ? 'Sending…' : 'Request a quote'}
            </button>
          </form>
        )}
      </div>
    </>
  );
}

const S: Record<string, React.CSSProperties> = {
  page: { padding: '1rem var(--page-gutter) 2.5rem', maxWidth: 560, margin: '0 auto' },
  card: {
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-2xl)',
    padding: '1.25rem',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  h2: { margin: '0 0 0.5rem', fontSize: '1.35rem', fontWeight: 800, color: 'var(--color-dark)' },
  p: { margin: '0 0 0.75rem', fontSize: 14, color: 'var(--color-text-muted)', lineHeight: 1.5 },
  label: { fontSize: 12, fontWeight: 700, color: 'var(--color-text-muted)', marginTop: 8 },
  input: {
    minHeight: 44,
    borderRadius: 10,
    border: '1px solid var(--color-border)',
    padding: '0.55rem 0.75rem',
    fontSize: 15,
    background: 'var(--color-bg)',
    color: 'var(--color-dark)',
  },
  itemList: { display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 220, overflow: 'auto' },
  itemRow: { display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, minHeight: 40 },
  btn: {
    marginTop: 16,
    minHeight: 48,
    border: 'none',
    borderRadius: 12,
    background: 'var(--color-primary)',
    color: '#fff',
    fontWeight: 800,
    fontSize: 15,
    cursor: 'pointer',
  },
  error: { color: 'var(--color-danger, #b91c1c)', fontSize: 13, margin: '8px 0 0' },
  link: { color: 'var(--color-primary)', fontWeight: 700, fontSize: 14 },
};
