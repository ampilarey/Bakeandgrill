import { useCallback, useEffect, useState } from 'react';
import {
  exportSmsLogs, fetchSmsLogs, type SmsLog, type SmsLogFilters, type SmsLogTotals, type SmsLogTypeOption,
} from '../../api';
import {
  Badge, Btn, DateInput, EmptyState, Pagination, Select, Spinner, StatCard, TableCard, TD, statColor,
} from '../../components/SharedUI';

/**
 * Every SMS the system tried to send (SMS audit, 2026-09-24). The old
 * type dropdown offered names nothing was stored under; this one lists
 * the real types, filters by category and status, searches number,
 * customer and message, takes a date range, totals up the filter and
 * exports it as CSV.
 */
const CATEGORY_LABELS: Record<string, string> = {
  auth: 'Login codes', transactional: 'Orders & payments', staff: 'Staff & owner alerts', marketing: 'Marketing', system: 'System',
};

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'sent', label: 'Sent' },
  { value: 'failed', label: 'Failed' },
  { value: 'deferred', label: 'Held (quiet hours)' },
  { value: 'suppressed', label: 'Suppressed (opt-out / cap)' },
  { value: 'disabled', label: 'Blocked (switch / budget)' },
  { value: 'queued', label: 'Queued' },
  { value: 'demo', label: 'Demo' },
];

const EMPTY_FILTERS: SmsLogFilters = { type: '', category: '', status: '', q: '', from: '', to: '' };

/** `initialFilters`: a campaign row's "View log" opens the tab already narrowed to that campaign. */
export function LogsTab({ initialFilters }: { initialFilters?: Partial<SmsLogFilters> } = {}) {
  const [logs, setLogs] = useState<SmsLog[]>([]);
  const [totals, setTotals] = useState<SmsLogTotals | null>(null);
  const [types, setTypes] = useState<SmsLogTypeOption[]>([]);
  const [meta, setMeta] = useState({ current_page: 1, last_page: 1, total: 0 });
  const [page, setPage] = useState(1);
  const [draft, setDraft] = useState<SmsLogFilters>({ ...EMPTY_FILTERS, ...initialFilters });
  const [filters, setFilters] = useState<SmsLogFilters>({ ...EMPTY_FILTERS, ...initialFilters });
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [loadError, setLoadError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const res = await fetchSmsLogs({ ...filters, page, per_page: 50 });
      setLogs(res.data ?? []);
      setTotals(res.totals);
      setTypes(res.types ?? []);
      setMeta({ current_page: res.current_page, last_page: res.last_page, total: res.total });
    } catch (e) {
      setLoadError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [filters, page]);

  useEffect(() => { void load(); }, [load]);

  const apply = () => { setPage(1); setFilters(draft); };
  const reset = () => { setDraft(EMPTY_FILTERS); setPage(1); setFilters(EMPTY_FILTERS); };

  const doExport = async () => {
    setExporting(true);
    setLoadError('');
    try {
      const blob = await exportSmsLogs(filters);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sms-log-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setLoadError((e as Error).message);
    } finally {
      setExporting(false);
    }
  };

  const typeOptions = [
    { value: '', label: 'All types' },
    ...[...types].sort((a, b) => a.category.localeCompare(b.category) || a.label.localeCompare(b.label))
      .filter((t) => !draft.category || t.category === draft.category)
      .map((t) => ({ value: t.key, label: `${t.label}` })),
  ];

  return (
    <>
      {loadError && (
        <div style={{ background: 'var(--color-danger-bg)', color: 'var(--color-danger-strong)', padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: '0.875rem' }}>
          {loadError}
        </div>
      )}
      {filters.campaign_id && (
        <div data-testid="sms-log-campaign-chip" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, fontSize: 13, color: 'var(--color-text-secondary)' }}>
          Showing texts from campaign #{filters.campaign_id}
          <Btn small variant="ghost" onClick={reset}>Show all</Btn>
        </div>
      )}
      {totals && (
        <div className="stat-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 20 }} data-testid="sms-log-totals">
          <StatCard label="Texts (this filter)" value={totals.count.toLocaleString()} accent="var(--color-primary)" />
          <StatCard label="Sent" value={(totals.by_status.sent ?? 0).toLocaleString()} accent="var(--color-success)" />
          <StatCard label="Failed / blocked" value={((totals.by_status.failed ?? 0) + (totals.by_status.disabled ?? 0) + (totals.by_status.suppressed ?? 0)).toLocaleString()} accent="var(--color-danger)" />
          <StatCard label="Cost" value={`MVR ${totals.cost_mvr.toFixed(2)}`} sub={`${totals.segments.toLocaleString()} segments`} accent="var(--color-warning)" />
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <input
          type="search"
          aria-label="Search SMS log"
          placeholder="Number, customer or words in the text"
          value={draft.q ?? ''}
          onChange={(e) => setDraft((d) => ({ ...d, q: e.target.value }))}
          onKeyDown={(e) => { if (e.key === 'Enter') apply(); }}
          style={{ minHeight: 44, padding: '0 12px', borderRadius: 10, border: '1.5px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)', fontFamily: 'inherit', fontSize: 13, flex: '1 1 220px' }}
        />
        <Select aria-label="Category" value={draft.category ?? ''} onChange={(v) => setDraft((d) => ({ ...d, category: v, type: '' }))} options={[
          { value: '', label: 'All categories' },
          ...Object.entries(CATEGORY_LABELS).map(([value, label]) => ({ value, label })),
        ]} style={{ width: 190 }} />
        <Select aria-label="Type" value={draft.type ?? ''} onChange={(v) => setDraft((d) => ({ ...d, type: v }))} options={typeOptions} style={{ width: 220 }} />
        <Select aria-label="Status" value={draft.status ?? ''} onChange={(v) => setDraft((d) => ({ ...d, status: v }))} options={STATUS_OPTIONS} style={{ width: 200 }} />
        <DateInput label="From" value={draft.from ?? ''} onChange={(v) => setDraft((d) => ({ ...d, from: v }))} />
        <DateInput label="To" value={draft.to ?? ''} onChange={(v) => setDraft((d) => ({ ...d, to: v }))} />
        <Btn onClick={apply}>Filter</Btn>
        <Btn variant="secondary" onClick={reset}>Clear</Btn>
        <Btn variant="secondary" onClick={() => { void doExport(); }} disabled={exporting || !totals || totals.count === 0}>
          {exporting ? 'Exporting…' : 'Export CSV'}
        </Btn>
      </div>

      {loading && logs.length === 0 ? <Spinner /> : logs.length === 0 ? (
        <TableCard><EmptyState message="No SMS match this filter." /></TableCard>
      ) : (
        <TableCard>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                {['When', 'To', 'Type', 'Status', 'Message', 'Seg.', 'Cost'].map((h) => (
                  <th key={h} style={{ ...TD, textAlign: 'left', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-text-muted)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id} data-testid={`sms-log-${l.id}`}>
                  <td style={{ ...TD, color: 'var(--color-text-muted)', fontSize: 11, whiteSpace: 'nowrap' }}>
                    {new Date(l.sent_at ?? l.created_at).toLocaleString()}
                  </td>
                  <td style={{ ...TD, fontWeight: 600, whiteSpace: 'nowrap' }}>
                    {l.to}
                    {l.customer_name && <span style={{ display: 'block', fontWeight: 400, fontSize: 11, color: 'var(--color-text-muted)' }}>{l.customer_name}</span>}
                  </td>
                  <td style={TD}>
                    <Badge label={l.type_label ?? l.type} color="blue" />
                    {l.category && <span style={{ display: 'block', fontSize: 11, color: 'var(--color-text-muted)', marginTop: 2 }}>{CATEGORY_LABELS[l.category] ?? l.category}</span>}
                  </td>
                  <td style={TD}><Badge label={l.status} color={statColor(l.status)} /></td>
                  <td style={{ ...TD, color: 'var(--color-text-secondary)', maxWidth: 320 }}>
                    <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={l.message}>
                      {l.message}
                    </span>
                    {l.error_message && <span style={{ color: 'var(--color-danger)', fontSize: 11 }}>{l.error_message}</span>}
                  </td>
                  <td style={{ ...TD, color: 'var(--color-text-secondary)', textAlign: 'center' }}>{l.segments}</td>
                  <td style={{ ...TD, color: 'var(--color-primary)', fontWeight: 600, whiteSpace: 'nowrap' }}>MVR {l.cost_estimate_mvr}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination page={meta.current_page} totalPages={meta.last_page} onChange={setPage} />
        </TableCard>
      )}
    </>
  );
}
