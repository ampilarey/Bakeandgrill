import { useImperativeHandle, useMemo, useRef, useState, type Ref } from 'react';
import { Btn, TableSkeleton } from './SharedUI';
import { BrandThumb } from './BrandPhotos';
import { ScanSheet } from './ScanSheet';
import { brandKey, packNameConflict } from '../api/operations';

/*
 * Brands, and under each one the packs it comes in and what each usually costs.
 *
 * Owner, 2026-09-12: "Each brand should have its default packaging, price,
 * photo options. More than one brand option." And: "New items and edit.
 * Should be same."
 *
 * Before this the item form had a Packs section where you typed a brand on
 * every pack, and a separate Brands section where you typed the brand again
 * to give it a picture — in one order on Add and the other on Edit. The
 * owner's picture of it is brand-first: Amul is a thing, and Amul has a tin,
 * a price for the tin, and a photo of the tin. So that is the shape here.
 * One card per brand; its packs inside; "Any brand" at the bottom for the
 * packs that do not depend on whose it is.
 *
 * The same component draws both forms. What differs is where the changes go:
 * an item being edited saves each change straight to the server, an item
 * being created holds them until Create returns an id. That difference is the
 * `store` the parent passes in; nothing on screen knows which it got.
 */

/** One pack, as the editor sees it. `key` is stable; `id` exists once saved. */
export type BrandPackRow = {
  key: string;
  id?: number;
  /** Whose box. Empty means the pack belongs to the item, whichever brand is bought. */
  brand: string;
  name: string;
  baseUnits: number;
  /** What one pack usually costs, or null when nobody has priced it. */
  price: number | null;
  pricedAt: string | null;
  barcode: string;
};

/** A brand written down against the item, with or without a picture. */
export type BrandRow = {
  key: string;
  id?: number;
  brand: string;
  photoUrl: string | null;
};

export interface PackInput {
  brand: string;
  name: string;
  baseUnits: number;
  price: number | null;
  barcode: string;
  /** Yes, resize the pack that already has this name. */
  replace?: boolean;
}

export interface PackChanges {
  name: string;
  baseUnits: number;
  price: number | null;
  barcode: string;
}

/**
 * Where the editor's changes go. Every method may throw; the editor shows
 * the message. `addPack` may throw the server's pack-name conflict (a body
 * with `conflict: 'pack_name_in_use'`), which the editor turns into the
 * "correction or second size?" question.
 */
export interface BrandPackStore {
  addBrand(brand: string, file: File | null): Promise<void>;
  setBrandPhoto(brand: string, file: File): Promise<void>;
  removeBrand(target: { brand: string; row: BrandRow | null; packs: BrandPackRow[] }): Promise<void>;
  addPack(input: PackInput): Promise<void>;
  updatePack(pack: BrandPackRow, changes: PackChanges): Promise<void>;
  removePack(pack: BrandPackRow): Promise<void>;
}

export interface BrandPacksHandle {
  /**
   * Take whatever is half-typed — a brand in the brand box, a pack in the
   * pack boxes — as meant, and add it. Owner, 2026-09-09: "i dont see the
   * previoulsly added pack size": the boxes look like part of the form, so
   * filling them and pressing the form's own save is the obvious move, and
   * it used to drop the pack on the floor.
   *
   * 'stuck' means something is typed that could not be added — the editor is
   * showing why — and the form should not close over it.
   */
  flush(): Promise<'done' | 'stuck'>;
}

const S = {
  input: {
    width: '100%', padding: '8px 12px', border: '1.5px solid var(--color-border)', borderRadius: 10,
    fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box' as const,
    background: 'var(--color-surface)', color: 'var(--color-text)',
  },
  select: {
    padding: '8px 12px', border: '1px solid var(--color-border)', borderRadius: 8, fontSize: 13,
    fontFamily: 'inherit', background: 'var(--color-surface)', color: 'var(--color-text)',
  },
  muted: { fontSize: 12, color: 'var(--color-text-muted)' },
  secondary: { fontSize: 13, color: 'var(--color-text-secondary)' },
  card: {
    border: '1px solid var(--color-border)', borderRadius: 10,
    padding: '10px 12px', background: 'var(--color-surface)',
  },
};

type Group = { key: string; brand: string; row: BrandRow | null; packs: BrandPackRow[] };

/** 500.000000 reads as 500, 0.5 as 0.5. */
const tidy = (n: number) => String(Number(n.toFixed(6)));

const blankPackForm = { name: '', qty: '', ofKey: '', price: '', barcode: '' };

export function BrandPacks({
  ref, testId, unit, brands, packs, knownBrands = [], loading = false, error = '',
  canManage, savesImmediately, store,
}: {
  ref?: Ref<BrandPacksHandle>;
  testId?: string;
  /** What stock is counted in — the number every pack is measured against. */
  unit: string;
  brands: BrandRow[];
  packs: BrandPackRow[];
  /** Brands bought before, offered as suggestions and spelling. */
  knownBrands?: string[];
  loading?: boolean;
  /** A load failure from the parent, shown above everything else. */
  error?: string;
  canManage: boolean;
  /** Edit saves each change as it is made; Add holds them for Create. Only the wording differs. */
  savesImmediately: boolean;
  store: BrandPackStore;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  // ── Adding a brand ──────────────────────────────────────────────────────
  const [brandForm, setBrandForm] = useState<{ brand: string; file: File | null }>({ brand: '', file: null });
  const brandFileRef = useRef<HTMLInputElement>(null);

  // ── A picture for a brand already on the list ───────────────────────────
  const photoFileRef = useRef<HTMLInputElement>(null);
  const photoTargetRef = useRef<string>('');
  const [zoom, setZoom] = useState<{ brand: string; url: string } | null>(null);

  // ── Adding a pack, under one brand at a time ────────────────────────────
  /** The brand whose "add a pack" boxes are open: '' for Any brand, null for none. */
  const [packFormFor, setPackFormFor] = useState<string | null>(null);
  const [packForm, setPackForm] = useState(blankPackForm);
  const [scanning, setScanning] = useState(false);
  const [clash, setClash] = useState<{
    input: PackInput; existingName: string; wasBaseUnits: number; suggestedName: string;
  } | null>(null);

  // ── Correcting a pack ───────────────────────────────────────────────────
  const [packEdit, setPackEdit] = useState<{ key: string; name: string; qty: string; price: string; barcode: string } | null>(null);

  /*
   * One card per brand. A brand written down against the item comes first;
   * a brand that only exists because a pack names it — packs made before
   * this screen — still gets a card, without a picture, so it can be given
   * one here rather than being typed a third time.
   */
  const groups = useMemo<Group[]>(() => {
    const map = new Map<string, Group>();
    for (const b of brands) {
      const k = brandKey(b.brand);
      if (k === '' || map.has(k)) continue;
      map.set(k, { key: k, brand: b.brand, row: b, packs: [] });
    }
    for (const p of packs) {
      const k = brandKey(p.brand);
      if (k === '') continue;
      if (!map.has(k)) map.set(k, { key: k, brand: p.brand, row: null, packs: [] });
      map.get(k)!.packs.push(p);
    }
    return [...map.values()];
  }, [brands, packs]);

  const shared = useMemo(() => packs.filter((p) => brandKey(p.brand) === ''), [packs]);

  // Brands bought before that are not on this list at all — worth a tap.
  const missing = knownBrands.filter((b) => {
    const k = brandKey(b);
    return k !== '' && !groups.some((g) => g.key === k);
  });

  const run = async (work: () => Promise<void>, fallback: string): Promise<boolean> => {
    setBusy(true);
    setMessage('');
    try {
      await work();
      return true;
    } catch (e) {
      setMessage(e instanceof Error && e.message ? e.message : fallback);
      return false;
    } finally {
      setBusy(false);
    }
  };

  // ── Brands ──────────────────────────────────────────────────────────────

  const addBrand = async (name: string, file: File | null): Promise<boolean> => {
    const brand = name.trim();
    if (!brand) { setMessage('Type the brand name first.'); return false; }
    if (groups.some((g) => g.key === brandKey(brand))) {
      setMessage(`${brand} is already on the list.`);
      return false;
    }
    const ok = await run(() => store.addBrand(brand, file), 'Could not save the brand.');
    if (ok) {
      setBrandForm({ brand: '', file: null });
      if (brandFileRef.current) brandFileRef.current.value = '';
      // The next thing anybody does with a new brand is say what it comes
      // in, so the pack boxes open under it straight away — unless they are
      // already open with a pack half-typed, which is not to be thrown away.
      if (!packFormHasEntry()) openPackForm(brand);
    }
    return ok;
  };

  const askForPhoto = (brand: string) => {
    photoTargetRef.current = brand;
    photoFileRef.current?.click();
  };

  const takePhoto = async (file: File | undefined) => {
    const brand = photoTargetRef.current;
    if (photoFileRef.current) photoFileRef.current.value = '';
    if (!file || !brand) return;
    await run(() => store.setBrandPhoto(brand, file), 'Could not save the picture.');
  };

  const removeBrand = async (g: Group) => {
    const what = g.packs.length === 0
      ? `Remove ${g.brand}?`
      : `Remove ${g.brand} and its ${g.packs.length === 1 ? 'pack' : `${g.packs.length} packs`}?`;
    if (!window.confirm(what)) return;
    if (packFormFor !== null && brandKey(packFormFor) === g.key) closePackForm();
    await run(() => store.removeBrand({ brand: g.brand, row: g.row, packs: g.packs }), 'Could not remove the brand.');
  };

  // ── Packs ───────────────────────────────────────────────────────────────

  const openPackForm = (brand: string) => {
    setPackFormFor(brand);
    setPackForm(blankPackForm);
    setClash(null);
    setMessage('');
  };

  const closePackForm = () => {
    setPackFormFor(null);
    setPackForm(blankPackForm);
    setClash(null);
  };

  /** The packs a new one can be measured in: its brand's own, and the shared ones. */
  const measurableIn = (brand: string): BrandPackRow[] => {
    const k = brandKey(brand);
    return packs.filter((p) => brandKey(p.brand) === '' || brandKey(p.brand) === k);
  };

  const packFormHasEntry = () => packForm.name.trim() !== '' || packForm.qty.trim() !== '';

  /** Read the boxes into a pack, or say what is missing. */
  const readPackForm = (brand: string, name = packForm.name): PackInput | null => {
    const packName = name.trim();
    const qty = parseFloat(packForm.qty);
    if (!packName) { setMessage('Give the pack a name, like 500 ml tin or Case.'); return null; }
    if (!Number.isFinite(qty) || qty <= 0) { setMessage('Say how much is in it.'); return null; }
    // "A case is 12 of the 500 g packs" — described against a pack already
    // here and multiplied out, since only the number is ever stored.
    const of = packForm.ofKey === '' ? null : packs.find((p) => p.key === packForm.ofKey) ?? null;
    const price = parseFloat(packForm.price);
    return {
      brand: brand.trim(),
      name: packName,
      baseUnits: of ? qty * of.baseUnits : qty,
      price: Number.isFinite(price) && price > 0 ? price : null,
      barcode: packForm.barcode.trim(),
    };
  };

  const submitPack = async (input: PackInput): Promise<boolean> => {
    setBusy(true);
    setMessage('');
    try {
      await store.addPack(input);
      // The boxes stay open under the same brand: several packs for one
      // brand is the common case, and reopening them each time is the
      // annoying half of it.
      setPackForm(blankPackForm);
      setClash(null);
      return true;
    } catch (e) {
      const conflict = packNameConflict(e);
      if (conflict) {
        setClash({
          input,
          existingName: conflict.existing.name,
          wasBaseUnits: conflict.existing.base_units,
          suggestedName: conflict.suggested_name,
        });
      } else {
        setMessage(e instanceof Error && e.message ? e.message : 'Could not save the pack.');
      }
      return false;
    } finally {
      setBusy(false);
    }
  };

  const addPack = async (): Promise<boolean> => {
    if (packFormFor === null) return false;
    const input = readPackForm(packFormFor);
    if (!input) return false;
    return submitPack(input);
  };

  const beginEdit = (p: BrandPackRow) => {
    setMessage('');
    setPackEdit({
      key: p.key, name: p.name, qty: tidy(p.baseUnits),
      price: p.price == null ? '' : tidy(p.price), barcode: p.barcode,
    });
  };

  const saveEdit = async () => {
    if (!packEdit) return;
    const pack = packs.find((p) => p.key === packEdit.key);
    if (!pack) { setPackEdit(null); return; }
    const name = packEdit.name.trim();
    const qty = parseFloat(packEdit.qty);
    if (!name) { setMessage('A pack needs a name.'); return; }
    if (!Number.isFinite(qty) || qty <= 0) { setMessage('Say how much is in it.'); return; }
    const price = parseFloat(packEdit.price);
    const ok = await run(() => store.updatePack(pack, {
      name,
      baseUnits: qty,
      price: Number.isFinite(price) && price > 0 ? price : null,
      barcode: packEdit.barcode.trim(),
    }), 'Could not save the pack.');
    if (ok) setPackEdit(null);
  };

  const removePack = async (p: BrandPackRow) => {
    await run(() => store.removePack(p), 'Could not remove the pack.');
  };

  useImperativeHandle(ref, () => ({
    flush: async () => {
      // The pack first: it is under a brand already on the list, and adding
      // a brand would otherwise open fresh pack boxes over it.
      if (packFormFor !== null && packFormHasEntry()) {
        if (!await addPack()) return 'stuck';
      }
      if (brandForm.brand.trim() !== '') {
        if (!await addBrand(brandForm.brand, brandForm.file)) return 'stuck';
      }
      return 'done';
    },
  }));

  // ── Drawing ─────────────────────────────────────────────────────────────

  const packLine = (p: BrandPackRow) => (
    <span style={{ fontSize: 13, minWidth: 0 }}>
      <strong>{p.name}</strong>
      <span style={S.secondary}>{' '}= {tidy(p.baseUnits)} {unit}</span>
      {p.price != null && (
        <span style={{ color: 'var(--color-text)', fontWeight: 700 }}>{' '}· MVR {p.price.toFixed(2)}</span>
      )}
      {/* When the figure was last true. A price set in March reading as
          "March" is the whole reason purchasing writes back to it. */}
      {p.pricedAt && (
        <span style={{ ...S.muted, display: 'block', fontSize: 11 }}>
          priced {new Date(p.pricedAt).toLocaleDateString()}
        </span>
      )}
      {p.barcode && (
        <span style={{ ...S.muted, display: 'block', fontSize: 11 }}>⌷ {p.barcode}</span>
      )}
    </span>
  );

  const packRow = (p: BrandPackRow) => (
    <div
      key={p.key}
      data-testid={`pack-row-${p.key}`}
      style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap',
        padding: '6px 0', borderTop: '1px solid var(--color-border-light)',
      }}
    >
      {packEdit?.key === p.key ? (
        <>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', flex: 1 }}>
            <input
              aria-label={`Name of ${p.name}`}
              value={packEdit.name}
              onChange={(e) => setPackEdit((f) => (f ? { ...f, name: e.target.value } : f))}
              style={{ ...S.input, flex: '1 1 110px', width: 'auto' }}
            />
            <span style={S.secondary}>=</span>
            <input
              aria-label={`Amount in ${p.name}`}
              type="number" min="0.000001" step="any"
              value={packEdit.qty}
              onChange={(e) => setPackEdit((f) => (f ? { ...f, qty: e.target.value } : f))}
              style={{ ...S.input, width: 90 }}
            />
            <span style={S.secondary}>{unit}</span>
            <span style={S.secondary}>· MVR</span>
            <input
              aria-label={`Price of ${p.name}`}
              type="number" min="0" step="any" placeholder="price"
              value={packEdit.price}
              onChange={(e) => setPackEdit((f) => (f ? { ...f, price: e.target.value } : f))}
              style={{ ...S.input, width: 90 }}
            />
            <input
              aria-label={`Barcode of ${p.name}`}
              placeholder="Barcode on the pack"
              inputMode="numeric"
              value={packEdit.barcode}
              onChange={(e) => setPackEdit((f) => (f ? { ...f, barcode: e.target.value } : f))}
              style={{ ...S.input, flex: '1 1 130px', width: 'auto' }}
            />
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <Btn small disabled={busy} onClick={() => void saveEdit()}>{busy ? 'Saving…' : 'Save'}</Btn>
            <Btn small variant="ghost" disabled={busy} onClick={() => setPackEdit(null)}>Cancel</Btn>
          </div>
        </>
      ) : (
        <>
          {packLine(p)}
          {canManage && (
            <div style={{ display: 'flex', gap: 6 }}>
              <Btn small variant="secondary" disabled={busy} onClick={() => beginEdit(p)} aria-label={`Edit ${p.name}`}>Edit</Btn>
              <Btn small variant="ghost" disabled={busy} onClick={() => void removePack(p)} aria-label={`Remove ${p.name}`}>Remove</Btn>
            </div>
          )}
        </>
      )}
    </div>
  );

  const packFormFields = (brand: string) => (
    <div data-testid="pack-form" style={{ display: 'grid', gap: 8, marginTop: 8 }}>
      <p style={{ fontWeight: 700, fontSize: 13, margin: 0 }}>
        {brand ? `Add a pack of ${brand}` : 'Add a pack any brand comes in'}
      </p>
      <input
        aria-label="Pack name"
        placeholder="Name, e.g. 500 ml tin or Case"
        value={packForm.name}
        onChange={(e) => setPackForm((f) => ({ ...f, name: e.target.value }))}
        style={S.input}
      />
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={S.secondary}>Usually costs MVR</span>
        <input
          aria-label="Pack default price"
          type="number" min="0" step="any" placeholder="185"
          value={packForm.price}
          onChange={(e) => setPackForm((f) => ({ ...f, price: e.target.value }))}
          style={{ ...S.input, width: 110 }}
        />
        <span style={S.muted}>
          per pack — a purchase order opens at this, and follows whatever you actually pay
        </span>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={S.secondary}>1 of these is</span>
        <input
          aria-label="Amount in the pack"
          type="number" min="0.000001" step="any" placeholder="how many"
          value={packForm.qty}
          onChange={(e) => setPackForm((f) => ({ ...f, qty: e.target.value }))}
          style={{ ...S.input, width: 100 }}
        />
        {/* A case is 7 trays. Defining a big pack from a small one is how
            people describe a box, and beats multiplying it out. With no
            pack to describe it against there is nothing to choose, and a
            dropdown of one entry only invites the question "why only
            packet?" (owner, 2026-09-12) — so it is plain text until then. */}
        {measurableIn(brand).length === 0 ? (
          <span style={{ ...S.secondary, fontWeight: 600 }} data-testid="pack-measured-in">{unit || 'unit'}</span>
        ) : (
          <select
            aria-label="Measured in"
            value={packForm.ofKey}
            onChange={(e) => setPackForm((f) => ({ ...f, ofKey: e.target.value }))}
            style={{ ...S.select, minWidth: 120 }}
          >
            <option value="">{unit || 'unit'}</option>
            {measurableIn(brand).map((p) => <option key={p.key} value={p.key}>of a {p.name.toLowerCase()}</option>)}
          </select>
        )}
        <Btn small disabled={busy} onClick={() => void addPack()}>{busy ? 'Saving…' : 'Add pack'}</Btn>
      </div>
      <p style={{ ...S.muted, margin: 0 }}>
        {unit ? `${unit} is what this item is counted in` : 'Counted in the unit set above'}
        {measurableIn(brand).length > 0 ? ', or describe it as so many of a pack already here' : ''}
        . To count it in something else, change Unit above.
      </p>
      {/* Both answers are one click, and neither is the default: losing a
          pack size silently is what this replaces. */}
      {clash && (
        <div
          data-testid="pack-name-clash"
          style={{
            border: '1px solid var(--color-warning)', borderRadius: 10,
            padding: '10px 12px', background: 'var(--color-bg)', display: 'grid', gap: 8,
          }}
        >
          <span style={{ fontSize: 13, color: 'var(--color-text)' }}>
            “{clash.existingName}”{brand ? ` of ${brand}` : ''} already holds {tidy(clash.wasBaseUnits)}
            {unit ? ` ${unit}` : ''}. Is this a correction, or a second size?
          </span>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Btn
              small
              disabled={busy}
              data-testid="pack-clash-keep-both"
              onClick={() => void submitPack({ ...clash.input, name: clash.suggestedName })}
            >
              Keep both — call this “{clash.suggestedName}”
            </Btn>
            <Btn
              small
              variant="secondary"
              disabled={busy}
              data-testid="pack-clash-replace"
              onClick={() => void submitPack({ ...clash.input, replace: true })}
            >
              No, {clash.existingName} really holds {tidy(clash.input.baseUnits)}
            </Btn>
            <Btn small variant="ghost" disabled={busy} onClick={() => setClash(null)}>Cancel</Btn>
          </div>
        </div>
      )}
      {/* Different sizes carry different EANs; the code on the tin is what
          lets receiving and stock counts count the right size. */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          aria-label="Pack barcode"
          placeholder="Barcode on the pack (optional)"
          inputMode="numeric"
          autoComplete="off"
          value={packForm.barcode}
          onChange={(e) => setPackForm((f) => ({ ...f, barcode: e.target.value }))}
          style={{ ...S.input, flex: 1, width: 'auto' }}
        />
        <Btn small variant="secondary" onClick={() => setScanning(true)} aria-label="Scan the pack barcode">📷 Scan</Btn>
        <Btn small variant="ghost" onClick={closePackForm} aria-label="Close the pack boxes">Done</Btn>
      </div>
    </div>
  );

  const groupCard = (g: Group) => (
    <div key={g.key} data-testid={`brand-group-${g.key}`} style={S.card}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        {g.row?.photoUrl ? (
          <BrandThumb photo={{ brand: g.brand, url: g.row.photoUrl }} size={56} onClick={() => setZoom({ brand: g.brand, url: g.row!.photoUrl! })} />
        ) : (
          // A brand with no picture is still a brand. Say so plainly rather
          // than leaving a gap that looks like a failed image.
          <div
            data-testid={`brand-no-photo-${g.key}`}
            style={{
              width: 56, height: 56, borderRadius: 8, display: 'flex', alignItems: 'center',
              justifyContent: 'center', textAlign: 'center', flexShrink: 0,
              border: '1px dashed var(--color-border)', background: 'var(--color-bg)',
              color: 'var(--color-text-muted)', fontSize: 10, padding: 4,
            }}
          >
            No picture
          </div>
        )}
        <div style={{ flex: 1, minWidth: 120 }}>
          <div style={{ fontSize: 14, fontWeight: 700, wordBreak: 'break-word' }}>{g.brand}</div>
          <div style={S.muted}>
            {g.packs.length === 0 ? 'No packs yet' : `${g.packs.length} ${g.packs.length === 1 ? 'pack' : 'packs'}`}
          </div>
        </div>
        {canManage && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <Btn small variant="secondary" disabled={busy} onClick={() => askForPhoto(g.brand)} aria-label={`${g.row?.photoUrl ? 'Change' : 'Add'} the picture for ${g.brand}`}>
              📷 {g.row?.photoUrl ? 'Change picture' : 'Add picture'}
            </Btn>
            <Btn small variant="ghost" disabled={busy} onClick={() => void removeBrand(g)} aria-label={`Remove ${g.brand}`}>Remove</Btn>
          </div>
        )}
      </div>
      {g.packs.length > 0 && (
        <div style={{ marginTop: 8 }}>{g.packs.map(packRow)}</div>
      )}
      {canManage && (packFormFor !== null && brandKey(packFormFor) === g.key
        ? packFormFields(g.brand)
        : (
          <Btn small variant="ghost" disabled={busy} onClick={() => openPackForm(g.brand)} aria-label={`Add a pack for ${g.brand}`} style={{ marginTop: 6 }}>
            ＋ Add a pack
          </Btn>
        ))}
    </div>
  );

  return (
    <div
      data-testid={testId}
      style={{ border: '1px solid var(--color-border)', borderRadius: 10, padding: '12px 14px', background: 'var(--color-bg)' }}
    >
      <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-secondary)', margin: '0 0 4px' }}>
        Brands and packs — whose you buy, and what it comes in
      </p>
      <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', margin: '0 0 12px', lineHeight: 1.5 }}>
        Stock is counted in <strong style={{ color: 'var(--color-text)' }}>{unit || 'the unit above'}</strong>.
        Add each brand you buy, then the packs it comes in and what each usually costs — a purchase order
        opens at those the moment the brand is picked, and follows whatever you actually pay. A picture is
        optional and worth it for the ones that look alike on the shelf. Packs that are the same whoever
        made them go under “Any brand”.{' '}
        {savesImmediately
          ? 'These save as you add them. Editing a pack only changes what future orders convert to — nothing you have received moves.'
          : 'These save with the item.'}
      </p>

      {/* The latest thing said wins: a load error is still there when
          nothing has been done since, and a "say how much" after it is the
          one the person is waiting on. */}
      {(message || error) && (
        <p role="alert" style={{ color: 'var(--color-danger-strong)', fontSize: 13, marginBottom: 10 }}>{message || error}</p>
      )}

      {loading ? <TableSkeleton rows={2} cols={2} /> : (
        <div style={{ display: 'grid', gap: 8 }}>
          {groups.length === 0 && shared.length === 0 && (
            <p style={{ fontSize: 13, color: 'var(--color-text-muted)', margin: 0 }}>
              No brands or packs yet — leave it empty if this is bought loose and it does not matter whose.
            </p>
          )}

          {groups.map(groupCard)}

          {/* The packs that do not depend on the brand — which is every pack
              made before brands existed. Always here for anyone who can add
              one, so a plain item has somewhere to put its 500 g bag. */}
          {(shared.length > 0 || canManage) && (
            <div data-testid="brand-group-shared" style={{ ...S.card, borderStyle: 'dashed' }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>Any brand</div>
              <div style={S.muted}>Packs that are the same whoever made them.</div>
              {shared.length > 0 && <div style={{ marginTop: 8 }}>{shared.map(packRow)}</div>}
              {canManage && (packFormFor === ''
                ? packFormFields('')
                : (
                  <Btn small variant="ghost" disabled={busy} onClick={() => openPackForm('')} aria-label="Add a pack for any brand" style={{ marginTop: 6 }}>
                    ＋ Add a pack
                  </Btn>
                ))}
            </div>
          )}

          {canManage && (
            <div data-testid="brand-form" style={{ display: 'grid', gap: 8, marginTop: 4 }}>
              <p style={{ fontWeight: 700, fontSize: 13, margin: 0 }}>Add a brand</p>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <input
                  aria-label="Brand name"
                  list="brand-packs-known-brands"
                  placeholder="Brand, e.g. Amul"
                  value={brandForm.brand}
                  onChange={(e) => setBrandForm((f) => ({ ...f, brand: e.target.value }))}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void addBrand(brandForm.brand, brandForm.file); } }}
                  style={{ ...S.input, flex: '1 1 160px', width: 'auto' }}
                />
                <datalist id="brand-packs-known-brands">
                  {knownBrands.map((b) => <option key={b} value={b} />)}
                </datalist>
                <input
                  ref={brandFileRef}
                  aria-label="Brand picture"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  capture="environment"
                  onChange={(e) => setBrandForm((f) => ({ ...f, file: e.target.files?.[0] ?? null }))}
                  style={{ display: 'none' }}
                />
                <Btn small variant="secondary" disabled={busy} onClick={() => brandFileRef.current?.click()}>
                  📷 {brandForm.file ? 'Picture chosen' : 'Picture (optional)'}
                </Btn>
                <Btn small disabled={busy} onClick={() => void addBrand(brandForm.brand, brandForm.file)}>
                  {busy ? 'Saving…' : 'Add brand'}
                </Btn>
              </div>
              {missing.length > 0 && (
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={S.muted}>Bought before, not on this list:</span>
                  {missing.slice(0, 6).map((b) => (
                    <Btn key={b} small variant="ghost" disabled={busy} onClick={() => void addBrand(b, null)} aria-label={`Add ${b}`}>
                      ＋ {b}
                    </Btn>
                  ))}
                </div>
              )}
            </div>
          )}

        </div>
      )}

      {/* One hidden picker for every brand card's picture button: the card
          that was pressed is remembered, so one change handler serves all. */}
      <input
        ref={photoFileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        onChange={(e) => void takePhoto(e.target.files?.[0])}
        style={{ display: 'none' }}
        data-testid="brand-photo-file"
      />

      {scanning && (
        <ScanSheet
          title="Scan the pack"
          onScan={(code) => { setPackForm((f) => ({ ...f, barcode: code.trim() })); setScanning(false); }}
          onClose={() => setScanning(false)}
        />
      )}

      {zoom && (
        <div
          role="dialog"
          aria-label={`${zoom.brand} picture`}
          style={{ position: 'fixed', inset: 0, zIndex: 1000 }}
        >
          {/* The whole backdrop is the close control, so a tap or Escape
              anywhere puts the picture away; a real button so the keyboard
              gets it for free. */}
          <button
            type="button"
            autoFocus
            onClick={() => setZoom(null)}
            onKeyDown={(e) => { if (e.key === 'Escape') setZoom(null); }}
            aria-label="Close the picture"
            style={{
              width: '100%', height: '100%', border: 'none', cursor: 'zoom-out',
              background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center',
              justifyContent: 'center', padding: 20, fontFamily: 'inherit',
            }}
          >
            <span style={{ textAlign: 'center' }}>
              <img src={zoom.url} alt={zoom.brand} style={{ maxWidth: '90vw', maxHeight: '80vh', borderRadius: 12 }} />
              <span style={{ display: 'block', color: 'white', fontWeight: 700, marginTop: 10 }}>{zoom.brand}</span>
            </span>
          </button>
        </div>
      )}
    </div>
  );
}

/** A live pack as the editor wants it. */
export function packRowFromUnit(p: {
  id: number; name: string; base_units: number | string; brand?: string | null;
  default_unit_cost?: number | string | null; default_cost_updated_at?: string | null; barcode?: string | null;
}): BrandPackRow {
  return {
    key: String(p.id),
    id: p.id,
    brand: p.brand ?? '',
    name: p.name,
    baseUnits: Number(p.base_units),
    price: p.default_unit_cost == null ? null : Number(p.default_unit_cost),
    pricedAt: p.default_cost_updated_at ?? null,
    barcode: p.barcode ?? '',
  };
}
