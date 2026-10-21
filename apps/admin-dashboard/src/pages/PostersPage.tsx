import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Copy, Download, Monitor, Pencil, Pin, Send, Share2, Trash2 } from 'lucide-react';
import { usePageTitle } from '../hooks/usePageTitle';
import { useCurrentUserPermissions } from '../hooks/usePermissions';
import { PageHeader, Btn } from '../components/SharedUI';
import { SeeAlso } from '../components/SeeAlso';
import { ThemePicker } from '../components/posters/ThemePicker';
import { ThemedEditor } from '../components/posters/ThemedEditor';
import { KeepOutRings, ThemedPreview } from '../components/posters/ThemedPreview';
import {
  advancePosterOrder, approvePosterQuote, createPoster, deletePoster, deletePosterTemplate, downloadPosterZip, duplicatePoster, exportPoster, fetchPosterExport, uploadPosterPhoto,
  fetchPosterCatalog, fetchPosterLookups, fetchPosterOrders, fetchPosters, fetchPosterTemplates, fetchPosterTheme, fetchPrintShops, lockPosterTemplate,
  draftPosterSocial, previewPoster, quotePosterOrder, savePosterTemplate, savePrintShop, sendPosterToShop, sendPosterToTv, setPosterHomeBanner, setPosterProofApproval, slotText, updatePoster,
  type PosterCheck, type PosterDraft, type PosterOrderRow, type PosterPurpose, type PosterRow, type PosterSheet, type PosterTemplateRow, type PosterTheme, type PosterThemeCatalog, type PosterThemeSummary, type PrintShop,
} from '../api';
import { inputFont } from '../utils/cssVars';

const MOODS = ['dark', 'cream', 'rust', 'gold', 'photo'] as const;
const GROUPS = ['Offers', 'Dishes', 'Times', 'Ordering', 'Inside'];
/** The purpose and layout of a poster drawn on a template (PosterPurposes::THEMED). */
const THEMED = 'themed';
const NO_THEMES: PosterThemeCatalog = { categories: [], styles: {}, sizes: {}, font_urls: {}, themes: [] };

/** A poster or a saved template handed to the editor from another tab. */
type Start = { kind: 'poster'; row: PosterRow } | { kind: 'template'; row: PosterTemplateRow } | null;

function emptyDraft(purpose: PosterPurpose): PosterDraft {
  return {
    name: purpose.label,
    template_key: purpose.key,
    layout: purpose.layout,
    theme: null,
    mood: 'dark',
    language: 'both',
    landscape: purpose.landscape,
    sizes: purpose.key === 'menu_board' ? ['A2'] : (purpose.landscape ? ['A5'] : ['A4']),
    slots: { ...purpose.slots },
    bindings: {},
    place: null,
    take_down_on: null,
  };
}

function themedDraft(theme: PosterThemeSummary): PosterDraft {
  return {
    name: theme.title,
    template_key: THEMED,
    layout: THEMED,
    theme: theme.key,
    mood: 'dark',
    language: 'en',
    landscape: false,
    sizes: ['A4'],
    slots: {},
    bindings: {},
    place: null,
    take_down_on: null,
  };
}

export function PostersPage() {
  usePageTitle('Posters');
  const { can } = useCurrentUserPermissions();
  const manage = can('posters.manage');
  const [tab, setTab] = useState<'make' | 'mine' | 'templates' | 'shops'>('make');
  const [start, setStart] = useState<Start>(null);
  const [startKey, setStartKey] = useState(0);
  const open = (next: Start) => { setStart(next); setStartKey((k) => k + 1); setTab('make'); };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PageHeader title="Posters" subtitle="Print-ready files for the shop, with the menu's prices and the brand." />
      {can('labels.print') || can('labels.manage') ? (
        <SeeAlso to="/labels" label="Labels" testId="posters-labels-link">Stickers for packs and boxes are made under</SeeAlso>
      ) : null}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {([['make', 'Make a poster'], ['mine', 'My posters'], ['templates', 'Templates'], ['shops', 'Print shops']] as const).map(([id, label]) => (
          <Btn key={id} variant={tab === id ? 'primary' : 'ghost'} onClick={() => setTab(id)}>{label}</Btn>
        ))}
      </div>
      {tab === 'make' && <MakeTab manage={manage} start={start} startKey={startKey} />}
      {tab === 'mine' && <MineTab onEdit={(row) => open({ kind: 'poster', row })} onMake={() => open(null)} />}
      {tab === 'templates' && <TemplatesTab manage={manage} onUse={(row) => open({ kind: 'template', row })} />}
      {tab === 'shops' && <ShopsTab manage={manage} />}
    </div>
  );
}

function MakeTab({ manage, start, startKey }: { manage: boolean; start: Start; startKey: number }) {
  const [purposes, setPurposes] = useState<PosterPurpose[]>([]);
  const [themes, setThemes] = useState<PosterThemeCatalog | null>(null);
  const [theme, setTheme] = useState<PosterTheme | null>(null);
  const [classic, setClassic] = useState(false);
  const [sizes, setSizes] = useState<string[]>(['A5', 'A4', 'A3', 'A2']);
  const [places, setPlaces] = useState<string[]>([]);
  const [materials, setMaterials] = useState<{ key: string; label: string; white: boolean; mirror?: boolean }[]>([]);
  const [shops, setShops] = useState<PrintShop[]>([]);
  const [shopId, setShopId] = useState<number | ''>('');
  const [gloss, setGloss] = useState('none');
  const [lookups, setLookups] = useState<Awaited<ReturnType<typeof fetchPosterLookups>> | null>(null);
  const [step, setStep] = useState(1);
  const [draft, setDraft] = useState<PosterDraft | null>(null);
  const [savedId, setSavedId] = useState<number | null>(null);
  const [sheet, setSheet] = useState<PosterSheet | null>(null);
  const [checks, setChecks] = useState<PosterCheck[]>([]);
  const [material, setMaterial] = useState('foam');
  const [imposition, setImposition] = useState('single');
  const [masks, setMasks] = useState(false);
  const [mounting, setMounting] = useState('none');
  const [photoSource, setPhotoSource] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  useEffect(() => {
    fetchPosterCatalog().then((c) => {
      setPurposes(c.purposes);
      setSizes(c.sizes);
      setPlaces(c.places);
      setMaterials(c.materials);
      setThemes(c.themes ?? NO_THEMES);
    }).catch(() => setNote('Could not load purposes.'));
    fetchPosterLookups().then(setLookups).catch(() => undefined);
    fetchPrintShops().then((r) => setShops(r.shops)).catch(() => undefined);
  }, []);

  function loadTheme(key: string | null | undefined) {
    setTheme(null);
    if (!key) return;
    fetchPosterTheme(key).then(setTheme).catch(() => setNote('Could not load the template.'));
  }

  // A poster from My posters or a saved template opens in the editor as it was.
  useEffect(() => {
    if (!start) return;
    if (start.kind === 'poster') {
      const p = start.row;
      setDraft({
        name: p.name, template_key: p.template_key, layout: p.layout, theme: p.theme ?? null, mood: p.mood, language: p.language,
        landscape: p.landscape, sizes: p.sizes?.length ? p.sizes : ['A4'], slots: p.slots ?? {}, bindings: p.bindings ?? {},
        place: p.place ?? null, take_down_on: p.take_down_on ?? null,
      });
      setSavedId(p.id);
      loadTheme(p.theme);
    } else {
      const t = start.row;
      setDraft({
        name: t.name, template_key: t.template_key, layout: t.layout, theme: t.theme ?? null, mood: t.mood,
        language: (t.language === 'en' || t.language === 'dv' || t.language === 'both') ? t.language : 'both',
        landscape: false, sizes: ['A4'], slots: t.slots ?? {}, bindings: {}, place: null, take_down_on: null,
      });
      setSavedId(null);
      loadTheme(t.theme);
    }
    setNote('');
    setStep(2);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startKey]);

  useEffect(() => {
    if (!draft || step < 3) return;
    const handle = setTimeout(() => {
      const shop = shops.find((s) => s.id === shopId);
      previewPoster({
        ...draft, material, imposition, mounting,
        layers: shop?.print_prefs.layers, white_name: shop?.print_prefs.white_name, gloss_name: shop?.print_prefs.gloss_name, gloss,
      }).then((res) => {
        setSheet(res.sheet);
        setChecks(res.preflight);
        setPhotoSource(typeof res.content.photo_source === 'string' ? res.content.photo_source : null);
      }).catch(() => setNote('Preview failed.'));
    }, 250);
    return () => clearTimeout(handle);
  }, [draft, step, material, imposition, mounting, shopId, shops, gloss]);

  // A template poster is previewed from step 2, since its editor shows what each slot prints.
  useEffect(() => {
    if (!draft?.theme || step !== 2) return;
    const handle = setTimeout(() => {
      previewPoster({ ...draft, material, imposition, mounting })
        .then((res) => { setSheet(res.sheet); setChecks(res.preflight); })
        .catch(() => setNote('Preview failed.'));
    }, 250);
    return () => clearTimeout(handle);
  }, [draft, step, material, imposition, mounting]);

  const grouped = useMemo(() => GROUPS.map((g) => ({ g, rows: purposes.filter((p) => p.group === g) })), [purposes]);
  const purpose = purposes.find((p) => p.key === draft?.template_key);
  const reds = checks.filter((c) => c.level === 'red');
  const themed = Boolean(draft?.theme);
  // A4 and A5 templates have no stand-off corners (docs/POSTER_THEMES_HANDOFF.md § 1).
  const smallTheme = themed && (sheet?.theme ? sheet.theme.variant === 'small' : ['A4', 'A5'].includes(draft?.sizes[0] ?? 'A4'));
  useEffect(() => {
    if (smallTheme && (mounting === 'standoffs' || mounting === 'eyelets')) setMounting('none');
  }, [smallTheme, mounting]);
  const assetOrigin = useMemo(() => {
    const url = themes?.font_urls?.anton;
    try { return url ? new URL(url).origin : ''; } catch { return ''; }
  }, [themes]);

  function pickTheme(summary: PosterThemeSummary) {
    setNote('');
    setSavedId(null);
    setSheet(null);
    setDraft(themedDraft(summary));
    loadTheme(summary.key);
    setStep(2);
  }

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

  function job() {
    const mat = materials.find((m) => m.key === material);
    const shop = shops.find((s) => s.id === shopId);
    return {
      material, imposition, masks, gloss, sizes: draft?.sizes,
      white: mat?.white ? 'under all printed areas' : 'none',
      mirror: mat?.mirror ?? false,
      layers: shop?.print_prefs.layers,
      white_name: shop?.print_prefs.white_name,
      gloss_name: shop?.print_prefs.gloss_name,
      supplier_id: shopId || undefined,
      mounting,
    };
  }

  async function download() {
    setBusy(true);
    setNote('');
    try {
      const id = await save();
      if (!id) return;
      // The file is made on the queue: wait for it, then download (POSTER_PLAN § 12.5).
      setNote('Preparing your file…');
      let exp = await exportPoster(id, job());
      const started = Date.now();
      while (exp.status === 'queued') {
        if (Date.now() - started > 15 * 60_000) {
          setNote('The file is still queued. Try Download again later; the server may need its queue worker restarted.');
          return;
        }
        if (Date.now() - started > 3 * 60_000) setNote('Taking longer than usual: the file is queued. It downloads here once it is ready.');
        await new Promise((r) => setTimeout(r, 2000));
        exp = await fetchPosterExport(exp.id);
      }
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

  async function send() {
    setBusy(true);
    setNote('');
    try {
      const id = await save();
      if (!id || shopId === '') return;
      const order = await sendPosterToShop(id, job());
      setNote(order.proof_url
        ? `Waiting for approval. Open this on your phone: ${order.proof_url}`
        : order.state === 'sent'
          ? `Sent to ${order.shop ?? 'the shop'}.`
          : order.file === 'queued'
            ? `Preparing the print file. ${order.shop ?? 'The shop'} is emailed once it is ready, or you get a link to approve it first when proof approval is on. My posters shows the order.`
            : `The order is ${order.state.replace(/_/g, ' ')}. ${order.file === 'failed' ? (order.file_error ?? 'The print file failed.') : 'See My posters for its notes.'}`);
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'Could not send.');
    } finally {
      setBusy(false);
    }
  }

  async function saveDraft() {
    setBusy(true);
    setNote('');
    try {
      const id = await save();
      if (id) setNote('Saved. Find it under My posters.');
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'Could not save.');
    } finally {
      setBusy(false);
    }
  }

  const mountingOptions = [
    { value: 'none', label: 'None (leans or sits in a stand)' },
    ...(smallTheme ? [] : [
      { value: 'standoffs', label: 'Stand-offs at the corners' },
      { value: 'eyelets', label: 'Eyelets at the corners' },
    ]),
    { value: 'tape', label: 'Tape on the back' },
  ];

  return (
    <div className="poster-make">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {step === 1 && (
          <>
            <ThemePicker catalog={themes} onPick={pickTheme} classic={classic} onClassic={() => setClassic((c) => !c)} />
            {classic && grouped.map(({ g, rows }) => (
              <section key={g}>
                <h2 style={{ fontSize: 14, margin: '8px 0', color: 'var(--color-text-secondary)' }}>{g}</h2>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {rows.map((p) => (
                    <button key={p.key} type="button" onClick={() => {
                      if (p.external) { window.open(p.external, '_blank'); return; }
                      setDraft(emptyDraft(p));
                      setTheme(null);
                      setSheet(null);
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
          </>
        )}

        {step >= 2 && draft && (
          <>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <Btn variant="ghost" onClick={() => setStep(1)}>{themed ? 'Template' : 'Purpose'}</Btn>
              <span style={{ color: 'var(--color-text-secondary)' }} data-testid="poster-editor-title">
                {themed ? `${theme?.id ?? ''} ${theme?.title ?? draft.theme}`.trim() : purpose?.label}
                {savedId ? ` · editing P${String(savedId).padStart(4, '0')}` : ''}
              </span>
            </div>
            <label style={labelStyle}>Name
              <input style={inputFont(inputStyle)} value={draft.name ?? ''} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            </label>

            {themed ? (
              theme ? (
                <ThemedEditor draft={draft} theme={theme} lookups={lookups} sheet={sheet} sizes={sizes} onChange={setDraft} />
              ) : <p style={{ color: 'var(--color-text-muted)' }}>Loading the template…</p>
            ) : (
              <>
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
                {(Array.from(new Set([...Object.keys(purpose?.slots ?? {}), 'headline', 'headline_dv', 'price', 'old_price', 'subhead', 'body', 'badge']))).map((key) => (
                  <label key={key} style={labelStyle}>{key.replace('_', ' ')}
                    <input style={inputFont(inputStyle)} value={slotText(draft.slots, key)} onChange={(e) => setDraft({ ...draft, slots: { ...draft.slots, [key]: e.target.value } })} />
                  </label>
                ))}
                <PosterPhotoField draft={draft} source={photoSource} onChange={(path) => setDraft({ ...draft, slots: { ...draft.slots, photo_path: path } })} />
              </>
            )}

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <label style={labelStyle}>Take down
                <input type="date" style={inputFont(inputStyle)} value={draft.take_down_on ?? ''} onChange={(e) => setDraft({ ...draft, take_down_on: e.target.value || null })} />
              </label>
              <Select label="Place" value={draft.place ?? ''} onChange={(v) => setDraft({ ...draft, place: v || null })} options={places.map((p) => ({ value: p, label: p }))} />
            </div>
            {step === 2 && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <Btn onClick={() => setStep(3)}>Check and download</Btn>
                <Btn variant="ghost" onClick={saveDraft} disabled={busy}>{savedId ? 'Save changes' : 'Save for later'}</Btn>
                {note && <span style={{ color: 'var(--color-text-secondary)', fontSize: 13 }}>{note}</span>}
              </div>
            )}
            {step === 3 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <Select label="Material" value={material} onChange={setMaterial} options={materials.map((m) => ({ value: m.key, label: m.label }))} />
                <Select label="On the sheet" value={imposition} onChange={setImposition} options={[
                  { value: 'single', label: 'One per page' },
                  { value: 'tent', label: 'Tent (two A5 on A4)' },
                  { value: '2up', label: '2-up' },
                  { value: '4up', label: '4-up' },
                ]} />
                <Select label="Mounting" value={mounting} onChange={setMounting} options={mountingOptions} />
                {smallTheme && <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Counter and table cards have no stand-off corners; print A2 or A3 for a wall.</span>}
                <Select label="Gloss" value={gloss} onChange={setGloss} options={[{ value: 'none', label: 'No gloss' }, { value: 'logo and price', label: 'Gloss on logo and large type' }]} />
                <Select label="Print shop" value={shopId} onChange={(v) => setShopId(v ? Number(v) : '')} options={shops.map((s) => ({ value: s.id, label: s.name }))} />
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
                  <Btn variant="ghost" onClick={send} disabled={busy || reds.length > 0 || shopId === ''}><Send size={16} /> Send to print shop</Btn>
                  {manage && <Btn variant="ghost" onClick={async () => { await save(); if (draft) { await savePosterTemplate({ name: draft.name || 'Template', template_key: draft.template_key, layout: draft.layout, theme: draft.theme ?? null, mood: draft.mood, language: draft.language, slots: draft.slots }); setNote('Saved as a template.'); } }}>Save as template</Btn>}
                </div>
                {note && <p style={{ color: 'var(--color-text-secondary)' }}>{note}</p>}
              </div>
            )}
          </>
        )}
      </div>
      {sheet?.theme
        ? <ThemedPreview sheet={sheet} gloss={gloss !== 'none'} keepOut={mounting === 'standoffs' || mounting === 'eyelets' ? keepOutMm(draft?.sizes[0]) : 0} fontUrls={themes?.font_urls} assetOrigin={assetOrigin} />
        : <Preview sheet={step >= 3 ? sheet : null} gloss={gloss !== 'none'} keepOut={mounting === 'standoffs' || mounting === 'eyelets' ? keepOutMm(draft?.sizes[0]) : 0} />}
    </div>
  );
}

/** The corner circle for stand-offs and eyelets, mm across (PaperSize::keepOutMm). */
const keepOutMm = (size?: string) => (size === 'A2' ? 20 : 15);

const PHOTO_SOURCE_WORDS: Record<string, string> = {
  upload: 'Using the poster photo.',
  master: "Using the dish's full-size photo.",
  crop: "Only the dish's small website photo: upload a poster photo for print.",
};

/** A photo kept for posters only (up to 4800 px), sharper than the menu's, and which photo prints now. */
function PosterPhotoField({ draft, source, onChange }: { draft: PosterDraft; source: string | null; onChange: (path: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const has = slotText(draft.slots, 'photo_path') !== '';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={labelStyle}>Poster photo (optional, sharper than the menu photo)
        <input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} style={inputFont(inputStyle)} onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          setBusy(true); setError('');
          try { onChange((await uploadPosterPhoto(file)).photo_path); } catch (err) { setError(err instanceof Error ? err.message : 'Upload failed.'); } finally { setBusy(false); }
        }} />
      </label>
      <span style={{ fontSize: 13, color: source === 'crop' ? 'var(--color-danger)' : 'var(--color-text-secondary)' }}>
        {busy ? 'Uploading…' : source ? PHOTO_SOURCE_WORDS[source] : ''}
        {has && !busy && <> <button type="button" onClick={() => onChange('')} style={{ background: 'none', border: 'none', padding: 0, color: 'var(--color-primary)', cursor: 'pointer', fontSize: 13 }}>Use the dish photo instead</button></>}
      </span>
      {error && <span role="alert" style={{ fontSize: 13, color: 'var(--color-danger)' }}>{error}</span>}
    </div>
  );
}

function Preview({ sheet, gloss, keepOut = 0 }: { sheet: PosterSheet | null; gloss: boolean; keepOut?: number }) {
  if (!sheet) {
    return <aside style={{ color: 'var(--color-text-muted)', fontSize: 14 }}>The preview appears once a purpose is filled in. Screen colours follow the brand; the file uses the press mixes.</aside>;
  }
  const scale = 280 / sheet.w;
  return (
    <aside>
      <div style={{ width: sheet.w * scale, height: sheet.h * scale, position: 'relative', background: sheet.hex_bg, borderRadius: 4, overflow: 'hidden', margin: '0 auto' }}>
        {gloss && <div style={{ position: 'absolute', inset: 0, background: 'repeating-linear-gradient(135deg, transparent, transparent 6px, var(--color-text) 6px, var(--color-text) 7px)', opacity: 0.28, pointerEvents: 'none' }} />}
        <KeepOutRings w={sheet.w} h={sheet.h} scale={scale} keepOut={keepOut} />
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

function MineTab({ onEdit, onMake }: { onEdit: (row: PosterRow) => void; onMake: () => void }) {
  const [rows, setRows] = useState<PosterRow[]>([]);
  const [down, setDown] = useState<PosterRow[]>([]);
  const [note, setNote] = useState('');
  const [shares, setShares] = useState<Record<number, { whatsapp: string; viber: string }>>({});
  const load = () => fetchPosters().then((r) => { setRows(r.posters); setDown(r.should_be_down); }).catch(() => undefined);
  useEffect(() => { load(); }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {down.length > 0 && <p style={{ color: 'var(--color-warning)' }}>{down.length} should be down: {down.map((p) => p.name).join(', ')}</p>}
      {note && <p style={{ color: 'var(--color-text-secondary)' }}>{note}</p>}
      {rows.length === 0 && <p style={{ color: 'var(--color-text-muted)' }}>No posters yet.</p>}
      {rows.map((p) => (
        <div key={p.id} style={{ ...cardStyle, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <div>
              <strong>{p.pinned ? '★ ' : ''}{p.code} · {p.name}</strong>
              <div style={{ color: 'var(--color-text-muted)', fontSize: 12 }}>{p.state} · {(p.sizes ?? []).join(', ')}{p.theme ? ` · template ${p.theme}` : ''}{p.place ? ` · ${p.place}` : ''}{p.take_down_on ? ` · down ${p.take_down_on}` : ''}{p.should_be_down ? ' · should be down' : ''}{typeof p.scans === 'number' ? ` · ${p.scans} scans` : ''}{p.banner ? ' · home banner' : ''}{p.stale ? ` · out of date${p.diff ? `: ${p.diff}` : ''}` : ''}{p.order ? ` · ${p.order.shop ?? 'shop'} ${p.order.state.replace(/_/g, ' ')}` : ''}</div>
            </div>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              <Btn variant="ghost" onClick={() => onEdit(p)} aria-label={`Edit ${p.name}`}><Pencil size={14} /> Edit</Btn>
              <Btn variant="ghost" onClick={() => updatePoster(p.id, { pinned: !p.pinned }).then(load)}><Pin size={14} /></Btn>
              <Btn variant="ghost" onClick={() => duplicatePoster(p.id).then(load)}><Copy size={14} /></Btn>
              <Btn variant="ghost" onClick={() => { const name = window.prompt('Name', p.name); if (name) updatePoster(p.id, { name }).then(load); }}>Rename</Btn>
              <Btn variant="ghost" onClick={() => updatePoster(p.id, { state: p.state === 'up' ? 'down' : 'up' }).then(load)}>{p.state === 'up' ? 'Mark down' : 'Mark up'}</Btn>
              <Btn variant="ghost" onClick={() => deletePoster(p.id).then(load)}><Trash2 size={14} /></Btn>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            <Btn variant="secondary" onClick={() => sendPosterToTv(p.id).then((r) => setNote(`${p.name} is on the TV${r.date_end ? ` until ${r.date_end}` : ''}.`)).catch((e) => setNote(e instanceof Error ? e.message : 'Could not send it to the TV.'))}><Monitor size={14} /> TV</Btn>
            <Btn variant="secondary" onClick={() => draftPosterSocial(p.id).then((r) => { setShares((s) => ({ ...s, [p.id]: { whatsapp: r.whatsapp, viber: r.viber } })); setNote(`${p.name} is a social draft${r.best_time ? `, best time ${r.best_time}` : ''}.`); }).catch((e) => setNote(e instanceof Error ? e.message : 'Could not draft the post.'))}><Share2 size={14} /> Instagram</Btn>
            <Btn variant="secondary" onClick={() => setPosterHomeBanner(p.id, !p.banner).then(() => load()).catch((e) => setNote(e instanceof Error ? e.message : 'Could not update the home banner.'))}>{p.banner ? 'Take off home' : 'Home banner'}</Btn>
            {shares[p.id] && <a href={shares[p.id].whatsapp} style={{ alignSelf: 'center', minHeight: 44, display: 'inline-flex', alignItems: 'center' }}>WhatsApp</a>}
            {shares[p.id] && <a href={shares[p.id].viber} style={{ alignSelf: 'center', minHeight: 44, display: 'inline-flex', alignItems: 'center' }}>Viber</a>}
          </div>
        </div>
      ))}
      <Btn variant="ghost" onClick={onMake}>Make a poster</Btn>
    </div>
  );
}

function ShopsTab({ manage }: { manage: boolean }) {
  const [shops, setShops] = useState<PrintShop[]>([]);
  const [proof, setProof] = useState(false);
  const [orders, setOrders] = useState<PosterOrderRow[]>([]);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [layers, setLayers] = useState<'masks' | 'spots'>('masks');
  const [note, setNote] = useState('');
  const load = () => {
    fetchPrintShops().then((r) => { setShops(r.shops); setProof(r.proof_approval); }).catch(() => undefined);
    fetchPosterOrders().then((r) => setOrders(r.orders)).catch(() => undefined);
  };
  useEffect(() => { load(); }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', minHeight: 44 }}>
        <input type="checkbox" checked={proof} disabled={!manage} onChange={(e) => { setProof(e.target.checked); setPosterProofApproval(e.target.checked).catch(() => setNote('Could not save the proof switch.')); }} />
        Approve a proof on your phone before the file is emailed
      </label>
      {manage && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'end' }}>
          <label style={labelStyle}>Shop name
            <input style={inputFont(inputStyle)} value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label style={labelStyle}>Email
            <input style={inputFont(inputStyle)} value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <Select label="Layers" value={layers} onChange={(v) => setLayers(v === 'spots' ? 'spots' : 'masks')} options={[{ value: 'masks', label: 'Mask PDFs' }, { value: 'spots', label: 'Spot layers in the file' }]} />
          <Btn onClick={() => savePrintShop({ name, email, print_prefs: { layers, white_name: 'White', gloss_name: 'Spot UV', bleed_mm: 3, crop_marks: false } }).then(() => { setName(''); setEmail(''); load(); }).catch((e) => setNote(e instanceof Error ? e.message : 'Could not save the shop.'))}>Add shop</Btn>
        </div>
      )}
      {shops.map((s) => (
        <div key={s.id} style={cardStyle}>
          <strong>{s.name}</strong>
          <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{s.email || 'No email'} · {s.print_prefs.layers === 'spots' ? `spots ${s.print_prefs.white_name} / ${s.print_prefs.gloss_name}` : 'mask PDFs'}</div>
        </div>
      ))}
      {orders.length > 0 && <h3 style={{ margin: '8px 0 0', fontSize: 16 }}>Orders</h3>}
      {orders.map((o) => <OrderRow key={o.id} order={o} manage={manage} onChange={load} />)}
      {note && <p style={{ color: 'var(--color-danger)' }}>{note}</p>}
    </div>
  );
}

function OrderRow({ order, manage, onChange }: { order: PosterOrderRow; manage: boolean; onChange: () => void }) {
  const [quote, setQuote] = useState('');
  const next = order.state === 'quote_approved' ? 'received' : order.state === 'received' ? 'up' : order.state === 'up' ? 'down' : null;
  return (
    <div style={{ ...cardStyle, cursor: 'default' }}>
      <strong>{order.code} · {order.poster_name}</strong>
      <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{order.shop} · {order.state.replace(/_/g, ' ')}{order.quote_mvr ? ` · MVR ${order.quote_mvr}` : ''}</div>
      {manage && order.state === 'sent' && (
        <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
          <input style={inputFont({ ...inputStyle, maxWidth: 140 })} inputMode="decimal" placeholder="Quote MVR" value={quote} onChange={(e) => setQuote(e.target.value)} />
          <Btn variant="ghost" onClick={() => quotePosterOrder(order.id, Number(quote)).then(onChange)}>Save quote</Btn>
          <Btn variant="ghost" onClick={() => approvePosterQuote(order.id).then(onChange)}>Approve quote</Btn>
        </div>
      )}
      {next && <Btn variant="ghost" onClick={() => advancePosterOrder(order.id, next).then(onChange)}>{next === 'received' ? 'Mark received' : next === 'up' ? 'Mark up' : 'Taken down'}</Btn>}
    </div>
  );
}

function TemplatesTab({ manage, onUse }: { manage: boolean; onUse: (row: PosterTemplateRow) => void }) {
  const [rows, setRows] = useState<PosterTemplateRow[]>([]);
  const load = () => fetchPosterTemplates().then(setRows).catch(() => undefined);
  useEffect(() => { load(); }, []);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {rows.length === 0 && <p style={{ color: 'var(--color-text-muted)' }}>No saved templates. Save one from Make a poster.</p>}
      {rows.map((t) => (
        <div key={t.id} style={{ ...cardStyle, display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
          <div><strong>{t.name}</strong><div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{t.theme ? `template ${t.theme}` : `${t.template_key} · ${t.mood}`}{t.locked ? ' · locked' : ''}</div></div>
          <div style={{ display: 'flex', gap: 4 }}>
            <Btn variant="secondary" onClick={() => onUse(t)} aria-label={`Use ${t.name}`}>Use</Btn>
            {manage && <Btn variant="ghost" onClick={() => lockPosterTemplate(t.id, !t.locked).then(load)}>{t.locked ? 'Unlock' : 'Lock'}</Btn>}
            {manage && <Btn variant="ghost" onClick={() => deletePosterTemplate(t.id).then(load)}>Delete</Btn>}
          </div>
        </div>
      ))}
    </div>
  );
}

function Select({ label, value, onChange, options }: { label: string; value: string | number; onChange: (v: string) => void; options: { value: string | number; label: string }[] }) {
  return (
    <label style={labelStyle}>{label}
      <select style={inputFont(inputStyle)} value={value} onChange={(e) => onChange(e.target.value)}>
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
