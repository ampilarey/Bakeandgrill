import { useEffect, useState } from 'react';
import { Fingerprint } from 'lucide-react';
import {
  Badge, Btn, Card, ConfirmDialog, EmptyState, InlineIcon, Switch, TableCard, TD, TD_NOWRAP, TH, useConfirmDialog,
} from '../components/SharedUI';
import {
  getClockMachine, removeClockDevice, setClockUserNo, updateClockDevice,
  type ClockMachineState, type ClockStaffRow,
} from '../api';

/**
 * Time Clock → Clock machine (owner, 2026-10-19: a ZKTeco P160/ID). A fingerprint or palm
 * clock sends each punch to the site (ADMS); it is allowed here by its serial number, and
 * each staff member's number on the clock is set here, so a punch lands on the time clock
 * as a clock in or out. Backend: App\Domains\Shifts\ClockMachine.
 */
const RESULT: Record<string, { label: string; color: string }> = {
  in: { label: 'Clocked in', color: 'green' },
  out: { label: 'Clocked out', color: 'brown' },
  double: { label: 'Second scan', color: 'gray' },
  early: { label: 'Before the clock was allowed', color: 'gray' },
};

function when(iso: string | null): string {
  if (!iso) return 'never';
  const d = new Date(iso);
  return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

export default function ClockMachinePanel({ canEdit }: { canEdit: boolean }) {
  const [state, setState] = useState<ClockMachineState | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [numbers, setNumbers] = useState<Record<number, string>>({});
  const { state: dlg, ask, close } = useConfirmDialog();

  const load = async () => {
    try {
      const s = await getClockMachine();
      setState(s);
      setNumbers(Object.fromEntries(s.staff.map((u) => [u.id, u.clock_user_no ?? ''])));
      setError('');
    } catch (e) { setError((e as Error).message); }
  };
  useEffect(() => { void load(); }, []);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true); setError('');
    try { await fn(); await load(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  if (!state) {
    return error ? <p style={{ color: 'var(--color-danger)', fontSize: 13 }}>{error}</p> : <p style={{ color: 'var(--color-text-muted)' }}>Loading…</p>;
  }

  const host = state.push_url.replace(/^https?:\/\//, '');
  const free = state.staff.filter((u) => !u.clock_user_no);

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {error && <p role="alert" style={{ color: 'var(--color-danger)', fontSize: 13, margin: 0 }}>{error}</p>}

      <Card>
        <h3 style={{ margin: '0 0 4px', fontSize: 16 }}><InlineIcon icon={Fingerprint} size={16} />Clocks</h3>
        <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--color-text-secondary)' }}>
          A clock shows here the first time it calls the site. Switch it on to count its punches.
        </p>
        {state.devices.length === 0 ? (
          <EmptyState message="No clock has called yet. Set it up with the steps below." />
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {state.devices.map((d) => (
              <div key={d.id} style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', padding: 12, border: '1px solid var(--color-border)', borderRadius: 12, background: 'var(--color-bg)' }}>
                <div style={{ flex: '1 1 220px', minWidth: 0 }}>
                  <input
                    aria-label="Clock name"
                    defaultValue={d.name ?? ''}
                    placeholder="Name, e.g. Kitchen door"
                    disabled={!canEdit || busy}
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if (v !== (d.name ?? '')) void run(() => updateClockDevice(d.id, { name: v || null }));
                    }}
                    style={{ width: '100%', minHeight: 44, fontSize: 16, padding: '0 10px', borderRadius: 10, border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)', fontFamily: 'inherit', boxSizing: 'border-box' }}
                  />
                  <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 4 }}>
                    Serial {d.serial} · last heard {when(d.last_seen_at)} · {d.punches_today} punches today · {d.enrolled} enrolled
                  </div>
                </div>
                {d.allowed ? <Badge color="green">Counting</Badge> : <Badge color="orange">Waiting</Badge>}
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                  <Switch
                    checked={d.allowed}
                    disabled={!canEdit || busy}
                    aria-label={d.allowed ? 'Stop counting this clock' : 'Allow this clock'}
                    onChange={(next) => void run(() => updateClockDevice(d.id, { allowed: next }))}
                  />
                  Allowed
                </label>
                {canEdit && !d.allowed && (
                  <Btn small variant="danger-outline" disabled={busy} onClick={() => ask({
                    title: 'Remove this clock?',
                    message: `Clock ${d.serial} and the punches it sent are removed. If it calls again it shows up here as waiting.`,
                    confirmLabel: 'Remove',
                    danger: true,
                    onConfirm: () => void run(() => removeClockDevice(d.id)),
                  })}>Remove</Btn>
                )}
              </div>
            ))}
          </div>
        )}

        <details style={{ marginTop: 14 }}>
          <summary style={{ cursor: 'pointer', fontWeight: 700, fontSize: 14 }}>How to set up the clock</summary>
          <ol style={{ margin: '10px 0 0', paddingLeft: 20, fontSize: 13, lineHeight: 1.7, color: 'var(--color-text-secondary)' }}>
            <li>Plug in its network cable, and check the date and time on the clock are right.</li>
            <li>On the clock: <strong>Menu → Comm. → Cloud Server Setting</strong>.</li>
            <li>Server Mode <strong>ADMS</strong>, Enable Domain Name <strong>ON</strong>, Server Address <strong>{host}</strong>, Server Port <strong>80</strong>, Enable Proxy Server <strong>OFF</strong>. Save, then restart the clock.</li>
            <li>Within a minute it shows above as Waiting. Switch it to Allowed.</li>
            <li>Enrol each person on the clock as usual, then type the number the clock gave them under <strong>Numbers on the clock</strong>.</li>
          </ol>
          <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--color-text-muted)' }}>
            The clock sends plain HTTP, so the site must let <code>/iclock/</code> through without moving it to HTTPS (owner checklist, clock machine).
            The first punch of a shift clocks in and the next clocks out; the clock's in and out keys are not needed.
          </p>
        </details>
      </Card>

      {state.unmatched.length > 0 && (
        <Card style={{ borderColor: 'color-mix(in srgb, var(--color-warning) 35%, transparent)' }}>
          <h3 style={{ margin: '0 0 4px', fontSize: 16 }}>Numbers nobody has</h3>
          <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--color-text-secondary)' }}>
            These numbers punched on the clock but belong to no staff member. Give each one to its person and their punches go on the time clock.
          </p>
          <div style={{ display: 'grid', gap: 8 }}>
            {state.unmatched.map((u) => (
              <div key={u.no} style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
                <strong style={{ minWidth: 90 }}>No. {u.no}</strong>
                <span style={{ fontSize: 13, color: 'var(--color-text-secondary)', flex: '1 1 200px' }}>
                  {u.name ? `${u.name} on the clock · ` : ''}{u.punches} {u.punches === 1 ? 'punch' : 'punches'} · last {when(u.last_at)}
                </span>
                {canEdit && (
                  <select
                    aria-label={`Give number ${u.no} to`}
                    defaultValue=""
                    disabled={busy || free.length === 0}
                    onChange={(e) => {
                      const id = Number(e.target.value);
                      if (id) void run(() => setClockUserNo(id, u.no));
                    }}
                    style={{ minHeight: 44, fontSize: 16, borderRadius: 10, border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)', padding: '0 8px', fontFamily: 'inherit' }}
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

      <div>
        <h3 style={{ margin: '0 0 8px', fontSize: 16 }}>Numbers on the clock</h3>
        <TableCard>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>{['Staff', 'Number on the clock', ''].map((h) => <th key={h} style={TH}>{h}</th>)}</tr></thead>
            <tbody>
              {state.staff.length === 0 ? (
                <tr><td colSpan={3}><EmptyState message="No active staff." /></td></tr>
              ) : state.staff.map((u: ClockStaffRow) => {
                const typed = numbers[u.id] ?? '';
                const changed = typed.trim() !== (u.clock_user_no ?? '');
                return (
                  <tr key={u.id}>
                    <td style={{ ...TD, fontWeight: 600 }}>
                      {u.name}
                      {u.name_on_clock && <div style={{ fontSize: 12, fontWeight: 400, color: 'var(--color-text-muted)' }}>On the clock: {u.name_on_clock}</div>}
                    </td>
                    <td style={TD}>
                      <input
                        aria-label={`Number on the clock for ${u.name}`}
                        inputMode="numeric"
                        maxLength={20}
                        value={typed}
                        disabled={!canEdit || busy}
                        onChange={(e) => setNumbers((n) => ({ ...n, [u.id]: e.target.value.replace(/[^0-9A-Za-z]/g, '') }))}
                        placeholder="—"
                        style={{ width: 110, minHeight: 44, fontSize: 16, padding: '0 10px', borderRadius: 10, border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)', fontFamily: 'inherit' }}
                      />
                    </td>
                    <td style={TD}>
                      {canEdit && changed && (
                        <Btn small disabled={busy} onClick={() => void run(() => setClockUserNo(u.id, typed.trim() || null))}>Save</Btn>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableCard>
      </div>

      <div>
        <h3 style={{ margin: '0 0 8px', fontSize: 16 }}>Last punches</h3>
        <TableCard>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>{['Time', 'Number', 'Staff', 'Result'].map((h) => <th key={h} style={TH}>{h}</th>)}</tr></thead>
            <tbody>
              {state.recent.length === 0 ? (
                <tr><td colSpan={4}><EmptyState message="No punches from a clock yet." /></td></tr>
              ) : state.recent.map((p) => {
                const r = p.result ? RESULT[p.result] : null;
                return (
                  <tr key={p.id}>
                    <td style={TD_NOWRAP}>{when(p.punched_at)}</td>
                    <td style={TD}>{p.no}</td>
                    <td style={TD}>{p.staff ?? <span style={{ color: 'var(--color-text-muted)' }}>Nobody yet</span>}</td>
                    <td style={TD}>{r ? <Badge color={r.color}>{r.label}</Badge> : <Badge color="orange">Waiting for a number</Badge>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableCard>
      </div>

      <ConfirmDialog state={dlg} close={close} />
    </div>
  );
}
