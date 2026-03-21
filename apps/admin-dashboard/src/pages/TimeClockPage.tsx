import { useState, useEffect, useRef } from 'react';
import { usePageTitle } from '../hooks/usePageTitle';
import {
  PageHeader, TableCard, TH, TD, Badge, Btn, EmptyState, StatCard, DateInput,
} from '../components/SharedUI';
import {
  getTimeClockStatus, clockIn, clockOut, getTimeClockHistory, getTimeClockSummary,
  type TimeEntry,
} from '../api';

const S = {
  tab: (active: boolean): React.CSSProperties => ({
    padding: '8px 20px', border: 'none', borderRadius: 8, cursor: 'pointer',
    fontWeight: 600, fontSize: 14, fontFamily: 'inherit',
    background: active ? '#D4813A' : 'transparent',
    color: active ? '#fff' : '#6B5D4F',
  }),
};

function fmtDuration(ms: number) {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function fmtHours(h: number | null) {
  if (h == null) return '—';
  const hrs = Math.floor(h);
  const mins = Math.round((h - hrs) * 60);
  return `${hrs}h ${mins}m`;
}

export default function TimeClockPage() {
  usePageTitle('Time Clock');

  const [tab, setTab] = useState<'clock' | 'history' | 'summary'>('clock');

  // Clock-in/out
  const [clockedIn, setClockedIn] = useState(false);
  const [sinceTime, setSinceTime] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState('00:00:00');
  const [statusLoading, setStatusLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [clockError, setClockError] = useState('');
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadStatus = async () => {
    setStatusLoading(true);
    try {
      const res = await getTimeClockStatus();
      setClockedIn(res.clocked_in);
      setSinceTime(res.entry?.clocked_in_at ?? null);
    } catch { /* ignore */ }
    finally { setStatusLoading(false); }
  };

  useEffect(() => { void loadStatus(); }, []);

  useEffect(() => {
    if (clockedIn && sinceTime) {
      timerRef.current = setInterval(() => {
        setElapsed(fmtDuration(Date.now() - new Date(sinceTime).getTime()));
      }, 1000);
    } else {
      setElapsed('00:00:00');
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [clockedIn, sinceTime]);

  const handleClock = async () => {
    setActionLoading(true); setClockError('');
    try {
      if (clockedIn) { await clockOut(); }
      else { const r = await clockIn(); setSinceTime(r.entry.clocked_in_at); }
      await loadStatus();
    } catch (e) { setClockError((e as Error).message); }
    finally { setActionLoading(false); }
  };

  // History
  const today = new Date().toISOString().slice(0, 10);
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [histLoading, setHistLoading] = useState(false);
  const [histFrom, setHistFrom] = useState(today);
  const [histTo, setHistTo] = useState(today);

  const loadHistory = async () => {
    setHistLoading(true);
    try {
      const res = await getTimeClockHistory({ from: histFrom, to: histTo });
      setEntries(res.data);
    } catch { /* ignore */ }
    finally { setHistLoading(false); }
  };

  useEffect(() => { if (tab === 'history') void loadHistory(); }, [tab, histFrom, histTo]);

  // Summary
  type SumRow = { staff: { id: number; name: string }; total_hours: number; entries_count: number };
  const [summary, setSummary] = useState<SumRow[]>([]);
  const [sumLoading, setSumLoading] = useState(false);
  const [sumFrom, setSumFrom] = useState(today);
  const [sumTo, setSumTo] = useState(today);

  const loadSummary = async () => {
    setSumLoading(true);
    try {
      const res = await getTimeClockSummary({ from: sumFrom, to: sumTo });
      setSummary(res.data);
    } catch { /* ignore */ }
    finally { setSumLoading(false); }
  };

  useEffect(() => { if (tab === 'summary') void loadSummary(); }, [tab, sumFrom, sumTo]);

  return (
    <div>
      <PageHeader title="Time Clock" />

      <div style={{ display: 'flex', gap: 8, marginBottom: 24, background: '#F5F0EB', borderRadius: 10, padding: 4, width: 'fit-content' }}>
        <button style={S.tab(tab === 'clock')} onClick={() => setTab('clock')}>Clock In/Out</button>
        <button style={S.tab(tab === 'history')} onClick={() => setTab('history')}>History</button>
        <button style={S.tab(tab === 'summary')} onClick={() => setTab('summary')}>Summary</button>
      </div>

      {/* ── Clock Tab ── */}
      {tab === 'clock' && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '40px 20px' }}>
          {clockError && <p style={{ color: '#ef4444', marginBottom: 16 }}>{clockError}</p>}

          <div style={{
            width: 200, height: 200, borderRadius: '50%',
            background: clockedIn ? '#dcfce7' : '#F5F0EB',
            border: `4px solid ${clockedIn ? '#16a34a' : '#E8E0D8'}`,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            marginBottom: 32,
          }}>
            <div style={{ fontSize: 13, color: '#6B5D4F', fontWeight: 600, marginBottom: 6 }}>
              {clockedIn ? 'CLOCKED IN' : 'CLOCKED OUT'}
            </div>
            {clockedIn && (
              <div style={{ fontSize: 22, fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: '#16a34a' }}>
                {statusLoading ? '—' : elapsed}
              </div>
            )}
            {clockedIn && sinceTime && (
              <div style={{ fontSize: 11, color: '#9C8E7E', marginTop: 6 }}>
                since {new Date(sinceTime).toLocaleTimeString()}
              </div>
            )}
          </div>

          <Btn
            onClick={handleClock}
            disabled={actionLoading || statusLoading}
            style={{
              padding: '14px 40px', fontSize: 16, fontWeight: 700,
              background: clockedIn ? '#ef4444' : '#D4813A',
              borderRadius: 12,
            }}
          >
            {actionLoading ? '…' : clockedIn ? 'Clock Out' : 'Clock In'}
          </Btn>

          {clockedIn && sinceTime && (
            <p style={{ marginTop: 16, color: '#6B5D4F', fontSize: 13 }}>
              Clocked in at {new Date(sinceTime).toLocaleTimeString()} · {new Date(sinceTime).toLocaleDateString()}
            </p>
          )}
        </div>
      )}

      {/* ── History Tab ── */}
      {tab === 'history' && (
        <>
          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end', marginBottom: 20, flexWrap: 'wrap' }}>
            <DateInput label="From" value={histFrom} onChange={v => { setHistFrom(v); }} />
            <DateInput label="To" value={histTo} onChange={v => { setHistTo(v); }} />
          </div>
          <TableCard>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Staff', 'Clock In', 'Clock Out', 'Hours', 'Status'].map(h => <th key={h} style={TH}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {histLoading ? (
                  <tr><td colSpan={5} style={{ textAlign: 'center', padding: 40, color: '#9C8E7E' }}>Loading…</td></tr>
                ) : entries.length === 0 ? (
                  <tr><td colSpan={5}><EmptyState message="No time entries for this period." /></td></tr>
                ) : entries.map(e => (
                  <tr key={e.id}>
                    <td style={{ ...TD, fontWeight: 600 }}>{e.staff?.name ?? `Staff #${e.staff_id}`}</td>
                    <td style={TD}>{new Date(e.clocked_in_at).toLocaleTimeString()} {new Date(e.clocked_in_at).toLocaleDateString()}</td>
                    <td style={TD}>{e.clocked_out_at ? `${new Date(e.clocked_out_at).toLocaleTimeString()} ${new Date(e.clocked_out_at).toLocaleDateString()}` : <span style={{ color: '#9C8E7E' }}>Still in</span>}</td>
                    <td style={{ ...TD, fontWeight: 700 }}>{fmtHours(e.hours_worked)}</td>
                    <td style={TD}>
                      <Badge color={e.clocked_out_at ? 'gray' : 'green'}>{e.clocked_out_at ? 'Complete' : 'Active'}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableCard>
        </>
      )}

      {/* ── Summary Tab ── */}
      {tab === 'summary' && (
        <>
          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end', marginBottom: 20, flexWrap: 'wrap' }}>
            <DateInput label="From" value={sumFrom} onChange={v => setSumFrom(v)} />
            <DateInput label="To" value={sumTo} onChange={v => setSumTo(v)} />
          </div>

          {summary.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 16, marginBottom: 20 }}>
              <StatCard label="Staff Tracked" value={String(summary.length)} accent="#D4813A" />
              <StatCard label="Total Hours" value={fmtHours(summary.reduce((s, r) => s + r.total_hours, 0))} accent="#6B5D4F" />
            </div>
          )}

          <TableCard>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Staff', 'Total Hours', 'Sessions'].map(h => <th key={h} style={TH}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {sumLoading ? (
                  <tr><td colSpan={3} style={{ textAlign: 'center', padding: 40, color: '#9C8E7E' }}>Loading…</td></tr>
                ) : summary.length === 0 ? (
                  <tr><td colSpan={3}><EmptyState message="No data for this period." /></td></tr>
                ) : summary.map((row, i) => (
                  <tr key={i}>
                    <td style={{ ...TD, fontWeight: 600 }}>{row.staff.name}</td>
                    <td style={{ ...TD, fontWeight: 700 }}>{fmtHours(row.total_hours)}</td>
                    <td style={{ ...TD, color: '#6B5D4F' }}>{row.entries_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableCard>
        </>
      )}
    </div>
  );
}
