import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchOpeningHoursStatus, fetchOpeningHoursSchedule } from '../api';
import { BIZ } from '../constants/biz';
import type { DaySchedule } from '../api';
import { usePageTitle } from '../hooks/usePageTitle';

const DAY_NAMES   = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const DAY_LABELS  = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const TODAY_IDX   = new Date().getDay();

function fmt(time: string) {
  if (!time) return '';
  const [h, m] = time.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, '0')} ${period}`;
}

export function HoursPage() {
  const [isOpen, setIsOpen]     = useState<boolean | null>(null);
  const [message, setMessage]   = useState<string | null>(null);
  const [schedule, setSchedule] = useState<Record<string, DaySchedule> | null>(null);
  const [loadErr, setLoadErr]   = useState(false);

  usePageTitle('Hours');

  useEffect(() => {
    fetchOpeningHoursSchedule()
      .then(({ schedule: sched, open, closure_reason }) => {
        setSchedule(sched);
        setIsOpen(open);
        setMessage(closure_reason ?? null);
      })
      .catch(() => {
        setLoadErr(true);
        fetchOpeningHoursStatus()
          .then(({ open, message: msg }) => { setIsOpen(open); setMessage(msg ?? null); })
          .catch(() => setIsOpen(null));
      });
  }, []);

  const weekRows = DAY_NAMES.map((key, i) => {
    const row = schedule?.[key] ?? schedule?.[DAY_LABELS[i]] ?? null;
    const hoursLabel = row ? (row.closed ? 'Closed' : `${fmt(row.open)} – ${fmt(row.close)}`) : 'Hours not available';
    return { label: DAY_LABELS[i], hoursLabel, isToday: i === TODAY_IDX, closed: row?.closed ?? false };
  });

  const openBorderColor = isOpen ? 'rgba(72,199,142,0.35)' : isOpen === false ? 'rgba(255,112,67,0.35)' : 'var(--color-border)';
  const openBg          = isOpen ? 'rgba(72,199,142,0.1)' : isOpen === false ? 'rgba(255,112,67,0.1)' : 'var(--color-surface-alt)';

  return (
    <div style={{ maxWidth: '640px', margin: '0 auto', padding: '3rem 1.5rem' }}>

      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
        <h1 style={{ fontSize: 'clamp(1.75rem, 5vw, 2.5rem)', fontWeight: 800, color: 'var(--color-dark)', marginBottom: '0.875rem' }}>
          Opening Hours
        </h1>
        <p style={{ fontSize: '1rem', color: 'var(--color-text-muted)' }}>
          We're open most days — visit us at Kalaafaanu Hingun, Malé.
        </p>
      </div>

      {/* Live status */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '0.875rem',
        background: openBg,
        border: `1.5px solid ${openBorderColor}`,
        borderRadius: '14px', padding: '1.25rem 1.5rem', marginBottom: '2rem',
      }}>
        {isOpen !== null && (
          <span style={{
            width: 12, height: 12, borderRadius: '50%',
            background: isOpen ? 'var(--color-success)' : 'var(--color-error)', flexShrink: 0,
            boxShadow: `0 0 0 3px ${isOpen ? 'rgba(72,199,142,0.25)' : 'rgba(255,112,67,0.25)'}`,
          }} />
        )}
        <div>
          <p style={{ fontWeight: 700, color: 'var(--color-dark)', fontSize: '1rem', marginBottom: '0.2rem' }}>
            {isOpen === null ? 'Checking status…' : isOpen ? 'Open Now' : 'Currently Closed'}
          </p>
          {message && <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>{message}</p>}
        </div>
      </div>

      {/* Weekly schedule */}
      <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '16px', overflow: 'hidden', marginBottom: '2rem' }}>
        {(loadErr && !schedule ? DAY_LABELS.map((l) => ({ label: l, hoursLabel: '—', isToday: DAY_LABELS[TODAY_IDX] === l, closed: false })) : weekRows).map((row, i) => (
          <div
            key={row.label}
            style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '0.875rem 1.25rem',
              background: row.isToday ? 'var(--color-primary-light)' : i % 2 === 0 ? 'var(--color-surface-alt)' : 'var(--color-surface)',
              borderTop: i > 0 ? '1px solid var(--color-border)' : 'none',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
              {row.isToday && (
                <span style={{ background: 'var(--color-primary)', color: 'white', fontSize: '0.65rem', fontWeight: 700, padding: '0.15rem 0.5rem', borderRadius: '999px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Today
                </span>
              )}
              <span style={{ fontWeight: row.isToday ? 700 : 500, color: row.isToday ? 'var(--color-primary)' : 'var(--color-dark)', fontSize: '0.925rem' }}>
                {row.label}
              </span>
            </div>
            <span style={{ fontSize: '0.9rem', color: row.closed ? 'var(--color-error)' : 'var(--color-text-muted)', fontWeight: row.isToday ? 600 : 400 }}>
              {row.hoursLabel}
            </span>
          </div>
        ))}
      </div>

      {/* Note */}
      <div style={{ background: 'var(--color-warning-bg)', border: '1px solid #fde68a', borderRadius: '12px', padding: '1.25rem', marginBottom: '2rem', fontSize: '0.875rem', color: 'var(--color-warning)', lineHeight: 1.6 }}>
        <strong>Note:</strong> Hours may vary on public holidays and special occasions. For the latest updates, contact us directly or check our WhatsApp.
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: '0.875rem', flexWrap: 'wrap' }}>
        <Link
          to="/menu"
          className="btn-primary-hover"
          style={{
            flex: 1, minWidth: '160px', display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'var(--color-primary)', color: 'white', padding: '0.875rem', borderRadius: '12px',
            fontWeight: 700, fontSize: '0.925rem', textDecoration: 'none',
          }}
        >
          Order Now →
        </Link>
        <a
          href={BIZ.whatsapp}
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
