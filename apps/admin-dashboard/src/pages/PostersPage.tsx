import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Copy, Download, Pin, Trash2 } from 'lucide-react';
import { usePageTitle } from '../hooks/usePageTitle';
import { useCurrentUserPermissions } from '../hooks/usePermissions';
import { PageHeader, Btn } from '../components/SharedUI';
import {
  createPoster, deletePoster, deletePosterTemplate, downloadPosterZip, duplicatePoster, exportPoster,
  fetchPosterCatalog, fetchPosterLookups, fetchPosters, fetchPosterTemplates, lockPosterTemplate,
  previewPoster, savePosterTemplate, updatePoster,
  type PosterCheck, type PosterDraft, type PosterPiece, type PosterPurpose, type PosterRow, type PosterTemplateRow,
} from '../api';

const MOODS = ['dark', 'cream', 'rust', 'gold', 'photo'] as const;
const GROUPS = ['Offers', 'Dishes', 'Times', 'Ordering', 'Inside'];

function emptyDraft(purpose: PosterPurpose): PosterDraft {
  return {
    name: purpose.label,
    template_key: purpose.key,
    layout: purpose.layout,
    mood: 'dark',
    language: 'both',
    landscape: purpose.landscape,
    sizes: purpose.landscape ? ['A5'] : ['A4'],
    slots: { ...purpose.slots },
    bindings: {},
    place: null,
    take_down_on: null,
  };
}

export function PostersPage() {
  usePageTitle('Posters');
  const { can } = useCurrentUserPermissions();
  const manage = can('posters.manage');
  const [tab, setTab] = useState<'make' | 'mine' | 'templates'>('make');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PageHeader title="Posters" subtitle="Print-ready files for the shop, with the menu's prices and the brand." />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {([['make', 'Make a poster'], ['mine', 'My posters'], ['templates', 'Templates']] as const).map(([id, label]) => (
          <Btn key={id} variant={tab === id ? 'primary' : 'ghost'} onClick={() => setTab(id)}>{label}</Btn>
        ))}
      </div>
      {tab === 'make' && <MakeTab manage={manage} />}
      {tab === 'mine' && <MineTab onEdit={() => setTab('make')} />}
      {tab === 'templates' && <TemplatesTab manage={manage} />}
    </div>
  );
}

function MakeTab({ manage }: { manage: boolean }) {
  const [purposes, setPurposes] = useState<PosterPurpose[]>([]);
  const [sizes, setSizes] = useState<string[]>(['A5', 'A4', 'A3', 'A2']);
  const [places, setPlaces] = useState<string[]>([]);
  const [materials, setMaterials] = useState<{ key: string; label: string; white: boolean }[]>([]);
  const [lookups, setLookups] = useState<Awaited<ReturnType<typeof fetchPosterLookups>> | null>(null);
  const [step, setStep] = useState(1);
  const [draft, setDraft] = useState<PosterDraft | null>(null);
  const [savedId, setSavedId] = useState<number | null>(null);
  const [sheet, setSheet] = useState<{ w: number; h: number; hex_bg: string; pieces: PosterPiece[] } | null>(null);
  const [checks, setChecks] = useState<PosterCheck[]>([]);
  const [material, setMaterial] = useState('foam');
  const [imposition, setImposition] = useState('single');
  const [masks, setMasks] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  useEffect(() => {
    fetchPosterCatalog().then((c) => {
      setPurposes(c.purposes);
      setSizes(c.sizes);
      setPlaces(c.places);
      setMaterials(c.materials);
    }).catch(() => setNote('Could not load purposes.'));
    fetchPosterLookups().then(setLookups).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!draft || step < 3) return;
    const handle = setTimeout(() => {
      previewPoster({ ...draft, material, imposition }).then((res) => {
        setSheet(res.sheet);
        setChecks(res.preflight);
      }).catch(() => setNote('Preview failed.'));
    }, 250);
    return () => clearTimeout(handle);
  }, [draft, step, material, imposition]);

  const grouped = useMemo(() => GROUPS.map((g) => ({ g, rows: purposes.filter((p) => p.group === g) })), [purposes]);
  const purpose = purposes.find((p) => p.key === draft?.template_key);
  const reds = checks.filter((c) => c.level === 'red');

  async function save(): Promise<number | null> {
    if (!draft) return null;
    if (savedId) {
      await updatePoster(savedId, draft);
      return savedId;
    }
    const row = await createPoster(draft);
    setSavedId(row.id);
    return row.id;
  }

  async function download() {
    setBusy(true);
    setNote('');
    try {
      const id = await save();
      if (!id) return;
      const white = materials.find((m) => m.key === material)?.white ? 'under all printed areas' : 'none';
      const exp = await exportPoster(id, { material, imposition, masks, white, sizes: draft?.sizes, gloss: 'none' });
      if (exp.status === 'failed') {
        setNote(exp.error || 'Export failed.');
        return;
      }
      const blob = await downloadPosterZip(exp.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `poster-${id}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      setNote('ZIP downloaded. Send it to the shop by WhatsApp, Viber or email.');
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'Export failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'minmax(0, 1fr) minmax(220px, 320px)' }} className="poster-make">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {step === 1 && grouped.map(({ g, rows }) => (
          <section key={g}>
            <h2 style={{ fontSize: 14, margin: '8px 0', color: 'var(--color-text-secondary)' }}>{g}</h2>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {rows.map((p) => (
                <button key={p.key} type="button" onClick={() => {
                  if (p.external) { window.open(p.external, '_blank'); return; }
                  setDraft(emptyDraft(p));
                  setSavedId(null);
                  setStep(2);
                }} style={cardStyle}>
                  <strong>{p.label}</strong>
                  <span style={{ display: 'block', color: 'var(--color-text-muted)', fontSize: 12 }}>{p.layout.replace('_', ' ')} · used {p.used}</span>
                </button>
              ))}
            </div>
          </section>
        ))}

        {step >= 2 && draft && (
          <>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <Btn variant="ghost" onClick={() => setStep(1)}>Purpose</Btn>
              <span style={{ color: 'var(--color-text-secondary)' }}>{purpose?.label}</span>
            </div>
            <label style={labelStyle}>Name
              <input style={inputStyle} value={draft.name ?? ''} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            </label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {MOODS.map((m) => (
                <Btn key={m} variant={draft.mood === m ? 'primary' : 'ghost'} onClick={() => setDraft({ ...draft, mood: m })}>{m}</Btn>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {(['en', 'dv', 'both'] as const).map((l) => (
                <Btn key={l} variant={draft.language === l ? 'primary' : 'ghost'} onClick={() => setDraft({ ...draft, language: l })}>{l === 'both' ? 'Both' : l === 'en' ? 'English' : 'Dhivehi'}</Btn>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {sizes.map((s) => {
                const on = draft.sizes.includes(s);
                return <Btn key={s} variant={on ? 'primary' : 'ghost'} onClick={() => setDraft({ ...draft, sizes: on ? draft.sizes.filter((x) => x !== s) : [...draft.sizes, s] })}>{s}</Btn>;
              })}
              <Btn variant={draft.landscape ? 'primary' : 'ghost'} onClick={() => setDraft({ ...draft, landscape: !draft.landscape })}>Landscape</Btn>
            </div>
            {purpose?.bind === 'item' && lookups && (
              <Select label="Dish" value={draft.bindings.item_id ?? ''} onChange={(v) => setDraft({ ...draft, bindings: { ...draft.bindings, item_id: v ? Number(v) : null } })}
                options={lookups.items.map((i) => ({ value: i.id, label: `${i.name} · MVR ${i.price.price.toFixed(2)}${i.price.from ? ' from' : ''}` }))} />
            )}
            {purpose?.bind === 'promotion' && lookups && (
              <Select label="Offer" value={draft.bindings.promotion_id ?? ''} onChange={(v) => setDraft({ ...draft, bindings: { ...draft.bindings, promotion_id: v ? Number(v) : null } })}
                options={lookups.promotions.map((p) => ({ value: p.id, label: p.name + (p.code ? ` · ${p.code}` : '') }))} />
            )}
            {purpose?.bind === 'category' && lookups && (
              <Select label="Category" value={draft.bindings.category_id ?? ''} onChange={(v) => setDraft({ ...draft, bindings: { ...draft.bindings, category_id: v ? Number(v) : null } })}
                options={lookups.categories.map((c) => ({ value: c.id, label: c.name }))} />
            )}
            {purpose?.bind === 'table' && lookups && (
              <Select label="Table (blank = one card per table)" value={draft.bindings.table_id ?? ''} onChange={(v) => setDraft({ ...draft, bindings: { ...draft.bindings, table_id: v ? Number(v) : null } })}
                options={lookups.tables.map((t) => ({ value: t.id, label: t.name }))} />
            )}
            {(['headline', 'headline_dv', 'price', 'old_price', 'subhead', 'body', 'badge'] as const).map((key) => (
              <label key={key} style={labelStyle}>{key.replace('_', ' ')}
                <input style={inputStyle} value={draft.slots[key] ?? ''} onChange={(e) => setDraft({ ...draft, slots: { ...draft.slots, [key]: e.target.value } })} />
              </label>
            ))}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <label style={labelStyle}>Take down
                <input type="date" style={inputStyle} value={draft.take_down_on ?? ''} onChange={(e) => setDraft({ ...draft, take_down_on: e.target.value || null })} />
              </label>
              <Select label="Place" value={draft.place ?? ''} onChange={(v) => setDraft({ ...draft, place: v || null })} options={places.map((p) => ({ value: p, label: p }))} />
            </div>
            {step === 2 && <Btn onClick={() => setStep(3)}>Check and download</Btn>}
            {step === 3 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <Select label="Material" value={material} onChange={setMaterial} options={materials.map((m) => ({ value: m.key, label: m.label }))} />
                <Select label="On the sheet" value={imposition} onChange={setImposition} options={[
                  { value: 'single', label: 'One per page' },
                  { value: 'tent', label: 'Tent (two A5 on A4)' },
                  { value: '2up', label: '2-up' },
                  { value: '4up', label: '4-up' },
                ]} />
                <label style={{ display: 'flex', gap: 8, alignItems: 'center', minHeight: 44 }}>
                  <input type="checkbox" checked={masks} onChange={(e) => setMasks(e.target.checked)} /> White and gloss masks
                </label>
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {checks.filter((c) => c.level !== 'ok').map((c) => (
                    <li key={c.id + c.message} style={{ color: c.level === 'red' ? 'var(--color-danger)' : 'var(--color-warning)' }}>{c.message}</li>
                  ))}
                  {checks.every((c) => c.level === 'ok') && <li style={{ color: 'var(--color-success)' }}>All checks passed.</li>}
                </ul>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <Btn onClick={download} disabled={busy || reds.length > 0}><Download size={16} /> {busy ? 'Preparing…' : 'Download for print'}</Btn>
                  {manage && <Btn variant="ghost" onClick={async () => { await save(); if (draft) { await savePosterTemplate({ name: draft.name || 'Template', template_key: draft.template_key, layout: draft.layout, mood: draft.mood, language: draft.language, slots: draft.slots }); setNote('Saved as a template.'); } }}>Save as template</Btn>}
                </div>
                {note && <p style={{ color: 'var(--color-text-secondary)' }}>{note}</p>}
              </div>
            )}
          </>
        )}
      </div>
      <Preview sheet={sheet} />
      <style>{`@media (max-width: 800px) { .poster-make { grid-template-columns: 1fr !important; } }`}</style>
    </div>
  );
}

function Preview({ sheet }: { sheet: { w: number; h: number; hex_bg: string; pieces: PosterPiece[] } | null }) {
  if (!sheet) {
    return <aside style={{ color: 'var(--color-text-muted)', fontSize: 14 }}>The preview appears once a purpose is filled in. Screen colours follow the brand; the file uses the press mixes.</aside>;
  }
  const scale = 280 / sheet.w;
  return (
    <aside>
      <div style={{ width: sheet.w * scale, height: sheet.h * scale, position: 'relative', background: sheet.hex_bg, borderRadius: 4, overflow: 'hidden', margin: '0 auto' }}>
        {sheet.pieces.map((p, i) => (
          <div key={i} style={{
            position: 'absolute', left: p.x * scale, top: p.y * scale, width: p.w * scale, height: p.h * scale,
            background: p.type === 'rect' || p.type === 'photo' ? (p.hex ?? 'transparent') : p.type === 'qr' ? 'var(--color-bg)' : 'transparent',
            color: p.hex, fontSize: Math.max(8, p.h * scale * 0.7), lineHeight: 1.1, textAlign: (p.align as 'left' | 'center' | 'right') || 'left',
            textDecoration: p.strike ? 'line-through' : undefined, overflow: 'hidden',
            border: p.type === 'qr' ? '1px solid var(--color-text)' : undefined,
          }}>{p.type === 'text' ? p.text : p.type === 'qr' ? 'QR' : p.type === 'logo' ? '' : ''}</div>
        ))}
      </div>
    </aside>
  );
}

function MineTab({ onEdit }: { onEdit: () => void }) {
  const [rows, setRows] = useState<PosterRow[]>([]);
  const [down, setDown] = useState<PosterRow[]>([]);
  const load = () => fetchPosters().then((r) => { setRows(r.posters); setDown(r.should_be_down); }).catch(() => undefined);
  useEffect(() => { load(); }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {down.length > 0 && <p style={{ color: 'var(--color-warning)' }}>{down.length} should be down: {down.map((p) => p.name).join(', ')}</p>}
      {rows.length === 0 && <p style={{ color: 'var(--color-text-muted)' }}>No posters yet.</p>}
      {rows.map((p) => (
        <div key={p.id} style={{ ...cardStyle, display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
          <div>
            <strong>{p.pinned ? '★ ' : ''}{p.code} · {p.name}</strong>
            <div style={{ color: 'var(--color-text-muted)', fontSize: 12 }}>{p.state} · {(p.sizes ?? []).join(', ')}{p.place ? ` · ${p.place}` : ''}{p.take_down_on ? ` · down ${p.take_down_on}` : ''}{p.should_be_down ? ' · should be down' : ''}</div>
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            <Btn variant="ghost" onClick={() => updatePoster(p.id, { pinned: !p.pinned }).then(load)}><Pin size={14} /></Btn>
            <Btn variant="ghost" onClick={() => duplicatePoster(p.id).then(load)}><Copy size={14} /></Btn>
            <Btn variant="ghost" onClick={() => { const name = window.prompt('Name', p.name); if (name) updatePoster(p.id, { name }).then(load); }}>Rename</Btn>
            <Btn variant="ghost" onClick={() => updatePoster(p.id, { state: p.state === 'up' ? 'down' : 'up' }).then(load)}>{p.state === 'up' ? 'Mark down' : 'Mark up'}</Btn>
            <Btn variant="ghost" onClick={() => deletePoster(p.id).then(load)}><Trash2 size={14} /></Btn>
          </div>
        </div>
      ))}
      <Btn variant="ghost" onClick={onEdit}>Make a poster</Btn>
    </div>
  );
}

function TemplatesTab({ manage }: { manage: boolean }) {
  const [rows, setRows] = useState<PosterTemplateRow[]>([]);
  const load = () => fetchPosterTemplates().then(setRows).catch(() => undefined);
  useEffect(() => { load(); }, []);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {rows.length === 0 && <p style={{ color: 'var(--color-text-muted)' }}>No saved templates. Save one from Make a poster.</p>}
      {rows.map((t) => (
        <div key={t.id} style={{ ...cardStyle, display: 'flex', justifyContent: 'space-between', gap: 8 }}>
          <div><strong>{t.name}</strong><div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{t.template_key} · {t.mood}{t.locked ? ' · locked' : ''}</div></div>
          {manage && (
            <div style={{ display: 'flex', gap: 4 }}>
              <Btn variant="ghost" onClick={() => lockPosterTemplate(t.id, !t.locked).then(load)}>{t.locked ? 'Unlock' : 'Lock'}</Btn>
              <Btn variant="ghost" onClick={() => deletePosterTemplate(t.id).then(load)}>Delete</Btn>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function Select({ label, value, onChange, options }: { label: string; value: string | number; onChange: (v: string) => void; options: { value: string | number; label: string }[] }) {
  return (
    <label style={labelStyle}>{label}
      <select style={inputStyle} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">—</option>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

const cardStyle: CSSProperties = {
  textAlign: 'left', background: 'var(--color-surface)', color: 'var(--color-text)',
  border: '1px solid var(--color-border)', borderRadius: 10, padding: '10px 12px', minHeight: 44, cursor: 'pointer',
};
const labelStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: 'var(--color-text-secondary)' };
const inputStyle: CSSProperties = {
  minHeight: 44, borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-surface)',
  color: 'var(--color-text)', padding: '0 10px', fontSize: 15,
};
