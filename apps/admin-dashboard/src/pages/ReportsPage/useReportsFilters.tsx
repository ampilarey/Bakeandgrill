import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { fetchPosStaffOptions, fetchShiftHistory, fetchDevices } from '../../api';
import { Btn, Card, DateInput } from '../../components/Layout';
import { daysAgo, tabNeedsDate, today, type Tab } from './reportsShared';

export function useReportsFilters(tab: Tab) {
  const [from, setFrom]       = useState(daysAgo(7));
  const [to, setTo]           = useState(today());
  const [cashierId, setCashierId] = useState('');
  const [shiftId, setShiftId]     = useState('');
  const [deviceId, setDeviceId]   = useState('');

  const posFilters = {
    user_id: cashierId ? Number(cashierId) : undefined,
    shift_id: shiftId ? Number(shiftId) : undefined,
    device_id: deviceId ? Number(deviceId) : undefined,
  };

  const { data: staffOptions = [] } = useQuery({
    queryKey: ['reports', 'pos-staff-options'],
    queryFn: async () => (await fetchPosStaffOptions()).staff ?? [],
  });

  const { data: shiftOptions = [] } = useQuery({
    queryKey: ['reports', 'shift-history'],
    queryFn: async () => (await fetchShiftHistory()).shifts?.map((s) => ({
      id: s.id,
      label: `#${s.id} · ${s.user?.name ?? 'Unknown'} · ${new Date(s.opened_at).toLocaleDateString()}`,
    })) ?? [],
  });

  const { data: deviceOptions = [] } = useQuery({
    queryKey: ['reports', 'devices'],
    queryFn: async () => (await fetchDevices()).data?.map((d) => ({ id: d.id, name: d.name })) ?? [],
  });

  const needsDate = tabNeedsDate(tab);

  return {
    from,
    setFrom,
    to,
    setTo,
    cashierId,
    setCashierId,
    shiftId,
    setShiftId,
    deviceId,
    setDeviceId,
    posFilters,
    staffOptions,
    shiftOptions,
    deviceOptions,
    needsDate,
  };
}

type ReportsFiltersProps = {
  tab: Tab;
  from: string;
  setFrom: (v: string) => void;
  to: string;
  setTo: (v: string) => void;
  cashierId: string;
  setCashierId: (v: string) => void;
  shiftId: string;
  setShiftId: (v: string) => void;
  deviceId: string;
  setDeviceId: (v: string) => void;
  staffOptions: { id: number; name: string }[];
  shiftOptions: { id: number; label: string }[];
  deviceOptions: { id: number; name: string }[];
  onApply: () => void;
};

export function ReportsFilters({
  tab,
  from,
  setFrom,
  to,
  setTo,
  cashierId,
  setCashierId,
  shiftId,
  setShiftId,
  deviceId,
  setDeviceId,
  staffOptions,
  shiftOptions,
  deviceOptions,
  onApply,
}: ReportsFiltersProps) {
  return (
    <Card style={{ marginBottom: 20 }}>
      <div className="mobile-filters-body" data-responsive-grid style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
        <DateInput label="From" value={from} onChange={setFrom} />
        <DateInput label="To"   value={to}   onChange={setTo} />
        {tab === 'Summary' && (
          <>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: '#6B5D4F' }}>
              Cashier
              <select value={cashierId} onChange={(e) => setCashierId(e.target.value)} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #E8E0D8', fontFamily: 'inherit', fontSize: 13 }}>
                <option value="">All</option>
                {staffOptions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: '#6B5D4F' }}>
              Shift
              <select value={shiftId} onChange={(e) => setShiftId(e.target.value)} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #E8E0D8', fontFamily: 'inherit', fontSize: 13, maxWidth: 220 }}>
                <option value="">All</option>
                {shiftOptions.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: '#6B5D4F' }}>
              Station
              <select value={deviceId} onChange={(e) => setDeviceId(e.target.value)} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #E8E0D8', fontFamily: 'inherit', fontSize: 13 }}>
                <option value="">All</option>
                {deviceOptions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </label>
          </>
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          {[{ label: 'Today', days: 0 }, { label: '7 days', days: 7 }, { label: '30 days', days: 30 }, { label: '90 days', days: 90 }].map(({ label, days }) => (
            <Btn key={label} small variant="secondary" onClick={() => { setFrom(daysAgo(days)); setTo(today()); }}>
              {label}
            </Btn>
          ))}
          <Btn small onClick={onApply}>Apply</Btn>
        </div>
      </div>
    </Card>
  );
}
