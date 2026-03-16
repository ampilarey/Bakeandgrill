import { useState } from 'react';
import type { Driver } from '../types';
import { api } from '../api';

interface Props {
  driver: Driver;
  onLogout: () => void;
}

const VEHICLE_ICONS: Record<string, string> = {
  bike: '🚲',
  scooter: '🛵',
  car: '🚗',
  motorcycle: '🏍️',
};

export default function ProfilePage({ driver, onLogout }: Props) {
  const [logging, setLogging] = useState(false);

  const handleLogout = async () => {
    if (!confirm('Are you sure you want to log out?')) return;
    setLogging(true);
    try {
      await api.logout();
    } finally {
      localStorage.removeItem('driver_token');
      onLogout();
    }
  };

  const vehicleIcon = driver.vehicle_type
    ? (VEHICLE_ICONS[driver.vehicle_type.toLowerCase()] ?? '🚚')
    : '🚚';

  return (
    <div className="min-h-screen bg-[#F5EFE6] pb-24">
      {/* Header */}
      <div className="bg-[#1C1408] text-white px-4 pt-12 pb-8 safe-top text-center">
        <div className="w-20 h-20 rounded-full bg-[#D4813A] flex items-center justify-center text-3xl mx-auto mb-3">
          {vehicleIcon}
        </div>
        <h1 className="text-xl font-bold">{driver.name}</h1>
        <p className="text-[#8B7355] text-sm mt-0.5">{driver.phone}</p>
      </div>

      <div className="px-4 pt-5 space-y-4">
        {/* Info card */}
        <div className="bg-white rounded-2xl overflow-hidden border border-[#EDE4D4] shadow-sm">
          <div className="divide-y divide-[#F5EFE6]">
            <InfoRow label="Name" value={driver.name} />
            <InfoRow label="Phone" value={driver.phone} />
            <InfoRow
              label="Vehicle"
              value={driver.vehicle_type ? `${vehicleIcon} ${driver.vehicle_type}` : 'Not set'}
            />
            <InfoRow label="Status" value={driver.is_active ? '🟢 Active' : '🔴 Inactive'} />
            <InfoRow label="PIN" value={driver.has_pin ? '🔒 Set' : '⚠️ Not set'} />
            {driver.last_login_at && (
              <InfoRow
                label="Last login"
                value={new Date(driver.last_login_at).toLocaleString()}
              />
            )}
          </div>
        </div>

        {/* Logout */}
        <button
          onClick={handleLogout}
          disabled={logging}
          className="w-full bg-red-50 border border-red-200 text-red-700 font-bold py-4 rounded-2xl text-base transition hover:bg-red-100 disabled:opacity-60"
        >
          {logging ? 'Logging out…' : '🚪 Log Out'}
        </button>

        <p className="text-center text-[#8B7355] text-xs mt-2">
          Contact your admin to update profile or PIN.
        </p>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center px-4 py-3">
      <span className="text-sm text-[#8B7355]">{label}</span>
      <span className="text-sm font-medium text-[#1C1408]">{value}</span>
    </div>
  );
}
