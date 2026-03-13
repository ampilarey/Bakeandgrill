import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchOpeningHoursStatus, fetchOpeningHoursSchedule } from '../api';
import type { DaySchedule } from '../api';

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const DAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const TODAY_IDX = new Date().getDay();

function fmt(time: string) {
  // Convert "07:00" → "7:00 AM", "22:00" → "10:00 PM"
  if (!time) return '';
  const [h, m] = time.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, '0')} ${period}`;
}

export function HoursPage() {
  const [isOpen, setIsOpen]       = useState<boolean | null>(null);
  const [message, setMessage]     = useState<string | null>(null);
  const [schedule, setSchedule]   = useState<Record<string, DaySchedule> | null>(null);
  const [loadErr, setLoadErr]     = useState(false);

  useEffect(() => { document.title = 'Hours — Bake & Grill'; }, []);

  useEffect(() => {
    // Fetch full schedule (includes open/closed status)
    fetchOpeningHoursSchedule()
      .then(({ schedule: sched, open, closure_reason }) => {
        setSchedule(sched);
        setIsOpen(open);
        setMessage(closure_reason ?? null);
      })
      .catch(() => {
        setLoadErr(true);
        // Fall back to just the status ping
        fetchOpeningHoursStatus()
          .then(({ open, message: msg }) => { setIsOpen(open); setMessage(msg ?? null); })
          .catch(() => setIsOpen(null));
      });
  }, []);

  // Build week rows from API data, falling back to a simple display if unavailable
  const weekRows = DAY_NAMES.map((key, i) => {
    const row = schedule?.[key] ?? schedule?.[DAY_LABELS[i]] ?? null;
    let hoursLabel = 'Hours not available';
    if (row) {
      hoursLabel = row.closed ? 'Closed' : `${fmt(row.open)} – ${fmt(row.close)}`;
    }
    return { label: DAY_LABELS[i], hoursLabel, isToday: i === TODAY_IDX, closed: row?.closed ?? false };
  });

  return (
    <div style={{ maxWidth: '640px', margin: '0 auto', padding: '3rem 1.5rem' }}>

      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
        <h1 style={{ fontSize: 'clamp(1.75rem, 5vw, 2.5rem)', fontWeight: 800, color: 'var(--color-dark, #1C1408)', marginBottom: '0.875rem' }}>
          Opening Hours
        </h1>
        <p style={{ fontSize: '1rem', color: 'var(--color-text-muted, #8B7355)' }}>
          We're open most days — visit us at Kalaafaanu Hingun, Malé.
        </p>
      </div>

      {/* Live status */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '0.875rem',
        background: isOpen ? 'rgba(72,199,142,0.1)' : isOpen === false ? 'rgba(255,112,67,0.1)' : '#FFFDF9',
        border: `1.5px solid ${isOpen ? 'rgba(72,199,142,0.35)' : isOpen === false ? 'rgba(255,112,67,0.35)' : '#EDE4D4'}`,
        borderRadius: '14px', padding: '1.25rem 1.5rem', marginBottom: '2rem',
      }}>
        {isOpen !== null && (
          <span style={{
            width: 12, height: 12, borderRadius: '50%',
            background: isOpen ? '#48c78e' : '#ff7043', flexShrink: 0,
            boxShadow: `0 0 0 3px ${isOpen ? 'rgba(72,199,142,0.25)' : 'rgba(255,112,67,0.25)'}`,
          }} />
        )}
        <div>
          <p style={{ fontWeight: 700, color: 'var(--color-dark, #1C1408)', fontSize: '1rem', marginBottom: '0.2rem' }}>
            {isOpen === null ? 'Checking status…' : isOpen ? 'Open Now' : 'Currently Closed'}
          </p>
          {message && <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted, #8B7355)' }}>{message}</p>}
        </div>
      </div>

      {/* Weekly schedule */}
      <div style={{ background: 'white', border: '1px solid #EDE4D4', borderRadius: '16px', overflow: 'hidden', marginBottom: '2rem' }}>
        {(loadErr && !schedule ? DAY_LABELS.map(l => ({ label: l, hoursLabel: '—', isToday: DAY_LABELS[TODAY_IDX] === l, closed: false })) : weekRows).map((row, i) => (
          <div
            key={row.label}
            style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '0.875rem 1.25rem',
              background: row.isToday ? 'rgba(212,129,58,0.06)' : i % 2 === 0 ? '#FFFDF9' : 'white',
              borderTop: i > 0 ? '1px solid #FEF3E8' : 'none',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
              {row.isToday && (
                <span style={{ background: '#D4813A', color: 'white', fontSize: '0.65rem', fontWeight: 700, padding: '0.15rem 0.5rem', borderRadius: '999px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Today
                </span>
              )}
              <span style={{ fontWeight: row.isToday ? 700 : 500, color: row.isToday ? '#D4813A' : '#1C1408', fontSize: '0.925rem' }}>
                {row.label}
              </span>
            </div>
            <span style={{ fontSize: '0.9rem', color: row.closed ? '#ff7043' : '#8B7355', fontWeight: row.isToday ? 600 : 400 }}>
              {row.hoursLabel}
            </span>
          </div>
        ))}
      </div>

      {/* Note */}
      <div style={{ background: '#fff8e6', border: '1px solid #fde68a', borderRadius: '12px', padding: '1.25rem', marginBottom: '2rem', fontSize: '0.875rem', color: '#92400e', lineHeight: 1.6 }}>
        <strong>Note:</strong> Hours may vary on public holidays and special occasions. For the latest updates, contact us directly or check our WhatsApp.
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: '0.875rem', flexWrap: 'wrap' }}>
        <Link to="/menu" style={{
          flex: 1, minWidth: '160px', display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: '#D4813A', color: 'white', padding: '0.875rem', borderRadius: '12px',
          fontWeight: 700, fontSize: '0.925rem', textDecoration: 'none',
        }}>
          Order Now →
        </Link>
        <a
          href="https://wa.me/9609120011"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            flex: 1, minWidth: '160px', display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: '0.375rem', background: '#25D366', color: 'white', padding: '0.875rem',
            borderRadius: '12px', fontWeight: 600, fontSize: '0.925rem', textDecoration: 'none',
          }}
        >
          WhatsApp Us
        </a>
      </div>
    </div>
  );
}
