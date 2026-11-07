import { useSearchParams, Link } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { fetchTicketTimes, type TicketStageKey, type TicketTimesGroup } from '../../api';
import { Btn, Card, DateInput, ErrorMsg, Select, Spinner, TabScrollRow, TD, TD_NOWRAP, TH, TableCard } from '../../components/SharedUI';
import { ColumnChart } from '../../components/charts/ColumnChart';
import { minutesWord } from '../../components/TicketTimeline';
import { downloadCSV } from '../../utils/csvExport';
import { iso, presetRange, type PresetKey } from '../../components/dashboard/salesInsightsMath';

/*
 * Reports → Operations → Ticket times (owner, 2026-11-07: "Will the site record time for each
 * ticket and can admin view that?" → "Both"). How long tickets take at each stage, typical
 * (the middle ticket), average and slow (one in ten is slower), by hour, day, order type and
 * cashier, and the slowest tickets, each opening its order. Phone first: the stage cards
 * stack, the tables turn into cards on their own (utils/tableCards.ts).
 */

const QUICK_DAYS: { key: PresetKey; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'this_week', label: 'This week' },
  { key: 'this_month', label: 'This month' },
  { key: 'last_month', label: 'Last month' },
];

export const STAGES: { key: TicketStageKey; label: string; help: string }[] = [
  { key: 'to_kitchen', label: 'Rung up to kitchen', help: 'From ringing up to Fire to kitchen' },
  { key: 'cooking', label: 'Cooking', help: 'From Start cooking (or sent) to ready' },
  { key: 'handover', label: 'Ready to collected', help: 'From ready to collected, served or delivered' },
  { key: 'to_pay', label: 'Waiting to pay', help: 'Till tickets: from ringing up to paid' },
  { key: 'total', label: 'Whole ticket', help: 'From ringing up to collected, served or delivered' },
];

const TYPE_WORDS: Record<string, string> = { dine_in: 'Dine in', takeaway: 'Takeaway', online_pickup: 'Pickup', delivery: 'Delivery' };
const typeWord = (t: string) => TYPE_WORDS[t] ?? t.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
const hourWord = (h: string) => { const n = Number(h); return `${n % 12 === 0 ? 12 : n % 12} ${n < 12 ? 'AM' : 'PM'}`; };
const dayWord = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('en-MV', { weekday: 'short', day: 'numeric', month: 'short' });
const dash = (m: number | null | undefined) => (m === null || m === undefined ? '–' : minutesWord(m));

function GroupTable({ rows, first, label, testId }: { rows: TicketTimesGroup[]; first: string; label: (g: TicketTimesGroup) => string; testId: string }) {
  if (rows.length === 0) return null;
  return (
    <TableCard>
      <div className="table-scroll" data-testid={testId}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr>
              <th style={TH}>{first}</th>
              <th style={{ ...TH, textAlign: 'right' }}>Tickets</th>
              {STAGES.map((s) => <th key={s.key} style={{ ...TH, textAlign: 'right' }}>{s.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((g) => (
              <tr key={g.key}>
                <td style={TD}>{label(g)}</td>
                <td style={{ ...TD_NOWRAP, textAlign: 'right' }}>{g.tickets}</td>
                {STAGES.map((s) => <td key={s.key} style={{ ...TD_NOWRAP, textAlign: 'right' }}>{dash(g[s.key])}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </TableCard>
  );
}

export function TicketTimesReport() {
  const [params, setParams] = useSearchParams();
  const todayIso = iso(new Date());
  const from = params.get('from') ?? todayIso;
  const to = params.get('to') ?? from;
  const type = params.get('type') ?? '';
  const staff = params.get('staff') ?? '';

  const set = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === '') next.delete(k);
      else next.set(k, v);
    }
    setParams(next, { replace: true });
  };

  const query = useQuery({
    queryKey: ['ticket-times', from, to, type, staff],
    queryFn: () => fetchTicketTimes({ from, to, type: type || null, user_id: staff ? Number(staff) : null }),
    placeholderData: keepPreviousData,
  });
  const data = query.data;
  const pickedPreset = QUICK_DAYS.find((p) => { const r = presetRange(p.key); return r.from === from && r.to === to; })?.key;
  const leftOut = data ? Object.values(data.left_out).reduce((a, b) => Math.max(a, b), 0) : 0;

  const exportCsv = () => {
    if (!data) return;
    downloadCSV(`ticket-times-${data.range.from}-to-${data.range.to}`, data.slowest.map((t) => ({
      Order: t.order_number, Type: typeWord(t.type), 'Rung up': t.at, Seat: t.who ?? '', Cashier: t.staff ?? '',
      ...Object.fromEntries(STAGES.map((s) => [`${s.label} (min)`, t[s.key] ?? ''])),
    })));
  };

  const typeOptions = [{ value: '', label: 'All order types' }, ...['dine_in', 'takeaway', 'online_pickup', 'delivery', ...(data?.type_choices ?? [])]
    .filter((t, i, a) => a.indexOf(t) === i).map((t) => ({ value: t, label: typeWord(t) }))];
  const staffOptions = [{ value: '', label: 'Everyone' }, ...(data?.staff_choices ?? []).map((s) => ({ value: String(s.id), label: s.name }))];

  return (
    <div data-testid="ticket-times" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Card style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <TabScrollRow role="group" aria-label="Days" style={{ gap: 6 }}>
          {QUICK_DAYS.map((p) => (
            <Btn key={p.key} small variant={pickedPreset === p.key ? 'primary' : 'secondary'} aria-pressed={pickedPreset === p.key}
              onClick={() => { const r = presetRange(p.key); set({ from: r.from, to: r.to }); }}>{p.label}</Btn>
          ))}
        </TabScrollRow>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <DateInput label="From" value={from} max={todayIso} onChange={(v) => v && set({ from: v, to: v > to ? v : to })} />
          <DateInput label="To" value={to} max={todayIso} onChange={(v) => v && set({ to: v, from: v < from ? v : from })} />
          <Select label="Order type" aria-label="Order type" value={type} onChange={(v) => set({ type: v })} options={typeOptions} />
          <Select label="Cashier" aria-label="Cashier" value={staff} onChange={(v) => set({ staff: v })} options={staffOptions} />
          <Btn small variant="secondary" disabled={!data || data.slowest.length === 0} onClick={exportCsv}><Download size={14} /> Export</Btn>
        </div>
      </Card>

      {query.isError && <ErrorMsg message="Could not load ticket times." />}
      {query.isLoading && <Spinner />}

      {data && (
        <>
          <p data-testid="ticket-times-count" style={{ margin: 0, fontSize: 13, color: 'var(--color-text-secondary)' }}>
            {data.tickets === 0 ? 'No tickets in this period.' : `${data.tickets} ticket${data.tickets === 1 ? '' : 's'}. Typical is the middle ticket; slow means one in ten took longer.`}
          </p>

          <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))' }}>
            {STAGES.map((s) => {
              const st = data.stages[s.key];
              return (
                <Card key={s.key} data-testid={`ticket-stage-${s.key}`} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-secondary)' }}>{s.label}</span>
                  <strong style={{ fontSize: 22 }}>{st.count ? dash(st.median) : '–'}</strong>
                  <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                    {st.count ? `Average ${dash(st.avg)} · slow ${dash(st.p90)} · longest ${dash(st.max)}` : 'Not recorded yet'}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{s.help}{st.count ? ` · ${st.count} tickets` : ''}</span>
                </Card>
              );
            })}
          </div>
          {leftOut > 0 && (
            <p style={{ margin: 0, fontSize: 12, color: 'var(--color-text-muted)' }}>
              Left out: stages over {minutesWord(data.max_minutes)} (a ticket closed long after, such as one left on the kitchen screen overnight).
            </p>
          )}

          {data.by_hour.length > 0 && (
            <Card>
              <p style={{ fontWeight: 700, fontSize: 14, margin: '0 0 10px' }}>Whole ticket by hour rung up</p>
              <ColumnChart testId="ticket-times-hours" labelEvery={data.by_hour.length > 12 ? 2 : 1}
                bars={data.by_hour.map((h) => ({ key: h.key, label: hourWord(h.key), short: hourWord(h.key).replace(' ', ''), value: h.total ?? h.cooking ?? 0, sub: `${h.tickets} tickets` }))}
                format={(v) => minutesWord(v) || '0 min'} />
            </Card>
          )}

          {data.slowest.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <p style={{ fontWeight: 700, fontSize: 14, margin: 0 }}>Slowest tickets</p>
              <TableCard>
                <div className="table-scroll" data-testid="ticket-times-slowest">
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr>
                        <th style={TH}>Order</th>
                        <th style={TH}>Rung up</th>
                        {STAGES.map((s) => <th key={s.key} style={{ ...TH, textAlign: 'right' }}>{s.label}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {data.slowest.map((t) => (
                        <tr key={t.id}>
                          <td style={TD}>
                            <Link to={`/orders?order=${t.id}`} style={{ color: 'var(--color-primary)', fontWeight: 600 }}>#{t.order_number}</Link>
                            <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
                              {[typeWord(t.type), t.who, t.staff].filter(Boolean).join(' · ')}
                            </div>
                          </td>
                          <td style={TD_NOWRAP}>{new Date(t.at).toLocaleString('en-MV', { timeZone: 'Indian/Maldives', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</td>
                          {STAGES.map((s) => <td key={s.key} style={{ ...TD_NOWRAP, textAlign: 'right' }}>{dash(t[s.key])}</td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </TableCard>
            </div>
          )}

          {[
            { title: 'By order type', rows: data.by_type, first: 'Type', label: (g: TicketTimesGroup) => typeWord(g.key), testId: 'ticket-times-types' },
            { title: 'By cashier', rows: data.by_staff, first: 'Cashier', label: (g: TicketTimesGroup) => g.name ?? g.key, testId: 'ticket-times-staff' },
            { title: 'By day', rows: data.by_day.length > 1 ? data.by_day : [], first: 'Day', label: (g: TicketTimesGroup) => dayWord(g.key), testId: 'ticket-times-days' },
          ].filter((b) => b.rows.length > 0).map((b) => (
            <div key={b.title} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <p style={{ fontWeight: 700, fontSize: 14, margin: 0 }}>{b.title}</p>
              <GroupTable rows={b.rows} first={b.first} label={b.label} testId={b.testId} />
            </div>
          ))}
        </>
      )}
    </div>
  );
}
