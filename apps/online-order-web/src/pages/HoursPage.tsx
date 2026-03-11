import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchOpeningHoursStatus } from '../api';

const WEEKLY_HOURS = [
  { day: 'Sunday', hours: '7:00 AM – 10:00 PM' },
  { day: 'Monday', hours: '7:00 AM – 10:00 PM' },
  { day: 'Tuesday', hours: '7:00 AM – 10:00 PM' },
  { day: 'Wednesday', hours: '7:00 AM – 10:00 PM' },
  { day: 'Thursday', hours: '7:00 AM – 10:00 PM' },
  { day: 'Friday', hours: '8:00 AM – 9:00 PM' },
  { day: 'Saturday', hours: '7:00 AM – 10:00 PM' },
];

const TODAY_NAME = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][new Date().getDay()];

export function HoursPage() {
  const [isOpen, setIsOpen] = useState<boolean | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    fetchOpeningHoursStatus()
      .then(({ open, message: msg }) => {
        setIsOpen(open);
        setMessage(msg ?? null);
      })
      .catch(() => setIsOpen(null));
  }, []);

  return (
    <div style={{ maxWidth: '640px', margin: '0 auto', padding: '3rem 1.5rem' }}>
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
        <h1 style={{ fontSize: 'clamp(1.75rem, 5vw, 2.5rem)', fontWeight: 800, color: '#1c1e21', marginBottom: '0.875rem' }}>
          Opening Hours
        </h1>
        <p style={{ fontSize: '1rem', color: '#636e72' }}>
          We're open most days — come see us at Majeedhee Magu, Malé.
        </p>
      </div>

      {/* Live status */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.875rem',
        background: isOpen ? 'rgba(72,199,142,0.1)' : isOpen === false ? 'rgba(255,112,67,0.1)' : '#f8f9fa',
        border: `1.5px solid ${isOpen ? 'rgba(72,199,142,0.35)' : isOpen === false ? 'rgba(255,112,67,0.35)' : '#e9ecef'}`,
        borderRadius: '14px',
        padding: '1.25rem 1.5rem',
        marginBottom: '2rem',
      }}>
        {isOpen !== null && (
          <span style={{
            width: '12px',
            height: '12px',
            borderRadius: '50%',
            background: isOpen ? '#48c78e' : '#ff7043',
            flexShrink: 0,
            boxShadow: `0 0 0 3px ${isOpen ? 'rgba(72,199,142,0.25)' : 'rgba(255,112,67,0.25)'}`,
          }} />
        )}
        <div>
          <p style={{ fontWeight: 700, color: '#1c1e21', fontSize: '1rem', marginBottom: '0.2rem' }}>
            {isOpen === null ? 'Checking status…' : isOpen ? 'Open Now' : 'Currently Closed'}
          </p>
          {message && <p style={{ fontSize: '0.85rem', color: '#636e72' }}>{message}</p>}
        </div>
      </div>

      {/* Weekly schedule */}
      <div style={{ background: 'white', border: '1px solid #e9ecef', borderRadius: '16px', overflow: 'hidden', marginBottom: '2rem' }}>
        {WEEKLY_HOURS.map((row, i) => {
          const isToday = row.day === TODAY_NAME;
          return (
            <div
              key={row.day}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '0.875rem 1.25rem',
                background: isToday ? 'rgba(27,163,185,0.06)' : i % 2 === 0 ? '#fafbfc' : 'white',
                borderTop: i > 0 ? '1px solid #f1f3f5' : 'none',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                {isToday && (
                  <span style={{ background: '#1ba3b9', color: 'white', fontSize: '0.65rem', fontWeight: 700, padding: '0.15rem 0.5rem', borderRadius: '999px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Today
                  </span>
                )}
                <span style={{ fontWeight: isToday ? 700 : 500, color: isToday ? '#1ba3b9' : '#1c1e21', fontSize: '0.925rem' }}>
                  {row.day}
                </span>
              </div>
              <span style={{ fontSize: '0.9rem', color: '#636e72', fontWeight: isToday ? 600 : 400 }}>
                {row.hours}
              </span>
            </div>
          );
        })}
      </div>

      {/* Note */}
      <div style={{ background: '#fff8e6', border: '1px solid #fde68a', borderRadius: '12px', padding: '1.25rem', marginBottom: '2rem', fontSize: '0.875rem', color: '#92400e', lineHeight: 1.6 }}>
        <strong>Note:</strong> Hours may vary on public holidays and special occasions. For the latest updates, contact us directly or check our WhatsApp.
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: '0.875rem', flexWrap: 'wrap' }}>
        <Link
          to="/menu"
          style={{
            flex: 1,
            minWidth: '160px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#1ba3b9',
            color: 'white',
            padding: '0.875rem',
            borderRadius: '12px',
            fontWeight: 700,
            fontSize: '0.925rem',
            textDecoration: 'none',
          }}
        >
          Order Now →
        </Link>
        <a
          href="https://wa.me/9609120011"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            flex: 1,
            minWidth: '160px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.375rem',
            background: '#25D366',
            color: 'white',
            padding: '0.875rem',
            borderRadius: '12px',
            fontWeight: 600,
            fontSize: '0.925rem',
            textDecoration: 'none',
          }}
        >
          WhatsApp Us
        </a>
      </div>
    </div>
  );
}
