import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Sparkles } from 'lucide-react';
import { Btn, Card } from '../components/SharedUI';
import { decideSuggestions, fetchAiSuggestions, lookForSuggestions, type AiSuggestionKind, type AiSuggestionRow, type NoPhotoDish } from '../api/ai';
import { inputFont } from '../utils/cssVars';

/*
 * System → Integrations → Suggestions (owner, 2026-11-24: "since menu is public add admin
 * approval. And can add automatic dhivehi and rest of the possible automatic updates?").
 *
 * What the assistant proposed by itself, each night or on Look now, grouped by kind. Nothing
 * here has happened yet: a tick and Approve makes the change, Turn down forgets it for two
 * months. Dhivehi can be reworded in its box before approving. A person sees only the kinds
 * whose screen they may change (the menu, the inventory, the labels).
 */

const text = (v: unknown): string => (typeof v === 'string' || typeof v === 'number' ? String(v) : '');
const list = (v: unknown): string[] => (Array.isArray(v) ? v.map((x) => String(x)) : []);

/** The fields of a suggestion a person may reword before approving, by kind. */
const EDITABLE: Record<string, Array<{ field: string; label: string; dv?: boolean }>> = {
  menu_dhivehi: [{ field: 'name_dv', label: 'Name', dv: true }, { field: 'short_description_dv', label: 'Short line', dv: true }],
  label_glossary: [{ field: 'dv', label: 'Dhivehi', dv: true }],
  media_describe: [{ field: 'alt_text', label: 'What it shows' }],
};

/** A stored picture in the menu's own 4:3, never cut. */
function Pic({ src, label }: { src: string; label?: string }) {
  if (!src) return null;
  return (
    <figure className="sg-pic">
      <img src={src} alt="" loading="lazy" />
      {label && <figcaption className="sg-cap">{label}</figcaption>}
    </figure>
  );
}

const NUTRITION: Array<[string, string]> = [['kcal', 'kcal'], ['fat', 'fat'], ['sat_fat', 'saturates'], ['carbs', 'carbs'], ['sugars', 'sugars'], ['protein', 'protein'], ['salt', 'salt']];

function What({ kind, row, edits, onEdit }: { kind: string; row: AiSuggestionRow; edits: Record<string, string>; onEdit: (field: string, value: string) => void }) {
  const p = row.proposed;
  if (kind === 'photo_crop') {
    return <div className="sg-pics"><Pic src={text(row.before?.image)} label="Now" /><Pic src={text(p.preview)} label="Proposed" /></div>;
  }
  if (kind === 'photo_generate') {
    return <div className="sg-pics"><Pic src={text(p.preview)} label="Made by the picture service, not a photo of your food" /></div>;
  }
  if (kind === 'photo_check' || kind === 'photo_cutout') {
    return <div className="sg-pics"><Pic src={text(p.image)} /></div>;
  }
  if (EDITABLE[kind]) {
    return (
      <div style={{ display: 'grid', gap: 6 }}>
        {kind === 'media_describe' && <div className="sg-pics"><Pic src={text(p.image)} /></div>}
        {EDITABLE[kind].filter((f) => text(p[f.field]) !== '').map((f) => (
          <label key={f.field} style={{ display: 'grid', gap: 2, fontSize: 12, color: 'var(--color-text-muted)' }}>
            {f.label}
            <input
              dir={f.dv ? 'rtl' : undefined} lang={f.dv ? 'dv' : undefined} value={edits[f.field] ?? text(p[f.field])} onChange={(e) => onEdit(f.field, e.target.value)} maxLength={200}
              aria-label={`${row.subject}: ${f.label}${f.dv ? ' in Dhivehi' : ''}`} data-testid={`sg-edit-${row.id}-${f.field}`}
              style={inputFont({ width: '100%', boxSizing: 'border-box', minHeight: 44, padding: '0 10px', borderRadius: 10, border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)', fontSize: 15 })}
            />
          </label>
        ))}
        {kind === 'media_describe' && list(p.tags).length > 0 && <p className="sg-move" style={{ flexWrap: 'wrap' }}>{list(p.tags).map((t) => <span key={t} className="sg-tag">{t}</span>)}</p>}
      </div>
    );
  }
  if (kind === 'menu_category') {
    return <p className="sg-move">{text(row.before?.category) || 'No section'} <ArrowRight size={14} aria-hidden /> <strong>{text(p.category)}</strong></p>;
  }
  if (kind === 'menu_order') {
    return (
      <div className="sg-order">
        <div><span className="sg-cap">Now</span><ol>{list(row.before?.names).map((n, i) => <li key={i}>{n}</li>)}</ol></div>
        <div><span className="sg-cap">Proposed</span><ol>{list(p.names).map((n, i) => <li key={i}><strong>{n}</strong></li>)}</ol></div>
      </div>
    );
  }
  if (kind === 'inventory_category') {
    return <p className="sg-move">No category <ArrowRight size={14} aria-hidden /> <strong>{text(p.category)}</strong></p>;
  }
  if (kind === 'inventory_duplicate') {
    return (
      <p className="sg-move" style={{ flexWrap: 'wrap' }}>
        Looks the same as <strong>{text(p.other)}</strong>
        <Link to={`/inventory?item=${row.subject_id ?? ''}`}>Open the first</Link>
        <Link to={`/inventory?item=${text(p.other_id)}`}>Open the second</Link>
      </p>
    );
  }
  if (kind === 'label_nutrition') {
    return <p className="sg-move" style={{ flexWrap: 'wrap' }}>{NUTRITION.filter(([k]) => p[k] != null).map(([k, word]) => <span key={k}>{word} <strong>{text(p[k])}</strong></span>)}<span>per 100 g</span></p>;
  }
  return null;
}

function KindCard({ kind, onChanged }: { kind: AiSuggestionKind; onChanged: (note: string) => void }) {
  const [picked, setPicked] = useState<number[]>([]);
  const [edits, setEdits] = useState<Record<number, Record<string, string>>>({});
  const [busy, setBusy] = useState<'' | 'look' | 'decide'>('');
  const [error, setError] = useState('');
  const ids = kind.rows.map((r) => r.id);
  const all = ids.length > 0 && ids.every((id) => picked.includes(id));

  // A list that reloads keeps only the ticks still on it.
  useEffect(() => { setPicked((p) => p.filter((id) => ids.includes(id))); }, [kind.rows]); // eslint-disable-line react-hooks/exhaustive-deps

  const look = async () => {
    setBusy('look'); setError('');
    try {
      const { made } = await lookForSuggestions(kind.key);
      onChanged(made > 0 ? `${made} new ${made === 1 ? 'suggestion' : 'suggestions'} for ${kind.label.toLowerCase()}.` : `Nothing new for ${kind.label.toLowerCase()}.`);
    } catch (e) { setError((e as Error).message); } finally { setBusy(''); }
  };
  const decide = async (approve: boolean) => {
    if (picked.length === 0) return;
    setBusy('decide'); setError('');
    try {
      const r = await decideSuggestions(approve ? { approve: picked, edits } : { reject: picked });
      const parts = [
        r.approved ? `${r.approved} approved` : '',
        r.rejected ? `${r.rejected} ${kind.can_approve ? 'turned down' : 'dismissed'}` : '',
        r.stale ? `${r.stale} left alone because it was changed by hand since` : '',
      ].filter(Boolean);
      setPicked([]);
      onChanged(parts.join(', ') + '.');
    } catch (e) { setError((e as Error).message); } finally { setBusy(''); }
  };

  return (
    <Card data-testid={`sg-kind-${kind.key}`}>
      <div className="sg-head">
        <div style={{ minWidth: 0 }}>
          <h3 style={{ margin: 0, fontSize: 16 }}>{kind.label} {kind.rows.length > 0 && <span className="sg-count">{kind.rows.length}</span>}</h3>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--color-text-secondary)' }}>{kind.about}</p>
        </div>
        {kind.on
          ? <Btn small variant="secondary" disabled={busy !== ''} onClick={() => void look()} data-testid={`sg-look-${kind.key}`}><Sparkles size={14} aria-hidden />{busy === 'look' ? 'Looking…' : 'Look now'}</Btn>
          : <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Switched off</span>}
      </div>
      {error && <p role="alert" style={{ color: 'var(--color-danger)', fontSize: 13, margin: '8px 0 0' }}>{error}</p>}

      {kind.rows.length === 0 ? (
        <p style={{ margin: '12px 0 0', fontSize: 13, color: 'var(--color-text-muted)' }}>Nothing waiting.</p>
      ) : (
        <>
          <label className="sg-all">
            <input type="checkbox" checked={all} onChange={(e) => setPicked(e.target.checked ? ids : [])} aria-label={`Tick all ${kind.label.toLowerCase()}`} />
            Tick all
          </label>
          <ul className="sg-rows">
            {kind.rows.map((row) => (
              <li key={row.id}>
                <label className="sg-row">
                  <input type="checkbox" checked={picked.includes(row.id)} onChange={(e) => setPicked((p) => (e.target.checked ? [...p, row.id] : p.filter((x) => x !== row.id)))} aria-label={row.subject} data-testid={`sg-tick-${row.id}`} />
                  <span style={{ display: 'grid', gap: 6, minWidth: 0 }}>
                    <strong style={{ fontSize: 14 }}>{row.subject}</strong>
                    <What kind={kind.key} row={row} edits={edits[row.id] ?? {}} onEdit={(field, value) => setEdits((e) => ({ ...e, [row.id]: { ...(e[row.id] ?? {}), [field]: value } }))} />
                    {row.reason && <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{row.reason}</span>}
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <div className="sg-actions">
            {kind.can_approve && <Btn disabled={busy !== '' || picked.length === 0} onClick={() => void decide(true)} data-testid={`sg-approve-${kind.key}`}>{busy === 'decide' ? 'Saving…' : `Approve ${picked.length || ''}`.trim()}</Btn>}
            <Btn variant={kind.can_approve ? 'danger-outline' : 'secondary'} disabled={busy !== '' || picked.length === 0} onClick={() => void decide(false)} data-testid={`sg-reject-${kind.key}`}>
              {kind.can_approve ? 'Turn down' : 'Dismiss'}
            </Btn>
          </div>
        </>
      )}
    </Card>
  );
}

export default function SuggestionsPage() {
  const [kinds, setKinds] = useState<AiSuggestionKind[] | null>(null);
  const [noPhoto, setNoPhoto] = useState<NoPhotoDish[]>([]);
  const [ready, setReady] = useState(true);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');

  const load = useCallback(() => fetchAiSuggestions().then((r) => { setKinds(r.kinds); setReady(r.ready); setNoPhoto(r.no_photo ?? []); }).catch((e: Error) => setError(e.message)), []);
  useEffect(() => { void load(); }, [load]);

  if (error && !kinds) return <Card><p role="alert" style={{ color: 'var(--color-danger)', margin: 0 }}>{error}</p></Card>;
  if (!kinds) return <Card><p style={{ margin: 0, color: 'var(--color-text-muted)' }}>Loading…</p></Card>;

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <Card>
        <p style={{ margin: 0, fontSize: 14 }}>
          The assistant looks each night and lists what it would change. <strong>Nothing here has been changed.</strong> Tick what you agree with and press Approve; the rest can wait or be turned down.
        </p>
        {!ready && <p data-testid="sg-no-key" style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--color-text-secondary)' }}>No key yet, so it cannot look. Add one under <Link to="/purchasing/settings">Purchasing → Settings → Reading bills</Link>.</p>}
        {note && <p role="status" data-testid="sg-note" style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--color-success)' }}>{note}</p>}
      </Card>
      {kinds.length === 0 && <Card><p style={{ margin: 0, color: 'var(--color-text-muted)' }}>Your account has no suggestions to decide.</p></Card>}
      {kinds.map((k) => <KindCard key={k.key} kind={k} onChanged={(n) => { setNote(n); void load(); }} />)}
      {noPhoto.length > 0 && (
        <Card data-testid="sg-no-photo">
          <h3 style={{ margin: 0, fontSize: 16 }}>Dishes with no photo <span className="sg-count">{noPhoto.length}</span></h3>
          <p style={{ margin: '4px 0 8px', fontSize: 13, color: 'var(--color-text-secondary)' }}>The ones that sell most come first, so you know which to photograph next. A photo of your own food is always better than a made one.</p>
          <ul className="sg-rows">
            {noPhoto.map((d) => (
              <li key={d.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '8px 0', fontSize: 14 }}>
                <span style={{ minWidth: 0 }}>{d.name}</span>
                <span style={{ color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>{d.sold > 0 ? `${d.sold} sold in 30 days` : 'none sold lately'}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
