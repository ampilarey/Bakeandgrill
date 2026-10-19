import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Fingerprint, Pencil, RefreshCw, Search, X } from 'lucide-react';
import {
  Badge, Btn, Card, ConfirmDialog, EmptyState, InlineIcon, Switch, TabScrollRow, useConfirmDialog,
} from '../components/SharedUI';
import {
  getClockMachine, removeClockDevice, setClockUserNo, updateClockDevice,
  type ClockDeviceRow, type ClockMachineState, type ClockRecentPunch, type ClockStaffRow,
} from '../api';

/**
 * Time Clock → Clock machine (owner, 2026-10-19: a ZKTeco P160/ID). A fingerprint or palm
 * clock sends each punch to the site (ADMS); it is allowed here by its serial number, and
 * each staff member's number on the clock is set here, so a punch lands on the time clock
 * as a clock in or out. Backend: App\Domains\Shifts\ClockMachine.
 *
 * Layout (owner, 2026-10-20: "enhance the layout both on desktop and mobile"): a strip of
 * four figures, then the clocks and the last punches side by side on a computer and one
 * under the other on a phone, then the staff numbers as a searchable list (two columns
 * where there is room), never a wide table. It refreshes every 30 seconds while open.
 */
const RESULT: Record<string, { label: string; color: string }> = {
  in: { label: 'Clocked in', color: 'green' },
  out: { label: 'Clocked out', color: 'brown' },
  double: { label: 'Second scan', color: 'gray' },
  early: { label: 'Before the clock was allowed', color: 'gray' },
};

/** A clock calls every few seconds; quiet for this long, it is offline. */
const ONLINE_MINUTES = 3;
const REFRESH_MS = 30_000;

type Filter = 'all' | 'set' | 'unset';

function when(iso: string | null): string {
  if (!iso) return 'never';
  const d = new Date(iso);
  return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

function ago(iso: string | null): string {
  if (!iso) return 'never';
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  if (mins < 24 * 60) return `${Math.round(mins / 60)} h ago`;
  return when(iso);
}

function isOnline(d: ClockDeviceRow): boolean {
  return !!d.last_seen_at && Date.now() - new Date(d.last_seen_at).getTime() < ONLINE_MINUTES * 60_000;
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const y = new Date(); y.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
}

const field: React.CSSProperties = {
  minHeight: 44, fontSize: 16, padding: '0 10px', borderRadius: 10, border: '1px solid var(--color-border)',
  background: 'var(--color-surface)', color: 'var(--color-text)', fontFamily: 'inherit', boxSizing: 'border-box',
};

const chip = (on: boolean): React.CSSProperties => ({
  minHeight: 32, padding: '0 12px', borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
  border: `1px solid ${on ? 'var(--color-tone-rust-border)' : 'var(--color-border)'}`,
  background: on ? 'var(--color-tone-rust-bg)' : 'var(--color-surface)',
  color: on ? 'var(--color-tone-rust-text)' : 'var(--color-text-secondary)',
});

const sectionTitle: React.CSSProperties = { margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--color-text)' };
const muted: React.CSSProperties = { fontSize: 13, color: 'var(--color-text-secondary)' };

export default function ClockMachinePanel({ canEdit }: { canEdit: boolean }) {
  const [state, setState] = useState<ClockMachineState | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [numbers, setNumbers] = useState<Record<number, string>>({});
  const dirty = useRef<Set<number>>(new Set());
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const { state: dlg, ask, close } = useConfirmDialog();

  const load = async () => {
    try {
      const s = await getClockMachine();
      setState(s);
      // A number being typed survives the 30-second refresh.
      setNumbers((prev) => Object.fromEntries(s.staff.map((u) => [u.id, dirty.current.has(u.id) ? (prev[u.id] ?? '') : (u.clock_user_no ?? '')])));
      setError('');
    } catch (e) { setError((e as Error).message); }
  };
  useEffect(() => {
    void load();
    const t = window.setInterval(() => { if (!document.hidden) void load(); }, REFRESH_MS);
    return () => window.clearInterval(t);
  }, []);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true); setError('');
    try { await fn(); await load(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  const saveNumber = (u: ClockStaffRow) => run(async () => {
    await setClockUserNo(u.id, (numbers[u.id] ?? '').trim() || null);
    dirty.current.delete(u.id);
  });

  const staff = state?.staff ?? [];
  const matched = staff.filter((u) => u.clock_user_no).length;
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return staff
      .filter((u) => filter === 'all' || (filter === 'set' ? !!u.clock_user_no : !u.clock_user_no))
      .filter((u) => !q || u.name.toLowerCase().includes(q) || (u.clock_user_no ?? '').includes(q) || (u.name_on_clock ?? '').toLowerCase().includes(q));
  }, [staff, query, filter]);

  if (!state) {
    return error ? <p style={{ color: 'var(--color-danger)', fontSize: 13 }}>{error}</p> : <p style={{ color: 'var(--color-text-muted)' }}>Loading…</p>;
  }

  const host = state.push_url.replace(/^https?:\/\//, '');
  const free = staff.filter((u) => !u.clock_user_no);
  const punchesToday = state.devices.reduce((n, d) => n + d.punches_today, 0);
  const online = state.devices.filter((d) => d.allowed && isOnline(d)).length;
  const allowed = state.devices.filter((d) => d.allowed).length;

  return (
    // minmax(0, 1fr): a grid column with no floor grows to its widest unbroken line.
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 16 }}>
      {error && <p role="alert" style={{ color: 'var(--color-danger)', fontSize: 13, margin: 0 }}>{error}</p>}

      {/* Four figures: is it working, and is anything left to do. */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))', gap: 10 }}>
        <Figure label="Clocks online" value={allowed ? `${online} of ${allowed}` : '—'} tone={allowed && online === allowed ? 'good' : allowed ? 'warn' : 'plain'} />
        <Figure label="Punches today" value={String(punchesToday)} />
        <Figure label="Staff with a number" value={`${matched} of ${staff.length}`} tone={matched === 0 && staff.length > 0 ? 'warn' : 'plain'} />
        <Figure label="Numbers nobody has" value={String(state.unmatched.length)} tone={state.unmatched.length ? 'warn' : 'plain'} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 380px), 1fr))', gap: 16, alignItems: 'start' }}>
        <Card style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
            <h3 style={sectionTitle}><InlineIcon icon={Fingerprint} size={16} />Clocks</h3>
            <Btn small variant="ghost" disabled={busy} onClick={() => void load()} aria-label="Refresh">
              <RefreshCw size={14} aria-hidden /> Refresh
            </Btn>
          </div>
          <p style={{ ...muted, margin: '0 0 12px' }}>A clock shows here the first time it calls the site. Switch it on to count its punches.</p>

          {state.devices.length === 0 ? (
            <EmptyState message="No clock has called yet. Set it up with the steps below." />
          ) : (
            <div style={{ display: 'grid', gap: 10 }}>
              {state.devices.map((d) => (
                <ClockCard
                  key={d.id}
                  device={d}
                  canEdit={canEdit}
                  busy={busy}
                  onRename={(name) => void run(() => updateClockDevice(d.id, { name: name || null }))}
                  onAllow={(next) => void run(() => updateClockDevice(d.id, { allowed: next }))}
                  onRemove={() => ask({
                    title: 'Remove this clock?',
                    message: `Clock ${d.serial} and the punches it sent are removed. If it calls again it shows up here as waiting.`,
                    confirmLabel: 'Remove',
                    danger: true,
                    onConfirm: () => void run(() => removeClockDevice(d.id)),
                  })}
                />
              ))}
            </div>
          )}

          <details style={{ marginTop: 14, borderTop: '1px solid var(--color-border-light)', paddingTop: 12 }}>
            <summary style={{ cursor: 'pointer', fontWeight: 700, fontSize: 14 }}>How to set up the clock</summary>
            <ol style={{ margin: '10px 0 0', paddingLeft: 20, fontSize: 13, lineHeight: 1.7, color: 'var(--color-text-secondary)' }}>
              <li>Connect it by cable or WiFi with DHCP on, and check the date and time on the clock are right.</li>
              <li>On the clock: <strong>Menu → Comm. → Cloud Server Setting</strong>.</li>
              <li>Server Mode <strong>ADMS</strong>, Enable Domain Name <strong>ON</strong>, Server Address <strong>{host}</strong>, Server Port <strong>80</strong>, Enable Proxy Server <strong>OFF</strong>. Save, then restart the clock.</li>
              <li>Within a minute it shows above as Waiting. Switch it to Allowed.</li>
              <li>Find each person's User ID under <strong>Menu → User Mgt → All Users</strong> and type it under <strong>Numbers on the clock</strong>.</li>
            </ol>
            <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--color-text-muted)' }}>
              The clock sends plain HTTP, so the site lets <code>/iclock/</code> through without moving it to HTTPS (owner checklist 7c).
              The first punch of a shift clocks in and the next clocks out; the clock's in and out keys are not needed.
            </p>
          </details>
        </Card>

        <Card style={{ minWidth: 0 }}>
          <h3 style={{ ...sectionTitle, marginBottom: 4 }}>Last punches</h3>
          <p style={{ ...muted, margin: '0 0 8px' }}>Updates by itself every 30 seconds.</p>
          <RecentPunches punches={state.recent} />
        </Card>
      </div>

      {state.unmatched.length > 0 && (
        <Card style={{ borderColor: 'color-mix(in srgb, var(--color-warning) 35%, transparent)' }}>
          <h3 style={{ ...sectionTitle, marginBottom: 4 }}>Numbers nobody has</h3>
          <p style={{ ...muted, margin: '0 0 12px' }}>
            These numbers punched on the clock but belong to no staff member. Give each one to its person and their punches go on the time clock.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 320px), 1fr))', gap: 10 }}>
            {state.unmatched.map((u) => (
              <div key={u.no} style={{ display: 'grid', gap: 8, padding: 12, borderRadius: 12, background: 'var(--color-bg)', border: '1px solid var(--color-border-light)' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                  <strong style={{ fontSize: 15 }}>No. {u.no}</strong>
                  <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
                    {u.name ? `${u.name} on the clock · ` : ''}{u.punches} {u.punches === 1 ? 'punch' : 'punches'} · last {ago(u.last_at)}
                  </span>
                </div>
                {canEdit && (
                  <select
                    aria-label={`Give number ${u.no} to`}
                    defaultValue=""
                    disabled={busy || free.length === 0}
                    onChange={(e) => {
                      const id = Number(e.target.value);
                      if (id) void run(() => setClockUserNo(id, u.no));
                    }}
                    style={{ ...field, width: '100%' }}
                  >
                    <option value="">Give to…</option>
                    {free.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
          <h3 style={sectionTitle}>Numbers on the clock</h3>
          <span style={muted}>{matched} of {staff.length} staff have a number</span>
        </div>
        <p style={{ ...muted, margin: '0 0 12px' }}>The User ID each person has on the clock (Menu → User Mgt → All Users).</p>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 12 }}>
          <div style={{ position: 'relative', flex: '1 1 220px', maxWidth: 360 }}>
            <Search size={16} aria-hidden style={{ position: 'absolute', left: 12, top: 14, color: 'var(--color-text-muted)' }} />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name or number"
              aria-label="Search staff"
              style={{ ...field, width: '100%', paddingLeft: 36 }}
            />
          </div>
          <TabScrollRow fit style={{ gap: 6 }} role="tablist" aria-label="Show">
            {([['all', `All ${staff.length}`], ['unset', `No number ${staff.length - matched}`], ['set', `Has a number ${matched}`]] as const).map(([id, label]) => (
              <button key={id} type="button" role="tab" aria-selected={filter === id} style={chip(filter === id)} onClick={() => setFilter(id)}>{label}</button>
            ))}
          </TabScrollRow>
        </div>

        {shown.length === 0 ? (
          <EmptyState message={staff.length === 0 ? 'No active staff.' : 'Nobody matches.'} />
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 340px), 1fr))', gap: 8 }}>
            {shown.map((u) => {
              const typed = numbers[u.id] ?? '';
              const changed = typed.trim() !== (u.clock_user_no ?? '');
              return (
                <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 12, border: '1px solid var(--color-border-light)', background: u.clock_user_no ? 'var(--color-surface)' : 'var(--color-bg)' }}>
                  <span aria-hidden style={{ width: 36, height: 36, flex: '0 0 auto', borderRadius: '50%', display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: 14, background: 'var(--color-tone-brown-bg)', color: 'var(--color-tone-brown-text)' }}>
                    {u.name.trim().charAt(0).toUpperCase() || '?'}
                  </span>
                  <div style={{ flex: '1 1 auto', minWidth: 0 }}>
                    <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                      {u.name_on_clock ? `On the clock: ${u.name_on_clock}` : u.clock_user_no ? 'Matched' : 'No number yet'}
                    </div>
                  </div>
                  <input
                    aria-label={`Number on the clock for ${u.name}`}
                    inputMode="numeric"
                    maxLength={20}
                    value={typed}
                    disabled={!canEdit || busy}
                    onChange={(e) => {
                      dirty.current.add(u.id);
                      setNumbers((n) => ({ ...n, [u.id]: e.target.value.replace(/[^0-9A-Za-z]/g, '') }));
                    }}
                    onKeyDown={(e) => { if (e.key === 'Enter' && changed) void saveNumber(u); }}
                    placeholder="—"
                    style={{ ...field, width: 76, flex: '0 0 auto', textAlign: 'center' }}
                  />
                  {canEdit && changed && (
                    <Btn small disabled={busy} onClick={() => void saveNumber(u)}>Save</Btn>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <ConfirmDialog state={dlg} close={close} />
    </div>
  );
}

function Figure({ label, value, tone = 'plain' }: { label: string; value: string; tone?: 'plain' | 'good' | 'warn' }) {
  const edge = tone === 'good' ? 'var(--color-success)' : tone === 'warn' ? 'var(--color-warning)' : 'var(--color-border)';
  return (
    <div style={{ padding: '10px 12px', borderRadius: 12, background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderLeft: `4px solid ${edge}`, minWidth: 0 }}>
      <div style={{ fontSize: 12, color: 'var(--color-text-muted)', fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--color-text)', marginTop: 2 }}>{value}</div>
    </div>
  );
}

function ClockCard({ device: d, canEdit, busy, onRename, onAllow, onRemove }: {
  device: ClockDeviceRow; canEdit: boolean; busy: boolean;
  onRename: (name: string) => void; onAllow: (next: boolean) => void; onRemove: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(d.name ?? '');
  const online = isOnline(d);
  const save = () => { setEditing(false); if (name.trim() !== (d.name ?? '')) onRename(name.trim()); };

  return (
    <div style={{ display: 'grid', gap: 10, padding: 12, border: '1px solid var(--color-border)', borderRadius: 12, background: 'var(--color-bg)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span aria-hidden style={{ width: 40, height: 40, borderRadius: 10, display: 'grid', placeItems: 'center', background: 'var(--color-tone-rust-bg)', color: 'var(--color-tone-rust-text)', flex: '0 0 auto' }}>
          <Fingerprint size={20} />
        </span>
        <div style={{ flex: '1 1 160px', minWidth: 0 }}>
          {editing ? (
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                aria-label="Clock name"
                autoFocus
                value={name}
                placeholder="Name, e.g. Kitchen door"
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { setName(d.name ?? ''); setEditing(false); } }}
                style={{ ...field, flex: '1 1 auto', minWidth: 0 }}
              />
              <Btn small onClick={save} aria-label="Save name"><Check size={14} aria-hidden /></Btn>
              <Btn small variant="ghost" onClick={() => { setName(d.name ?? ''); setEditing(false); }} aria-label="Cancel"><X size={14} aria-hidden /></Btn>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
              <strong style={{ fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name || 'Unnamed clock'}</strong>
              {canEdit && (
                <Btn small variant="ghost" disabled={busy} onClick={() => setEditing(true)} aria-label="Rename clock" style={{ padding: '0 6px' }}>
                  <Pencil size={14} aria-hidden />
                </Btn>
              )}
            </div>
          )}
          <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2 }}>Serial {d.serial}</div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {d.allowed ? <Badge color="green">Counting</Badge> : <Badge color="orange">Waiting</Badge>}
          {d.allowed && <Badge color={online ? 'green' : 'red'}>{online ? 'Online' : 'Offline'}</Badge>}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
        <Mini label="Last heard" value={ago(d.last_seen_at)} />
        <Mini label="Punches today" value={String(d.punches_today)} />
        <Mini label="Enrolled" value={d.enrolled ? String(d.enrolled) : '—'} />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600 }}>
          <Switch
            checked={d.allowed}
            disabled={!canEdit || busy}
            aria-label={d.allowed ? 'Stop counting this clock' : 'Allow this clock'}
            onChange={onAllow}
          />
          Allowed
        </label>
        {canEdit && !d.allowed && (
          <Btn small variant="danger-outline" disabled={busy} onClick={onRemove}>Remove</Btn>
        )}
      </div>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ padding: '6px 8px', borderRadius: 8, background: 'var(--color-surface)', border: '1px solid var(--color-border-light)', minWidth: 0 }}>
      <div style={{ fontSize: 11, color: 'var(--color-text-muted)', fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</div>
    </div>
  );
}

function RecentPunches({ punches }: { punches: ClockRecentPunch[] }) {
  if (punches.length === 0) return <EmptyState message="No punches from a clock yet." />;
  const groups: { day: string; rows: ClockRecentPunch[] }[] = [];
  for (const p of punches) {
    const day = dayLabel(p.punched_at);
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.rows.push(p); else groups.push({ day, rows: [p] });
  }
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 12 }}>
      {groups.map((g) => (
        <div key={g.day}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: 0.4, margin: '0 0 4px' }}>{g.day}</div>
          <div style={{ display: 'grid' }}>
            {g.rows.map((p) => {
              const r = p.result ? RESULT[p.result] : null;
              return (
                <div key={p.id} style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', columnGap: 10, rowGap: 4, padding: '8px 0', borderBottom: '1px solid var(--color-border-light)' }}>
                  <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700, minWidth: 52, whiteSpace: 'nowrap' }}>
                    {new Date(p.punched_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <span style={{ flex: '1 1 120px', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.staff ?? <span style={{ color: 'var(--color-text-muted)' }}>Nobody yet</span>}
                    <span style={{ color: 'var(--color-text-muted)', fontSize: 12 }}> · No. {p.no}</span>
                  </span>
                  {/* On a phone the badge drops under the name instead of pushing past the card. */}
                  <span style={{ marginLeft: 'auto' }}>
                    {r ? <Badge color={r.color}>{r.label}</Badge> : <Badge color="orange">Waiting for a number</Badge>}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
