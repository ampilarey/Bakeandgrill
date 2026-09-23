/**
 * Quick notices for the TV board (owner's shortlist, 2026-09-23).
 *
 * "Kitchen closes in 20 min", "Fresh hedhikaa at 4" — typed on a phone,
 * posted in three taps, gone by itself. A notice can run as a line on the
 * ticker, as a full slide in the loop, or both.
 */
import { useState, type CSSProperties } from 'react';
import { Trash2 } from 'lucide-react';
import {
  deleteSignageNotice,
  postSignageNotice,
  setSignageBoardSettings,
  type SignageBoardSettings,
  type SignageNotice,
} from '../../api';
import { useToast } from '../../components/ui';
import { Btn, Card } from '../../components/SharedUI';

type Props = {
  notices: SignageNotice[];
  settings: SignageBoardSettings | undefined;
  onNotices: (list: SignageNotice[]) => void;
  onSettings: (settings: SignageBoardSettings) => void;
};

const LOOKS: Array<{ value: string; label: string; hint: string }> = [
  { value: 'info', label: 'Notice', hint: 'Brand colours' },
  { value: 'warning', label: 'Please note', hint: 'Red — closing, delays' },
  { value: 'celebrate', label: 'Celebrate', hint: 'Gold — fresh batch, offers' },
];

const SHOWS: Array<{ value: string; label: string }> = [
  { value: 'both', label: 'Ticker line + full slide' },
  { value: 'ticker', label: 'Ticker line only' },
  { value: 'slide', label: 'Full slide only' },
];

const DURATIONS: Array<{ value: number; label: string }> = [
  { value: 15, label: '15 minutes' },
  { value: 30, label: '30 minutes' },
  { value: 60, label: '1 hour' },
  { value: 180, label: '3 hours' },
  { value: 0, label: 'Until removed' },
];

const label: CSSProperties = { fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 6, display: 'block' };
const field: CSSProperties = { minHeight: 44, width: '100%', borderRadius: 10, border: '1px solid var(--color-border)', padding: '0 12px', fontSize: 14, fontFamily: 'inherit', boxSizing: 'border-box', background: 'var(--color-surface)', color: 'var(--color-text)' };
const cardTitle: CSSProperties = { fontSize: 15, fontWeight: 700, color: 'var(--color-text)', margin: '0 0 12px' };

function minutesUntilNow(minutes: number): number | undefined {
  return minutes > 0 ? minutes : undefined;
}

function expiryLabel(n: SignageNotice): string {
  if (!n.expires_at) return 'until removed';
  const ms = Date.parse(n.expires_at) - Date.now();
  if (!Number.isFinite(ms)) return '';
  if (ms <= 0) return 'expiring';
  const mins = Math.round(ms / 60_000);
  if (mins < 60) return `${mins} min left`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h} h ${m} min left` : `${h} h left`;
}

export function NoticesPanel({ notices, settings, onNotices, onSettings }: Props) {
  const toast = useToast();
  const [text, setText] = useState('');
  const [textDv, setTextDv] = useState('');
  const [look, setLook] = useState('info');
  const [show, setShow] = useState('both');
  const [minutes, setMinutes] = useState(60);
  const [posting, setPosting] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [soldOutMinutes, setSoldOutMinutes] = useState(String(settings?.sold_out_badge_minutes ?? 20));
  const [savingSettings, setSavingSettings] = useState(false);

  const post = async () => {
    if (text.trim() === '') {
      toast.error('Type the notice first.');
      return;
    }
    setPosting(true);
    try {
      const res = await postSignageNotice({
        text: text.trim(),
        text_dv: textDv.trim() || undefined,
        look,
        show,
        minutes: minutesUntilNow(minutes),
      });
      onNotices(res.notices);
      setText('');
      setTextDv('');
      toast.success('Notice is on the board.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not post the notice');
    } finally {
      setPosting(false);
    }
  };

  const remove = async (id: string) => {
    setRemoving(id);
    try {
      const res = await deleteSignageNotice(id);
      onNotices(res.notices);
      toast.success('Notice taken down.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not remove the notice');
    } finally {
      setRemoving(null);
    }
  };

  const saveSettings = async () => {
    setSavingSettings(true);
    try {
      const res = await setSignageBoardSettings({ sold_out_badge_minutes: Math.max(0, Number(soldOutMinutes) || 0) });
      onSettings(res.settings);
      toast.success('Saved.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save');
    } finally {
      setSavingSettings(false);
    }
  };

  return (
    <div data-testid="signage-notices-panel">
      <Card style={{ marginBottom: 16 }}>
        <h3 style={cardTitle}>Post a notice</h3>
        <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--color-text-secondary)', maxWidth: 560 }}>
          Goes on every TV in the next refresh and takes itself down when the time is up. No designer needed.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={label} htmlFor="signage-notice-text">Notice</label>
            <input id="signage-notice-text" data-testid="signage-notice-text" style={field} maxLength={160} value={text} placeholder="Kitchen closes in 20 minutes" onChange={(e) => setText(e.target.value)} />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={label} htmlFor="signage-notice-text-dv">Dhivehi (optional)</label>
            <input id="signage-notice-text-dv" data-testid="signage-notice-text-dv" style={{ ...field, textAlign: 'right' }} lang="dv" dir="rtl" maxLength={160} value={textDv} onChange={(e) => setTextDv(e.target.value)} />
          </div>
          <div>
            <label style={label}>Look</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {LOOKS.map((l) => (
                <button key={l.value} type="button" data-testid={`signage-notice-look-${l.value}`} aria-pressed={look === l.value} title={l.hint} onClick={() => setLook(l.value)} style={chip(look === l.value)}>
                  {l.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label style={label} htmlFor="signage-notice-show">Show as</label>
            <select id="signage-notice-show" data-testid="signage-notice-show" style={field} value={show} onChange={(e) => setShow(e.target.value)}>
              {SHOWS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
          <div>
            <label style={label} htmlFor="signage-notice-minutes">For</label>
            <select id="signage-notice-minutes" data-testid="signage-notice-minutes" style={field} value={String(minutes)} onChange={(e) => setMinutes(Number(e.target.value))}>
              {DURATIONS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
            </select>
          </div>
        </div>
        <div style={{ marginTop: 14 }}>
          <Btn onClick={() => void post()} disabled={posting} style={{ minHeight: 44 }} data-testid="signage-notice-post">
            {posting ? 'Posting…' : 'Post to the board'}
          </Btn>
        </div>
      </Card>

      <Card style={{ marginBottom: 16 }}>
        <h3 style={cardTitle}>On the board now</h3>
        {notices.length === 0 ? (
          <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-muted)' }}>Nothing posted.</p>
        ) : (
          notices.map((n) => (
            <div key={n.id} data-testid={`signage-notice-${n.id}`} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--color-border-light)' }}>
              <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: 999, flex: '0 0 auto', background: n.look === 'warning' ? 'var(--color-danger)' : n.look === 'celebrate' ? 'var(--color-warning)' : 'var(--color-primary)' }} />
              <div style={{ flex: '1 1 auto', minWidth: 0 }}>
                <div style={{ fontWeight: 600, color: 'var(--color-text)' }}>{n.text}</div>
                {n.text_dv ? <div lang="dv" dir="rtl" style={{ fontSize: 13, color: 'var(--color-text-secondary)', textAlign: 'left' }}>{n.text_dv}</div> : null}
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                  {SHOWS.find((s) => s.value === n.show)?.label ?? n.show} · {expiryLabel(n)}
                </div>
              </div>
              <Btn variant="danger" small onClick={() => void remove(n.id)} disabled={removing === n.id} style={{ minHeight: 40 }} data-testid={`signage-notice-remove-${n.id}`}>
                <Trash2 size={14} /> Take down
              </Btn>
            </div>
          ))
        )}
      </Card>

      <Card>
        <h3 style={cardTitle}>Sold-out dishes</h3>
        <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--color-text-secondary)', maxWidth: 560 }}>
          When a dish runs out it stays on its category slide with a red SOLD OUT pill for this long, then drops off. 0 drops it at once.
        </p>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ width: 160 }}>
            <label style={label} htmlFor="signage-sold-out-minutes">Minutes</label>
            <input id="signage-sold-out-minutes" data-testid="signage-sold-out-minutes" type="number" min={0} max={240} style={field} value={soldOutMinutes} onChange={(e) => setSoldOutMinutes(e.target.value)} />
          </div>
          <Btn onClick={() => void saveSettings()} disabled={savingSettings} style={{ minHeight: 44 }} data-testid="signage-sold-out-save">
            {savingSettings ? 'Saving…' : 'Save'}
          </Btn>
        </div>
      </Card>
    </div>
  );
}

function chip(active: boolean): CSSProperties {
  return {
    minHeight: 40,
    padding: '0 14px',
    borderRadius: 999,
    cursor: 'pointer',
    fontFamily: 'inherit',
    fontSize: 13,
    fontWeight: 600,
    background: active ? 'var(--color-primary)' : 'var(--color-surface)',
    color: active ? '#fff' : 'var(--color-text)',
    border: active ? '1px solid var(--color-primary)' : '1px solid var(--color-border)',
  };
}
