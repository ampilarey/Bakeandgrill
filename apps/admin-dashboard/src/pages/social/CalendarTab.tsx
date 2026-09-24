import { useCallback, useEffect, useState } from 'react';
import {
  fetchSocialCalendar, fetchSocialPost, moveSocialPost, updateSocialRules,
  type SocialBestTimesReport, type SocialCalendarEntry, type SocialCalendarSlot, type SocialPostRow, type SocialPostingRulesConfig,
} from '../../api';
import { Btn, Card, ErrorMsg, Select, Spinner } from '../../components/SharedUI';
import { PLATFORM_SHORT, bestTimesHint } from './composer';

const KIND_LABELS: Record<string, string> = { special: 'Daily special', new_item: 'New on the menu', featured: "Chef's pick" };
const STATUS_TONE: Record<string, string> = {
  published: 'var(--color-success-bg)', partial_failure: 'var(--color-warning-bg)', failed: 'var(--color-danger-bg)',
  scheduled: 'var(--color-bg)', queued: 'var(--color-bg)', processing: 'var(--color-bg)', cancelled: 'var(--color-bg)',
};
const GAP_OPTIONS = [
  { value: '0', label: 'No minimum gap' }, { value: '60', label: 'At least 1 hour apart' }, { value: '120', label: 'At least 2 hours apart' },
  { value: '240', label: 'At least 4 hours apart' }, { value: '480', label: 'At least 8 hours apart' }, { value: '1440', label: 'At least a day apart' },
];
const PER_DAY_OPTIONS = [{ value: '0', label: 'No daily limit' }, ...[1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: `At most ${n} a day` }))];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** The grid's days for a month: leading and trailing blanks so weeks start on Sunday. */
export function monthGrid(year: number, month: number): (string | null)[] {
  const first = new Date(year, month, 1);
  const days: (string | null)[] = Array.from({ length: first.getDay() }, () => null);
  const count = new Date(year, month + 1, 0).getDate();
  for (let d = 1; d <= count; d++) days.push(ymd(new Date(year, month, d)));
  while (days.length % 7 !== 0) days.push(null);
  return days;
}

/**
 * The content calendar (owner's shortlist, 2026-09-24). A month of
 * scheduled, queued and published posts, the automations' slots as ghost
 * entries, unscheduled drafts beside the grid, and drag a draft or a
 * scheduled post onto a day to move it there. The posting rules and the
 * best-times hint sit above the grid, since that is where you plan.
 */
export function CalendarTab({ canSchedule, canEditRules, onEdit }: {
  canSchedule: boolean;
  canEditRules: boolean;
  onEdit?: (post: SocialPostRow) => void;
}) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [posts, setPosts] = useState<SocialCalendarEntry[]>([]);
  const [drafts, setDrafts] = useState<SocialCalendarEntry[]>([]);
  const [slots, setSlots] = useState<SocialCalendarSlot[]>([]);
  const [rules, setRules] = useState<SocialPostingRulesConfig | null>(null);
  const [bestTimes, setBestTimes] = useState<SocialBestTimesReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [dragging, setDragging] = useState<number | null>(null);
  const [over, setOver] = useState<string | null>(null);

  const grid = monthGrid(year, month);
  const from = grid.find((d) => d !== null) ?? ymd(new Date(year, month, 1));
  const to = [...grid].reverse().find((d) => d !== null) ?? from;

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetchSocialCalendar(from, to);
      setPosts(res.posts);
      setDrafts(res.drafts);
      setSlots(res.slots);
      setRules(res.rules);
      setBestTimes(res.best_times);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => { void load(); }, [load]);

  const step = (delta: number) => {
    const d = new Date(year, month + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth());
  };

  const drop = async (date: string) => {
    const id = dragging;
    setDragging(null);
    setOver(null);
    if (id === null || !canSchedule) return;
    setNotice('');
    try {
      const res = await moveSocialPost(id, date);
      setNotice(res.warning ? `Moved to ${date}. ${res.warning}` : `Moved to ${date}.`);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const open = async (id: number) => {
    if (!onEdit) return;
    try {
      const { post } = await fetchSocialPost(id);
      onEdit(post);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const saveRules = async (patch: Partial<SocialPostingRulesConfig>) => {
    try {
      const res = await updateSocialRules(patch);
      setRules(res.rules);
      setNotice('Posting rules saved.');
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const todayKey = ymd(now);
  const hint = bestTimesHint(bestTimes);
  const draggable = (p: SocialCalendarEntry) => canSchedule && ['draft', 'scheduled', 'awaiting_approval'].includes(p.status);

  const entryChip = (p: SocialCalendarEntry) => (
    <button
      key={`p-${p.id}`}
      type="button"
      draggable={draggable(p)}
      onDragStart={(e) => { setDragging(p.id); e.dataTransfer.setData('text/plain', String(p.id)); }}
      onDragEnd={() => { setDragging(null); setOver(null); }}
      onClick={() => { void open(p.id); }}
      data-testid={`cal-post-${p.id}`}
      title={`${p.time ?? ''} ${p.caption} (${p.status})`}
      style={{
        display: 'block', width: '100%', textAlign: 'left', border: '1px solid var(--color-border)', borderRadius: 6,
        background: STATUS_TONE[p.status] ?? 'var(--color-bg)', padding: '3px 6px', fontSize: 11, lineHeight: 1.3,
        fontFamily: 'inherit', cursor: draggable(p) ? 'grab' : 'pointer', color: 'var(--color-text)',
        opacity: dragging === p.id ? 0.4 : 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}
    >
      <strong>{p.time}</strong> {p.platforms.map((pl) => PLATFORM_SHORT[pl]?.[0] ?? pl[0]).join('')} {p.caption}
    </button>
  );

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {error && <ErrorMsg message={error} />}
      {notice && <p role="status" style={{ margin: 0, fontSize: 13, color: 'var(--color-text-secondary)' }}>{notice}</p>}

      <Card style={{ padding: '12px 16px', display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <Select
          label="Spacing"
          aria-label="Minimum gap between posts"
          options={GAP_OPTIONS}
          value={String(rules?.min_gap_minutes ?? 0)}
          onChange={(v) => { void saveRules({ min_gap_minutes: Number(v) }); }}
          disabled={!canEditRules || rules === null}
          style={{ minWidth: 200 }}
        />
        <Select
          label="Per day"
          aria-label="Maximum posts per day"
          options={PER_DAY_OPTIONS}
          value={String(rules?.max_per_day ?? 0)}
          onChange={(v) => { void saveRules({ max_per_day: Number(v) }); }}
          disabled={!canEditRules || rules === null}
          style={{ minWidth: 160 }}
        />
        <span style={{ fontSize: 12, color: 'var(--color-text-muted)', flex: '1 1 240px', paddingBottom: 12 }}>
          {hint ?? (bestTimes ? `Best-time hints appear after ${Math.max(0, 5 - bestTimes.sample)} more posts with stats.` : '')}
          {rules && (rules.min_gap_minutes > 0 || rules.max_per_day > 0) && ' Automations and "Post now" are moved to the next free slot when a rule would be broken.'}
        </span>
      </Card>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <Card style={{ padding: 12, flex: '1 1 560px', minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <Btn small variant="secondary" onClick={() => step(-1)} aria-label="Previous month">‹</Btn>
            <strong style={{ fontSize: 14, minWidth: 140, textAlign: 'center' }} data-testid="cal-month">
              {new Date(year, month, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
            </strong>
            <Btn small variant="secondary" onClick={() => step(1)} aria-label="Next month">›</Btn>
            <Btn small variant="secondary" onClick={() => { setYear(now.getFullYear()); setMonth(now.getMonth()); }}>Today</Btn>
            {loading && <Spinner size={16} />}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 4 }}>
            {WEEKDAYS.map((d) => (
              <div key={d} style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-muted)', textAlign: 'center' }}>{d}</div>
            ))}
            {grid.map((date, i) => {
              if (date === null) return <div key={`blank-${i}`} />;
              const dayPosts = posts.filter((p) => p.date === date);
              const daySlots = slots.filter((s) => s.date === date);
              const isToday = date === todayKey;
              const past = date < todayKey;
              return (
                <div
                  key={date}
                  data-testid={`cal-day-${date}`}
                  onDragOver={(e) => { if (dragging !== null && !past) { e.preventDefault(); setOver(date); } }}
                  onDragLeave={() => { if (over === date) setOver(null); }}
                  onDrop={(e) => { e.preventDefault(); if (!past) void drop(date); }}
                  style={{
                    minHeight: 76, borderRadius: 8, padding: 4, display: 'grid', gap: 3, alignContent: 'start',
                    border: over === date ? '2px dashed var(--color-primary)' : isToday ? '1.5px solid var(--color-primary)' : '1px solid var(--color-border-light)',
                    background: past ? 'var(--color-bg)' : 'var(--color-surface)', opacity: past ? 0.8 : 1,
                  }}
                >
                  <div style={{ fontSize: 11, fontWeight: isToday ? 800 : 600, color: isToday ? 'var(--color-primary)' : 'var(--color-text-secondary)' }}>
                    {Number(date.slice(-2))}
                  </div>
                  {dayPosts.map(entryChip)}
                  {daySlots.map((s) => (
                    <div
                      key={`s-${s.kind}-${s.date}`}
                      title={`${KIND_LABELS[s.kind] ?? s.kind} may post at ${s.time}`}
                      data-testid={`cal-slot-${s.kind}-${s.date}`}
                      style={{
                        border: '1px dashed var(--color-border)', borderRadius: 6, padding: '2px 6px', fontSize: 10,
                        color: 'var(--color-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}
                    >
                      {s.time} · {KIND_LABELS[s.kind] ?? s.kind}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </Card>

        <Card style={{ padding: 12, flex: '1 1 220px', maxWidth: 320 }}>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Not yet on a day</div>
          {drafts.length === 0 ? (
            <p style={{ margin: 0, fontSize: 12, color: 'var(--color-text-muted)' }}>No drafts waiting.</p>
          ) : (
            <div style={{ display: 'grid', gap: 4 }}>
              {drafts.map(entryChip)}
              {canSchedule && <p style={{ margin: '6px 0 0', fontSize: 11, color: 'var(--color-text-muted)' }}>Drag one onto a day to schedule it at 11:00.</p>}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
