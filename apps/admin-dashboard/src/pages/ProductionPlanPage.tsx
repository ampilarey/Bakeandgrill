import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Badge, Btn, Card, DateInput, EmptyState, ErrorMsg, Input, PageHeader, PageShell, Select, Spinner,
  StatCard, TableCard, TD, TH,
} from '../components/SharedUI';
import { Tabs, TabList, Tab } from '../components/ui/Tabs';
import { Toggle } from '../components/ui/Toggle';
import { usePageTitle } from '../hooks/usePageTitle';
import { useCurrentUserPermissions } from '../hooks/usePermissions';
import { useIsMobile } from '../hooks/useIsMobile';
import { daysFromToday, today } from '../utils/dateHelpers';
import { mvr } from '../utils/fmt';
import {
  commitProductionPlan,
  createProductionCalendarPeriod,
  deleteProductionCalendarPeriod,
  getPlanCustomerHabits,
  getProductionCalendar,
  getProductionPlan,
  getProductionPlanAccuracy,
  getProductionPlanSettings,
  updateProductionCalendarPeriod,
  updateProductionPlanItem,
  updateProductionPlanSettings,
  type PlanAccuracy,
  type PlanCalendar,
  type PlanCalendarInput,
  type PlanCalendarPeriod,
  type PlanCommitLine,
  type PlanCustomerHabits,
  type PlanItem,
  type PlanSettings,
  type PlanSlotRow,
  type ProductionPlan,
} from '../api/production-plan';

/*
 * Production plan — owner, 2026-09-08: "for Friday evening we will need to
 * make 50 bajiya", with the start, middle and end of the month selling
 * differently, school and office holidays moving sales, and the question
 * of what registered customers' habits can add.
 *
 * The number in each box is the plan; the small figure under it is what
 * the model reckons. The kitchen changes the box, not the model.
 */

type TabId = 'plan' | 'calendar' | 'accuracy' | 'customers' | 'settings';

const TABS: { id: TabId; label: string }[] = [
  { id: 'plan', label: 'Plan' },
  { id: 'calendar', label: 'Holidays & closures' },
  { id: 'accuracy', label: 'How it did' },
  { id: 'customers', label: 'Customers' },
  { id: 'settings', label: 'Settings' },
];

const POSITION_LABEL: Record<string, string> = {
  start: 'start of month',
  mid: 'mid-month',
  end: 'end of month',
};

/** Whole numbers stay whole; anything else gets one decimal. */
function q(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function pct(value: number | null | undefined): string {
  return value == null ? '—' : `${Math.round(value)}%`;
}

function factorText(index: number): string {
  const delta = Math.round((index - 1) * 100);
  if (delta === 0) return 'no change';
  return `${delta > 0 ? '+' : ''}${delta}%`;
}

function weekdayShort(date: string): string {
  const d = new Date(`${date}T12:00:00`);
  return Number.isNaN(d.getTime()) ? date : d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

function slotHours(from: number, to: number): string {
  const h = (n: number) => `${String(n).padStart(2, '0')}:00`;
  return `${h(from)}–${h(to)}`;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function ProductionPlanPage() {
  usePageTitle('Production Plan');
  const { can } = useCurrentUserPermissions();
  const canManage = can('kitchen.production.manage');
  const [tab, setTab] = useState<TabId>('plan');

  return (
    <PageShell>
      <PageHeader
        section="Monitor"
        title="Production Plan"
        subtitle="How many of each thing to make, slot by slot, from what has sold on days like it."
      />
      <Tabs active={tab} onChange={(id) => setTab(id as TabId)}>
        <TabList>
          {TABS.map((t) => <Tab key={t.id} id={t.id}>{t.label}</Tab>)}
        </TabList>
      </Tabs>
      <div style={{ marginTop: 16 }}>
        {tab === 'plan' && <PlanTab canManage={canManage} />}
        {tab === 'calendar' && <PlanCalendarTab canManage={canManage} />}
        {tab === 'accuracy' && <PlanAccuracyTab />}
        {tab === 'customers' && <PlanCustomersTab />}
        {tab === 'settings' && <PlanSettingsTab canManage={canManage} />}
      </div>
    </PageShell>
  );
}

// ─── Plan ─────────────────────────────────────────────────────────────────────

export function PlanTab({ canManage }: { canManage: boolean }) {
  const isMobile = useIsMobile();
  const [date, setDate] = useState(() => daysFromToday(1));
  const [plan, setPlan] = useState<ProductionPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [drafts, setDrafts] = useState<Record<string, Record<string, string>>>({});
  const [open, setOpen] = useState<string | null>(null);
  const [showHidden, setShowHidden] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');

  const load = useCallback(async (d: string) => {
    setLoading(true);
    setError('');
    try {
      setPlan(await getProductionPlan(d));
      setDrafts({});
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the plan.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(date); }, [date, load]);

  const items = useMemo(
    () => (plan?.items ?? []).filter((it) => showHidden || it.enabled),
    [plan, showHidden],
  );
  const hiddenCount = (plan?.items ?? []).filter((it) => !it.enabled).length;

  const plannedFor = (item: PlanItem, slotKey: string): number => {
    const draft = drafts[item.key]?.[slotKey];
    if (draft !== undefined) {
      const v = parseFloat(draft);
      return Number.isFinite(v) && v >= 0 ? v : 0;
    }
    const row = item.slots[slotKey];
    return row.saved_planned ?? row.planned;
  };
  const dayTotal = (item: PlanItem): number =>
    (plan?.slots ?? []).reduce((sum, s) => sum + plannedFor(item, s.key), 0);

  const setDraft = (key: string, slotKey: string, value: string) =>
    setDrafts((d) => ({ ...d, [key]: { ...(d[key] ?? {}), [slotKey]: value } }));

  const shift = (days: number) => {
    const d = new Date(`${date}T12:00:00`);
    d.setDate(d.getDate() + days);
    setDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
  };

  const save = async () => {
    if (!plan) return;
    setSaving(true);
    setToast('');
    setError('');
    try {
      const lines: PlanCommitLine[] = [];
      for (const item of items) {
        for (const slot of plan.slots) {
          lines.push({
            item_id: item.item_id,
            variant_id: item.variant_id,
            slot_start: slot.from,
            slot_end: slot.to,
            slot_label: slot.label,
            forecast_qty: item.slots[slot.key].forecast,
            planned_qty: plannedFor(item, slot.key),
          });
        }
      }
      if (lines.length === 0) {
        setToast('Nothing to save.');
        return;
      }
      const res = await commitProductionPlan(plan.date, lines);
      setToast(`Saved the plan for ${weekdayShort(res.date)}.`);
      await load(plan.date);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the plan.');
    } finally {
      setSaving(false);
    }
  };

  const reviewing = !!plan && (plan.is_today || plan.is_past);

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <Card>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
          <div data-testid="plan-date">
            <DateInput label="Plan for" value={date} onChange={setDate} />
          </div>
          <Btn variant="secondary" small onClick={() => shift(-1)} aria-label="Previous day">‹ Day before</Btn>
          <Btn variant="secondary" small onClick={() => shift(1)} aria-label="Next day">Day after ›</Btn>
          <Btn variant="secondary" small onClick={() => setDate(daysFromToday(1))}>Tomorrow</Btn>
          <Btn variant="secondary" small onClick={() => setDate(today())}>Today</Btn>
          <div style={{ flex: 1 }} />
          <Btn variant="secondary" small onClick={() => window.print()}>Print</Btn>
          <Btn onClick={() => void save()} disabled={saving || loading || !plan || plan.closed || items.length === 0} data-testid="plan-save">
            {saving ? 'Saving…' : 'Save plan'}
          </Btn>
        </div>
        {plan && <DayStrip plan={plan} />}
        {toast && <p role="status" style={{ marginTop: 10, color: 'var(--color-success-strong)', fontSize: 13 }}>{toast}</p>}
      </Card>

      {error && <ErrorMsg message={error} />}
      {loading && <Spinner />}

      {!loading && plan && plan.closed && (
        <EmptyState message={`Closed on ${weekdayShort(plan.date)}${plan.closed_reason ? ` — ${plan.closed_reason}` : ''}. Nothing to make.`} />
      )}

      {!loading && plan && !plan.closed && !plan.history.enough && (
        <EmptyState message={`Only ${plan.history.open_days} trading day${plan.history.open_days === 1 ? '' : 's'} of sales so far. The plan needs at least a week of completed orders before it can say anything useful.`} />
      )}

      {!loading && plan && !plan.closed && plan.history.enough && (
        <>
          {items.length === 0 ? (
            <EmptyState message="No items have sold in the look-back window." />
          ) : isMobile ? (
            <div style={{ display: 'grid', gap: 12 }}>
              {items.map((item) => (
                <Card key={item.key} data-testid={`plan-item-${item.key}`}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                    <strong>{item.name}</strong>
                    <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>Day: <b>{q(dayTotal(item))}</b></span>
                  </div>
                  {!item.enabled && <Badge color="gray" label="hidden" />}
                  <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
                    {plan.slots.map((slot) => (
                      <div key={slot.key} style={{ display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center', gap: 8 }}>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600 }}>{slot.label} <span style={{ color: 'var(--color-text-muted)', fontWeight: 400 }}>{slotHours(slot.from, slot.to)}</span></div>
                          <SlotHints item={item} slotKey={slot.key} reviewing={reviewing} />
                        </div>
                        <PlannedBox item={item} slotKey={slot.key} slotLabel={slot.label} value={drafts[item.key]?.[slot.key] ?? String(plannedFor(item, slot.key))} onChange={(v) => setDraft(item.key, slot.key, v)} />
                      </div>
                    ))}
                  </div>
                  <CustomersLine item={item} />
                  <Btn variant="ghost" small onClick={() => setOpen(open === item.key ? null : item.key)} data-testid={`plan-evidence-${item.key}`}>
                    {open === item.key ? 'Hide the working' : 'Show the working'}
                  </Btn>
                  {open === item.key && <Evidence item={item} plan={plan} />}
                </Card>
              ))}
            </div>
          ) : (
            <TableCard>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={TH}>Item</th>
                    {plan.slots.map((slot) => (
                      <th key={slot.key} style={{ ...TH, textAlign: 'center' }}>
                        {slot.label}
                        <div style={{ fontSize: 11, fontWeight: 400, color: 'var(--color-text-muted)' }}>{slotHours(slot.from, slot.to)}</div>
                      </th>
                    ))}
                    <th style={{ ...TH, textAlign: 'right' }}>Day</th>
                    <th style={TH}>Regulars</th>
                    <th style={TH} />
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <PlanRow
                      key={item.key}
                      item={item}
                      plan={plan}
                      reviewing={reviewing}
                      drafts={drafts[item.key] ?? {}}
                      plannedFor={plannedFor}
                      dayTotal={dayTotal(item)}
                      onDraft={(slotKey, v) => setDraft(item.key, slotKey, v)}
                      open={open === item.key}
                      onToggle={() => setOpen(open === item.key ? null : item.key)}
                    />
                  ))}
                </tbody>
              </table>
            </TableCard>
          )}

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center', fontSize: 13, color: 'var(--color-text-secondary)' }}>
            {hiddenCount > 0 && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input type="checkbox" checked={showHidden} onChange={(e) => setShowHidden(e.target.checked)} data-testid="plan-show-hidden" />
                Show {hiddenCount} hidden item{hiddenCount === 1 ? '' : 's'}
              </label>
            )}
            <span>
              The figure under each box is the model's reckoning at the item's service level; the box is what the kitchen will make.
              {canManage ? ' Service levels, batch sizes and floors are under Settings.' : ''}
            </span>
          </div>
        </>
      )}
    </div>
  );
}

function DayStrip({ plan }: { plan: ProductionPlan }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginTop: 12, fontSize: 13 }} data-testid="plan-day-strip">
      <strong>{plan.weekday} {plan.date}</strong>
      <Badge color="blue" label={POSITION_LABEL[plan.month_position.key] ?? plan.month_position.label} />
      {plan.calendar.map((c) => (
        <Badge key={c.kind} color="orange">
          {c.label}{c.expected_change_pct != null ? ` (${c.expected_change_pct > 0 ? '+' : ''}${c.expected_change_pct}% expected)` : ''}
        </Badge>
      ))}
      {plan.is_today && <Badge color="green" label="today" />}
      {plan.is_past && <Badge color="gray" label="past — showing what sold" />}
      <span style={{ color: 'var(--color-text-muted)' }}>
        From {plan.history.open_days} trading days ({plan.history.from} → {plan.history.to}), the last {plan.settings.sample_weeks} {plan.weekday}s weighing most.
      </span>
    </div>
  );
}

function PlannedBox({ item, slotKey, slotLabel, value, onChange }: {
  item: PlanItem; slotKey: string; slotLabel: string; value: string; onChange: (v: string) => void;
}) {
  return (
    <input
      type="number"
      min={0}
      step={1}
      inputMode="numeric"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={`${item.name} ${slotLabel} planned`}
      data-testid={`plan-cell-${item.key}-${slotKey}`}
      style={{
        width: 72, height: 38, textAlign: 'center', fontWeight: 700, fontSize: 15,
        border: '1.5px solid var(--color-border)', borderRadius: 8,
        background: 'var(--color-surface)', color: 'var(--color-text)',
      }}
    />
  );
}

function SlotHints({ item, slotKey, reviewing }: { item: PlanItem; slotKey: string; reviewing: boolean }) {
  const row = item.slots[slotKey];
  return (
    <div style={{ fontSize: 11, color: 'var(--color-text-muted)', display: 'flex', flexWrap: 'wrap', gap: 6 }} data-testid={`plan-forecast-${item.key}-${slotKey}`}>
      <span title="What the model reckons for this slot">≈ {q(row.forecast)}</span>
      {row.known > 0 && <span style={{ color: 'var(--color-primary)' }} title="Already ordered for this slot">{q(row.known)} ordered</span>}
      {row.sold_out_days > 0 && <span style={{ color: 'var(--color-warning)' }} title="Sold out in this slot on these days of the sample">sold out {row.sold_out_days}×</span>}
      {reviewing && row.actual != null && (
        <span style={{ color: row.actual_sold_out ? 'var(--color-danger)' : 'var(--color-success-strong)' }}>
          sold {q(row.actual)}{row.actual_sold_out ? ', ran out' : ''}
        </span>
      )}
      {row.saved_planned != null && <span title="Saved plan">saved {q(row.saved_planned)}</span>}
    </div>
  );
}

function CustomersLine({ item }: { item: PlanItem }) {
  const c = item.customers;
  if (c.registered_share_pct == null) return null;
  return (
    <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 8 }} data-testid={`plan-customers-${item.key}`}>
      {pct(c.registered_share_pct)} to registered customers · {c.regulars} regular{c.regulars === 1 ? '' : 's'}
      {c.regulars > 0 ? ` (about ${q(c.regulars_same_weekday_avg)} on a day like this)` : ''}
    </div>
  );
}

function PlanRow({ item, plan, reviewing, drafts, plannedFor, dayTotal, onDraft, open, onToggle }: {
  item: PlanItem;
  plan: ProductionPlan;
  reviewing: boolean;
  drafts: Record<string, string>;
  plannedFor: (item: PlanItem, slotKey: string) => number;
  dayTotal: number;
  onDraft: (slotKey: string, v: string) => void;
  open: boolean;
  onToggle: () => void;
}) {
  const c = item.customers;
  return (
    <>
      <tr data-testid={`plan-item-${item.key}`} style={{ opacity: item.enabled ? 1 : 0.6 }}>
        <td style={TD}>
          <div style={{ fontWeight: 600 }}>{item.name}</div>
          <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
            {item.category ?? ''}{!item.enabled ? ' · hidden' : ''}
            {item.day.last_same_weekday ? ` · last ${plan.weekday.slice(0, 3)} ${q(item.day.last_same_weekday.qty)}` : ''}
          </div>
        </td>
        {plan.slots.map((slot) => (
          <td key={slot.key} style={{ ...TD, textAlign: 'center' }}>
            <PlannedBox item={item} slotKey={slot.key} slotLabel={slot.label} value={drafts[slot.key] ?? String(plannedFor(item, slot.key))} onChange={(v) => onDraft(slot.key, v)} />
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: 4 }}>
              <SlotHints item={item} slotKey={slot.key} reviewing={reviewing} />
            </div>
          </td>
        ))}
        <td style={{ ...TD, textAlign: 'right', fontWeight: 700 }} data-testid={`plan-day-${item.key}`}>
          {q(dayTotal)}
          <div style={{ fontSize: 11, fontWeight: 400, color: 'var(--color-text-muted)' }}>
            ≈ {q(item.day.forecast)}
            {reviewing && item.day.actual != null ? ` · sold ${q(item.day.actual)}` : ''}
            {reviewing && item.day.made != null && item.day.made > 0 ? ` · made ${q(item.day.made)}` : ''}
          </div>
        </td>
        <td style={{ ...TD, fontSize: 12 }} data-testid={`plan-customers-${item.key}`}>
          {c.registered_share_pct == null ? '—' : (
            <>
              {pct(c.registered_share_pct)} registered
              <div style={{ color: 'var(--color-text-muted)', fontSize: 11 }}>
                {c.regulars} regular{c.regulars === 1 ? '' : 's'}{c.regulars > 0 ? ` · ≈${q(c.regulars_same_weekday_avg)} today` : ''}
              </div>
            </>
          )}
        </td>
        <td style={TD}>
          <Btn variant="ghost" small onClick={onToggle} data-testid={`plan-evidence-${item.key}`}>{open ? 'Hide' : 'Why?'}</Btn>
        </td>
      </tr>
      {open && (
        <tr>
          <td style={{ ...TD, background: 'var(--color-bg)' }} colSpan={plan.slots.length + 4}>
            <Evidence item={item} plan={plan} />
          </td>
        </tr>
      )}
    </>
  );
}

function Evidence({ item, plan }: { item: PlanItem; plan: ProductionPlan }) {
  const posMeta = item.factors.month_position[plan.month_position.key];
  const calendarEntries = Object.entries(item.factors.calendar);
  return (
    <div style={{ display: 'grid', gap: 10, fontSize: 13 }} data-testid={`plan-working-${item.key}`}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, color: 'var(--color-text-secondary)' }}>
        <span>Service level <b>{item.service_level_pct}%</b> — enough for {item.service_level_pct} of every 100 {plan.weekday}s like this.</span>
        {item.round_to > 1 && <span>Batches of <b>{item.round_to}</b>.</span>}
        {item.min_qty > 0 && <span>Never under <b>{item.min_qty}</b> a day.</span>}
        {posMeta && (
          <span>
            {POSITION_LABEL[plan.month_position.key]}: <b>{factorText(posMeta.index)}</b>
            {posMeta.days_seen > 0 ? ` (from ${posMeta.days_seen} days)` : ' (nothing learned yet)'}
          </span>
        )}
        {calendarEntries.map(([kind, meta]) => {
          const label = plan.calendar.find((c) => c.kind === kind)?.label ?? kind.replace(/_/g, ' ');
          return (
            <span key={kind}>
              {label}: <b>{factorText(meta.index)}</b>
              {meta.days_seen > 0
                ? ` (learned from ${meta.days_seen} day${meta.days_seen === 1 ? '' : 's'})`
                : meta.expected != null && meta.expected !== 1 ? ' (your expectation — nothing learned yet)' : ' (nothing learned yet)'}
            </span>
          );
        })}
      </div>
      {plan.slots.map((slot) => {
        const row: PlanSlotRow = item.slots[slot.key];
        if (row.sample.length === 0) return null;
        return (
          <div key={slot.key}>
            <span style={{ fontWeight: 600 }}>{slot.label}</span>{' '}
            <span style={{ color: 'var(--color-text-secondary) ' }}>last {row.sample.length} {plan.weekday}s:</span>{' '}
            {row.sample.map((s, i) => (
              <span key={s.date} title={`${s.date}${s.kinds.length ? ` · ${s.kinds.join(', ').replace(/_/g, ' ')}` : ''} · ${POSITION_LABEL[s.position] ?? s.position}`}>
                {i > 0 ? ', ' : ''}
                <span style={{ color: s.sold_out ? 'var(--color-warning)' : 'inherit', fontWeight: s.sold_out ? 700 : 400 }}>
                  {q(s.qty)}{s.sold_out ? ` (ran out ${s.sold_out_at ?? ''}${s.lifted_to != null ? `, counted as ${q(s.lifted_to)}` : ''})` : ''}
                </span>
              </span>
            ))}
            {' '}→ <b>≈ {q(row.forecast)}</b>
          </div>
        );
      })}
    </div>
  );
}

// ─── Calendar ─────────────────────────────────────────────────────────────────

const EMPTY_PERIOD: PlanCalendarInput = { kind: 'public_holiday', label: '', starts_on: '', ends_on: '', expected_change_pct: null, notes: '' };

export function PlanCalendarTab({ canManage }: { canManage: boolean }) {
  const [data, setData] = useState<PlanCalendar | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<PlanCalendarInput>(EMPTY_PERIOD);
  const [editing, setEditing] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await getProductionCalendar());
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the calendar.');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const startEdit = (p: PlanCalendarPeriod) => {
    setEditing(p.id);
    setForm({ kind: p.kind, label: p.label ?? '', starts_on: p.starts_on, ends_on: p.ends_on, expected_change_pct: p.expected_change_pct, notes: p.notes ?? '' });
  };

  const submit = async () => {
    setSaving(true);
    setError('');
    try {
      const payload: PlanCalendarInput = {
        ...form,
        label: form.label?.trim() || null,
        notes: form.notes?.trim() || null,
        ends_on: form.ends_on || form.starts_on,
      };
      if (editing) await updateProductionCalendarPeriod(editing, payload);
      else await createProductionCalendarPeriod(payload);
      setForm(EMPTY_PERIOD);
      setEditing(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the period.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (p: PlanCalendarPeriod) => {
    if (!window.confirm(`Remove ${p.label || p.kind_label} (${p.starts_on} → ${p.ends_on})?`)) return;
    try {
      await deleteProductionCalendarPeriod(p.id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not remove the period.');
    }
  };

  const kindOptions = Object.entries(data?.kinds ?? {}).map(([value, label]) => ({ value, label }));

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <Card>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-secondary)' }}>
          Days that are not ordinary days. Sales on them teach the plan what that kind of day does to demand; until it has seen a few,
          it uses the change you expect. A <b>closed</b> period plans nothing and is ignored as evidence. Opening-hours closures count as closed too.
        </p>
      </Card>

      {error && <ErrorMsg message={error} />}

      {canManage && (
        <Card data-testid="calendar-form">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
            <Select label="Kind" options={kindOptions} value={form.kind} onChange={(v) => setForm({ ...form, kind: v })} aria-label="Kind" />
            <Input label="Name" id="calendar-label" value={form.label ?? ''} onChange={(v) => setForm({ ...form, label: v })} placeholder="Eid, mid-term break…" />
            <Input label="From" id="calendar-from" type="date" value={form.starts_on} onChange={(v) => setForm({ ...form, starts_on: v })} />
            <Input label="To" id="calendar-to" type="date" value={form.ends_on} onChange={(v) => setForm({ ...form, ends_on: v })} />
            <Input
              label="Expected change (%)"
              id="calendar-expected"
              type="number"
              value={form.expected_change_pct == null ? '' : String(form.expected_change_pct)}
              onChange={(v) => setForm({ ...form, expected_change_pct: v === '' ? null : Number(v) })}
              placeholder="−40 or +30"
            />
            <Input label="Notes" id="calendar-notes" value={form.notes ?? ''} onChange={(v) => setForm({ ...form, notes: v })} />
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <Btn onClick={() => void submit()} disabled={saving || !form.starts_on} data-testid="calendar-save">
              {saving ? 'Saving…' : editing ? 'Save changes' : 'Add period'}
            </Btn>
            {editing && <Btn variant="secondary" onClick={() => { setEditing(null); setForm(EMPTY_PERIOD); }}>Cancel</Btn>}
          </div>
        </Card>
      )}

      {loading ? <Spinner /> : data && (
        <>
          {data.periods.length === 0 ? (
            <EmptyState message="No holidays or closures on record yet. Add the school term dates, public holidays, Ramadan and Eid so the plan can allow for them." />
          ) : (
            <TableCard>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={TH}>Kind</th>
                    <th style={TH}>Name</th>
                    <th style={TH}>From</th>
                    <th style={TH}>To</th>
                    <th style={{ ...TH, textAlign: 'right' }}>Days</th>
                    <th style={{ ...TH, textAlign: 'right' }}>Expected</th>
                    {canManage && <th style={TH} />}
                  </tr>
                </thead>
                <tbody>
                  {data.periods.map((p) => (
                    <tr key={p.id} data-testid={`calendar-period-${p.id}`}>
                      <td style={TD}><Badge color={p.kind === 'closed' ? 'red' : 'orange'} label={p.kind_label} /></td>
                      <td style={TD}>{p.label ?? '—'}</td>
                      <td style={TD}>{p.starts_on}</td>
                      <td style={TD}>{p.ends_on}</td>
                      <td style={{ ...TD, textAlign: 'right' }}>{p.days}</td>
                      <td style={{ ...TD, textAlign: 'right' }}>{p.expected_change_pct == null ? '—' : `${p.expected_change_pct > 0 ? '+' : ''}${p.expected_change_pct}%`}</td>
                      {canManage && (
                        <td style={{ ...TD, whiteSpace: 'nowrap' }}>
                          <Btn variant="ghost" small onClick={() => startEdit(p)}>Edit</Btn>
                          <Btn variant="ghost" small onClick={() => void remove(p)} aria-label={`Remove ${p.label || p.kind_label}`}>Remove</Btn>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableCard>
          )}
          {Object.keys(data.closures).length > 0 && (
            <Card>
              <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: 'var(--color-text-muted)', marginBottom: 6 }}>Opening-hours closures</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, fontSize: 13 }}>
                {Object.entries(data.closures).map(([d, reason]) => <span key={d}><b>{d}</b> {reason}</span>)}
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

// ─── Accuracy ─────────────────────────────────────────────────────────────────

export function PlanAccuracyTab() {
  const [weeks, setWeeks] = useState(4);
  const [data, setData] = useState<PlanAccuracy | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    getProductionPlanAccuracy(weeks)
      .then((d) => { if (alive) { setData(d); setError(''); } })
      .catch((e) => { if (alive) setError(e instanceof Error ? e.message : 'Could not load.'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [weeks]);

  const t = data?.totals;
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <Card>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
          <Select label="Looking back" value={String(weeks)} onChange={(v) => setWeeks(Number(v))} options={[2, 4, 8, 12].map((w) => ({ value: String(w), label: `${w} weeks` }))} />
          <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-secondary)', flex: 1 }}>
            Every saved plan, marked against what then sold. <b>Enough</b> is a slot that neither ran out nor sold more than was planned.
          </p>
        </div>
      </Card>
      {error && <ErrorMsg message={error} />}
      {loading ? <Spinner /> : !data || !t ? (
        <EmptyState message="No saved plans in this window yet. Save a plan from the Plan tab and come back once the day is over." />
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }} data-testid="accuracy-totals">
            <StatCard label="Days planned" value={String(data.days)} sub={`${t.n} item-slots`} />
            <StatCard label="Enough" value={pct(t.enough_pct)} sub="slots that covered demand" accent="var(--color-success)" />
            <StatCard label="Model bias" value={t.bias_pct == null ? '—' : `${t.bias_pct > 0 ? '+' : ''}${t.bias_pct}%`} sub="forecast vs sold" accent="var(--color-warning)" />
            <StatCard label="Over-made" value={q(t.over)} sub="planned beyond what sold" accent="var(--color-danger)" />
            <StatCard label="Short" value={q(t.short)} sub={`${t.sold_out} slot${t.sold_out === 1 ? '' : 's'} ran out`} accent="var(--color-danger)" />
          </div>
          <TableCard>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={TH}>Item</th>
                  <th style={{ ...TH, textAlign: 'right' }}>Slots</th>
                  <th style={{ ...TH, textAlign: 'right' }}>Forecast</th>
                  <th style={{ ...TH, textAlign: 'right' }}>Planned</th>
                  <th style={{ ...TH, textAlign: 'right' }}>Sold</th>
                  <th style={{ ...TH, textAlign: 'right' }}>Over</th>
                  <th style={{ ...TH, textAlign: 'right' }}>Short</th>
                  <th style={{ ...TH, textAlign: 'right' }}>Enough</th>
                  <th style={{ ...TH, textAlign: 'right' }}>Bias</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((row) => (
                  <tr key={row.key}>
                    <td style={TD}>{row.name}</td>
                    <td style={{ ...TD, textAlign: 'right' }}>{row.n}</td>
                    <td style={{ ...TD, textAlign: 'right' }}>{q(row.forecast)}</td>
                    <td style={{ ...TD, textAlign: 'right' }}>{q(row.planned)}</td>
                    <td style={{ ...TD, textAlign: 'right' }}>{q(row.actual)}</td>
                    <td style={{ ...TD, textAlign: 'right' }}>{q(row.over)}</td>
                    <td style={{ ...TD, textAlign: 'right' }}>{q(row.short)}{row.sold_out > 0 ? ` (${row.sold_out} ran out)` : ''}</td>
                    <td style={{ ...TD, textAlign: 'right' }}>{pct(row.enough_pct)}</td>
                    <td style={{ ...TD, textAlign: 'right' }}>{row.bias_pct == null ? '—' : `${row.bias_pct > 0 ? '+' : ''}${row.bias_pct}%`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableCard>
          {data.records.length > 0 && (
            <TableCard>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={TH}>Day</th>
                    <th style={TH}>Slot</th>
                    <th style={TH}>Item</th>
                    <th style={{ ...TH, textAlign: 'right' }}>Forecast</th>
                    <th style={{ ...TH, textAlign: 'right' }}>Planned</th>
                    <th style={{ ...TH, textAlign: 'right' }}>Sold</th>
                  </tr>
                </thead>
                <tbody>
                  {data.records.slice(0, 60).map((r, i) => (
                    <tr key={`${r.date}-${r.slot_start}-${r.name}-${i}`}>
                      <td style={TD}>{r.weekday} {r.date}</td>
                      <td style={TD}>{r.slot_label}</td>
                      <td style={TD}>{r.name}</td>
                      <td style={{ ...TD, textAlign: 'right' }}>{q(r.forecast)}</td>
                      <td style={{ ...TD, textAlign: 'right' }}>{q(r.planned)}</td>
                      <td style={{ ...TD, textAlign: 'right', color: r.sold_out ? 'var(--color-danger)' : r.actual > r.planned ? 'var(--color-warning)' : 'inherit' }}>
                        {q(r.actual)}{r.sold_out ? ' ran out' : ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableCard>
          )}
        </>
      )}
    </div>
  );
}

// ─── Customers ────────────────────────────────────────────────────────────────

export function PlanCustomersTab() {
  const [weeks, setWeeks] = useState(8);
  const [data, setData] = useState<PlanCustomerHabits | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    getPlanCustomerHabits(weeks)
      .then((d) => { if (alive) { setData(d); setError(''); } })
      .catch((e) => { if (alive) setError(e instanceof Error ? e.message : 'Could not load.'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [weeks]);

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <Card>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
          <Select label="Looking back" value={String(weeks)} onChange={(v) => setWeeks(Number(v))} options={[4, 8, 12, 26].map((w) => ({ value: String(w), label: `${w} weeks` }))} />
          <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-secondary)', flex: 1 }}>
            Registered customers are the steady part of demand: they come back on their own days, at their own hours, for the same things.
            The bigger their share of an item, the firmer the floor under its plan. Walk-ins are the swing. Shares and counts only — no names.
          </p>
        </div>
      </Card>
      {error && <ErrorMsg message={error} />}
      {loading ? <Spinner /> : data && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }} data-testid="customers-totals">
            <StatCard label="Orders from registered" value={pct(data.orders.registered_share_pct)} sub={`${data.orders.registered} of ${data.orders.total}`} />
            <StatCard label="Revenue from registered" value={pct(data.revenue.registered_share_pct)} sub={`${mvr(data.revenue.registered)} of ${mvr(data.revenue.total)}`} accent="var(--color-success)" />
            <StatCard label="Average ticket" value={data.average_ticket.registered == null ? '—' : mvr(data.average_ticket.registered)} sub={`walk-in ${data.average_ticket.walk_in == null ? '—' : mvr(data.average_ticket.walk_in)}`} accent="var(--color-warning)" />
            <StatCard label="Registered buyers" value={String(data.buyers.registered)} sub={`${pct(data.buyers.repeat_share_pct)} came back · ${data.buyers.orders_per_buyer ?? '—'} orders each`} accent="var(--color-primary)" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
            <TableCard>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr><th style={TH}>Weekday</th><th style={{ ...TH, textAlign: 'right' }}>Orders</th><th style={{ ...TH, textAlign: 'right' }}>Registered</th></tr></thead>
                <tbody>
                  {data.by_weekday.map((r) => (
                    <tr key={r.weekday}><td style={TD}>{r.weekday}</td><td style={{ ...TD, textAlign: 'right' }}>{r.orders}</td><td style={{ ...TD, textAlign: 'right' }}>{pct(r.registered_share_pct)}</td></tr>
                  ))}
                </tbody>
              </table>
            </TableCard>
            <TableCard>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr><th style={TH}>Slot</th><th style={{ ...TH, textAlign: 'right' }}>Orders</th><th style={{ ...TH, textAlign: 'right' }}>Registered</th></tr></thead>
                <tbody>
                  {data.by_slot.map((r) => (
                    <tr key={r.key}><td style={TD}>{r.label}</td><td style={{ ...TD, textAlign: 'right' }}>{r.orders}</td><td style={{ ...TD, textAlign: 'right' }}>{pct(r.registered_share_pct)}</td></tr>
                  ))}
                </tbody>
              </table>
            </TableCard>
          </div>
          <TableCard>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={TH}>Item</th>
                  <th style={{ ...TH, textAlign: 'right' }}>Sold</th>
                  <th style={{ ...TH, textAlign: 'right' }}>To registered</th>
                  <th style={{ ...TH, textAlign: 'right' }}>Buyers</th>
                  <th style={{ ...TH, textAlign: 'right' }}>Regulars</th>
                </tr>
              </thead>
              <tbody>
                {data.top_items.length === 0 ? (
                  <tr><td style={TD} colSpan={5}>Nothing sold in the window.</td></tr>
                ) : data.top_items.map((r) => (
                  <tr key={r.key} data-testid={`customers-item-${r.key}`}>
                    <td style={TD}>{r.name}</td>
                    <td style={{ ...TD, textAlign: 'right' }}>{q(r.qty)}</td>
                    <td style={{ ...TD, textAlign: 'right' }}>{pct(r.registered_share_pct)}</td>
                    <td style={{ ...TD, textAlign: 'right' }}>{r.buyers}</td>
                    <td style={{ ...TD, textAlign: 'right' }}>{r.regulars}</td>
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

// ─── Settings ─────────────────────────────────────────────────────────────────

export function PlanSettingsTab({ canManage }: { canManage: boolean }) {
  const [settings, setSettings] = useState<PlanSettings | null>(null);
  const [plan, setPlan] = useState<ProductionPlan | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');

  const load = useCallback(async () => {
    try {
      const [s, p] = await Promise.all([getProductionPlanSettings(), getProductionPlan()]);
      setSettings(s.settings);
      setPlan(p);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load settings.');
    }
  }, []);
  useEffect(() => {
    if (canManage) void load();
  }, [load, canManage]);

  const saveSettings = async () => {
    if (!settings) return;
    setSaving(true);
    setToast('');
    setError('');
    try {
      const res = await updateProductionPlanSettings(settings);
      setSettings(res.settings);
      setToast('Settings saved.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save settings.');
    } finally {
      setSaving(false);
    }
  };

  const setSlot = (i: number, patch: Partial<{ label: string; from: number; to: number }>) => {
    if (!settings) return;
    setSettings({ ...settings, slots: settings.slots.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
  };

  if (!canManage) {
    return <EmptyState message="Only a manager can change how the plan is worked out." />;
  }
  if (!settings) return error ? <ErrorMsg message={error} /> : <Spinner />;

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {error && <ErrorMsg message={error} />}
      <Card data-testid="settings-model">
        <h3 style={{ margin: '0 0 12px', fontSize: 15 }}>The model</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
          <Input label="Look back (weeks)" id="settings-lookback" type="number" min={4} max={52} value={String(settings.lookback_weeks)} onChange={(v) => setSettings({ ...settings, lookback_weeks: Number(v) })} />
          <Input label="Same weekdays to sample" id="settings-sample" type="number" min={3} max={26} value={String(settings.sample_weeks)} onChange={(v) => setSettings({ ...settings, sample_weeks: Number(v) })} />
          <Input label="Default service level (%)" id="settings-service-level" type="number" min={50} max={99} value={String(settings.default_service_level_pct)} onChange={(v) => setSettings({ ...settings, default_service_level_pct: Number(v) })} />
        </div>
        <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', margin: '10px 0 0' }}>
          Service level 85 means the plan covers demand on 85 of every 100 such days: less waste at 75, fewer sell-outs at 95.
        </p>
      </Card>

      <Card data-testid="settings-slots">
        <h3 style={{ margin: '0 0 4px', fontSize: 15 }}>Time slots</h3>
        <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', margin: '0 0 12px' }}>
          The day is planned in these. Hours run 0–23 and the slots must cover all 24 between them; a slot may run over midnight (22 → 6),
          and those small hours count towards the day that opened.
        </p>
        <div style={{ display: 'grid', gap: 8 }}>
          {settings.slots.map((s, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: 8, alignItems: 'end' }}>
              <Input label={i === 0 ? 'Name' : undefined} id={`slot-label-${i}`} aria-label={`Slot ${i + 1} name`} value={s.label} onChange={(v) => setSlot(i, { label: v })} />
              <Input label={i === 0 ? 'From (hour)' : undefined} id={`slot-from-${i}`} aria-label={`Slot ${i + 1} from`} type="number" min={0} max={23} value={String(s.from)} onChange={(v) => setSlot(i, { from: Number(v) })} />
              <Input label={i === 0 ? 'To (hour)' : undefined} id={`slot-to-${i}`} aria-label={`Slot ${i + 1} to`} type="number" min={0} max={23} value={String(s.to)} onChange={(v) => setSlot(i, { to: Number(v) })} />
              <Btn variant="ghost" small onClick={() => setSettings({ ...settings, slots: settings.slots.filter((_, j) => j !== i) })} disabled={settings.slots.length <= 1} aria-label={`Remove slot ${i + 1}`}>✕</Btn>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <Btn variant="secondary" small onClick={() => setSettings({ ...settings, slots: [...settings.slots, { label: '', from: 0, to: 0 }] })} disabled={settings.slots.length >= 8}>＋ Add slot</Btn>
          <Btn onClick={() => void saveSettings()} disabled={saving} data-testid="settings-save">{saving ? 'Saving…' : 'Save settings'}</Btn>
        </div>
        {toast && <p role="status" style={{ marginTop: 8, color: 'var(--color-success-strong)', fontSize: 13 }}>{toast}</p>}
      </Card>

      <Card data-testid="settings-items">
        <h3 style={{ margin: '0 0 4px', fontSize: 15 }}>Per item</h3>
        <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', margin: '0 0 12px' }}>
          Items that have sold in the look-back window. Turn off anything bought in rather than made; set the tray size and a daily floor where it matters.
        </p>
        {!plan ? <Spinner /> : plan.items.length === 0 ? (
          <EmptyState message="No items have sold in the look-back window yet." />
        ) : (
          <ItemDials items={plan.items} defaultServiceLevel={settings.default_service_level_pct} onSaved={load} />
        )}
      </Card>
    </div>
  );
}

function ItemDials({ items, defaultServiceLevel, onSaved }: { items: PlanItem[]; defaultServiceLevel: number; onSaved: () => Promise<void> }) {
  const [drafts, setDrafts] = useState<Record<string, { service_level_pct: string; round_to: string; min_qty: string; notes: string; enabled: boolean }>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');

  const draftFor = (item: PlanItem) => drafts[item.key] ?? {
    service_level_pct: String(item.service_level_pct),
    round_to: String(item.round_to),
    min_qty: String(item.min_qty),
    notes: item.notes ?? '',
    enabled: item.enabled,
  };
  const patch = (item: PlanItem, p: Partial<ReturnType<typeof draftFor>>) =>
    setDrafts((d) => ({ ...d, [item.key]: { ...draftFor(item), ...p } }));

  const save = async (item: PlanItem, override?: Partial<ReturnType<typeof draftFor>>) => {
    const d = { ...draftFor(item), ...override };
    setBusy(item.key);
    setError('');
    try {
      await updateProductionPlanItem(item.item_id, {
        variant_id: item.variant_id,
        enabled: d.enabled,
        service_level_pct: Number(d.service_level_pct) || defaultServiceLevel,
        round_to: Math.max(1, Number(d.round_to) || 1),
        min_qty: Math.max(0, Number(d.min_qty) || 0),
        notes: d.notes.trim() || null,
      });
      setDrafts((all) => { const next = { ...all }; delete next[item.key]; return next; });
      await onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      {error && <ErrorMsg message={error} />}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={TH}>Item</th>
              <th style={TH}>Planned</th>
              <th style={TH}>Service level %</th>
              <th style={TH}>Tray of</th>
              <th style={TH}>Daily floor</th>
              <th style={TH}>Notes</th>
              <th style={TH} />
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const d = draftFor(item);
              const dirty = drafts[item.key] !== undefined;
              return (
                <tr key={item.key} data-testid={`dial-${item.key}`}>
                  <td style={TD}>{item.name}</td>
                  <td style={TD}>
                    <Toggle checked={d.enabled} onChange={(v) => void save(item, { enabled: v })} label={d.enabled ? 'yes' : 'no'} size="sm" />
                  </td>
                  <td style={TD}><input aria-label={`${item.name} service level`} type="number" min={50} max={99} value={d.service_level_pct} onChange={(e) => patch(item, { service_level_pct: e.target.value })} style={dialInput} /></td>
                  <td style={TD}><input aria-label={`${item.name} tray of`} type="number" min={1} max={500} value={d.round_to} onChange={(e) => patch(item, { round_to: e.target.value })} style={dialInput} /></td>
                  <td style={TD}><input aria-label={`${item.name} daily floor`} type="number" min={0} max={5000} value={d.min_qty} onChange={(e) => patch(item, { min_qty: e.target.value })} style={dialInput} /></td>
                  <td style={TD}><input aria-label={`${item.name} notes`} value={d.notes} onChange={(e) => patch(item, { notes: e.target.value })} style={{ ...dialInput, width: 160, textAlign: 'left' }} /></td>
                  <td style={TD}>
                    <Btn small onClick={() => void save(item)} disabled={busy === item.key || !dirty} aria-label={`Save ${item.name} dials`}>
                      {busy === item.key ? '…' : 'Save'}
                    </Btn>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

const dialInput: React.CSSProperties = {
  width: 72, height: 34, textAlign: 'center',
  border: '1.5px solid var(--color-border)', borderRadius: 8,
  background: 'var(--color-surface)', color: 'var(--color-text)', fontSize: 13,
};
