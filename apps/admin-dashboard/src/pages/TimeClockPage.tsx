import { useState, useEffect } from 'react';
import { usePageTitle } from '../hooks/usePageTitle';
import { useCurrentUserPermissions } from '../hooks/usePermissions';
import {
  PageHeader, TableCard, TH, TD, Badge, Btn, EmptyState, StatCard, DateInput,
} from '../components/SharedUI';
import { downloadCSV } from '../utils/csvExport';
import { today } from '../utils/dateHelpers';
import { getTimeClockHistory, getTimeClockSummary, type TimeEntry } from '../api';

const S = {
  tab: (active: boolean): React.CSSProperties => ({
    padding: '8px 20px', border: 'none', borderRadius: 8, cursor: 'pointer',
    fontWeight: 600, fontSize: 14, fontFamily: 'inherit',
    background: active ? '#D4813A' : 'transparent',
    color: active ? '#fff' : '#6B5D4F',
  }),
};

function fmtHours(h: number | null) {
  if (h == null) return '—';
  const hrs = Math.floor(h);
  const mins = Math.round((h - hrs) * 60);
  return `${hrs}h ${mins}m`;
}

export default function TimeClockPage() {
  usePageTitle('Time Clock');
  const { can } = useCurrentUserPermissions();
  const canViewSummary = can('staff.view');

  const [tab, setTab] = useState<'history' | 'summary'>('history');

  const todayStr = today();
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [histLoading, setHistLoading] = useState(false);
  const [histFrom, setHistFrom] = useState(todayStr);
  const [histTo, setHistTo] = useState(todayStr);
  const [histError, setHistError] = useState('');

  type SumRow = { staff: { id: number; name: string }; total_hours: number; entries_count: number };
  const [summary, setSummary] = useState<SumRow[]>([]);
  const [sumLoading, setSumLoading] = useState(false);
  const [sumFrom, setSumFrom] = useState(todayStr);
  const [sumTo, setSumTo] = useState(todayStr);
  const [sumError, setSumError] = useState('');

  const loadHistory = async () => {
    setHistLoading(true); setHistError('');
    try {
      const res = await getTimeClockHistory({ from: histFrom, to: histTo });
      setEntries(res.data ?? []);
    } catch (e) { setHistError((e as Error).message); }
    finally { setHistLoading(false); }
  };

  const loadSummary = async () => {
    setSumLoading(true); setSumError('');
    try {
      const res = await getTimeClockSummary({ from: sumFrom, to: sumTo });
      setSummary(res.data ?? []);
    } catch (e) { setSumError((e as Error).message); }
    finally { setSumLoading(false); }
  };

  useEffect(() => { if (tab === 'history') void loadHistory(); }, [tab, histFrom, histTo]);
  useEffect(() => {
    if (tab === 'summary' && canViewSummary) void loadSummary();
  }, [tab, sumFrom, sumTo, canViewSummary]);

  useEffect(() => {
    if (tab === 'summary' && !canViewSummary) setTab('history');
  }, [tab, canViewSummary]);

  return (
    <div>
      <PageHeader
        title="Time Clock"
        action={
          tab === 'history' && entries.length > 0 ? (
            <Btn variant="secondary" onClick={() => downloadCSV('time-clock-history', entries.map(e => ({ Staff: e.staff?.name ?? '', 'Clock In': e.clocked_in_at ?? '', 'Clock Out': e.clocked_out_at ?? '—', Hours: e.hours_worked != null ? Number(e.hours_worked).toFixed(2) : '' })))}>
              Export CSV
            </Btn>
          ) : tab === 'summary' && summary.length > 0 ? (
            <Btn variant="secondary" onClick={() => downloadCSV('time-clock-summary', summary.map(r => ({ Staff: r.staff?.name ?? '—', 'Total Hours': Number(r.total_hours).toFixed(2), Entries: r.entries_count })))}>
              Export CSV
            </Btn>
          ) : undefined
        }
      />

      <p style={{ fontSize: 13, color: '#6B5D4F', margin: '0 0 16px' }}>
        To clock in or out, use the <strong>POS terminal</strong> (Time Clock on the login screen or side menu).
      </p>

      <div role="tablist" style={{ display: 'flex', gap: 8, marginBottom: 24, background: '#F5F0EB', borderRadius: 10, padding: 4, width: 'fit-content' }}>
        <button role="tab" aria-selected={tab === 'history'} style={S.tab(tab === 'history')} onClick={() => setTab('history')}>History</button>
        {canViewSummary && (
          <button role="tab" aria-selected={tab === 'summary'} style={S.tab(tab === 'summary')} onClick={() => setTab('summary')}>Summary</button>
        )}
      </div>

      {tab === 'history' && (
        <>
          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end', marginBottom: 20, flexWrap: 'wrap' }}>
            <DateInput label="From" value={histFrom} onChange={v => { setHistFrom(v); }} />
            <DateInput label="To" value={histTo} onChange={v => { setHistTo(v); }} />
          </div>
          {histError && <p style={{ color: '#ef4444', marginBottom: 12, fontSize: 13 }}>{histError}</p>}
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

      {tab === 'summary' && canViewSummary && (
        <>
          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end', marginBottom: 20, flexWrap: 'wrap' }}>
            <DateInput label="From" value={sumFrom} onChange={v => setSumFrom(v)} />
            <DateInput label="To" value={sumTo} onChange={v => setSumTo(v)} />
          </div>

          {sumError && <p style={{ color: '#ef4444', marginBottom: 12, fontSize: 13 }}>{sumError}</p>}

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
                  <tr key={row.staff?.id ?? i}>
                    <td style={{ ...TD, fontWeight: 600 }}>{row.staff?.name ?? `Staff #${row.staff?.id ?? '?'}`}</td>
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
