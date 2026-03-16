import { useState } from 'react';
import type { Driver } from '../types';
import { api } from '../api';

interface Props {
  driver: Driver;
  onLogout: () => void;
}

const VEHICLE_ICONS: Record<string, string> = {
  bike: '🚲', scooter: '🛵', car: '🚗', motorcycle: '🏍️',
};

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '12px 0', borderBottom: '1px solid var(--color-border)',
    }}>
      <span style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>{label}</span>
      <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text)' }}>{value}</span>
    </div>
  );
}

export default function ProfilePage({ driver, onLogout }: Props) {
  const [logging, setLogging] = useState(false);

  const handleLogout = async () => {
    if (!confirm('Are you sure you want to log out?')) return;
    setLogging(true);
    try { await api.logout(); } finally {
      localStorage.removeItem('driver_token');
      onLogout();
    }
  };

  const vehicleIcon = driver.vehicle_type
    ? (VEHICLE_ICONS[driver.vehicle_type.toLowerCase()] ?? '🚚')
    : '🚚';

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--color-bg)', paddingBottom: 80 }}>
      {/* Header */}
      <div style={{
        background: 'var(--color-dark)', color: 'white',
        padding: 'max(3rem, env(safe-area-inset-top)) 1.25rem 2rem',
        textAlign: 'center',
      }}>
        <div style={{
          width: 72, height: 72, borderRadius: '50%',
          background: 'var(--color-primary)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '1.75rem', margin: '0 auto 12px',
          boxShadow: '0 4px 16px var(--color-primary-glow)',
        }}>
          {vehicleIcon}
        </div>
        <h1 style={{ fontSize: '1.25rem', fontWeight: 800, margin: '0 0 4px', letterSpacing: '-0.02em' }}>
          {driver.name}
        </h1>
        <p style={{ fontSize: '0.875rem', color: 'rgba(255,255,255,0.5)', margin: 0 }}>{driver.phone}</p>
      </div>

      <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: 12 }} className="animate-fade-in">
        {/* Info card */}
        <div style={{
          background: 'var(--color-surface)', border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-2xl)', padding: '0 1rem',
          boxShadow: 'var(--shadow-sm)',
        }}>
          <InfoRow label="Name" value={driver.name} />
          <InfoRow label="Phone" value={driver.phone} />
          <InfoRow label="Vehicle" value={driver.vehicle_type ? `${vehicleIcon} ${driver.vehicle_type}` : 'Not set'} />
          <InfoRow label="Status" value={driver.is_active ? '🟢 Active' : '🔴 Inactive'} />
          <InfoRow label="PIN" value={driver.has_pin ? '🔒 Set' : '⚠️ Not set — contact admin'} />
          {driver.last_login_at && (
            <InfoRow label="Last login" value={new Date(driver.last_login_at).toLocaleString()} />
          )}
        </div>

        {/* Logout */}
        <button
          onClick={() => void handleLogout()}
          disabled={logging}
          style={{
            width: '100%', height: 48,
            background: 'white',
            border: '1.5px solid rgba(220,38,38,0.3)',
            color: '#dc2626', borderRadius: 'var(--radius-full)',
            fontSize: '0.9375rem', fontWeight: 700,
            fontFamily: 'inherit', cursor: logging ? 'not-allowed' : 'pointer',
            transition: 'all 0.15s', opacity: logging ? 0.6 : 1,
          }}
        >
          {logging ? 'Logging out…' : '🚪 Log Out'}
        </button>

        <p style={{ textAlign: 'center', fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
          Contact your admin to update your profile or PIN.
        </p>
      </div>
    </div>
  );
}
