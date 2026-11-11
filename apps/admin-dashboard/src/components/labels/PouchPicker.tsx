import type { LabelPouch, PouchCatalogue } from '../../api';
import { Switch } from '../SharedUI';

/*
 * A pouch label's picks (owner, 2026-11-11: the frozen momo's zip pouch, "for
 * different type of background… steam, frying and other types"): a switch
 * that makes the label a pouch label, the colour of the pouch behind it, how
 * the food is cooked, the line under the name and the size word. The server
 * draws it (PouchDesign) on a landscape label; the catalogue comes with the
 * layouts (`pouch`), and this list stands in until it has loaded.
 */

export const POUCH_FALLBACK: PouchCatalogue = {
  looks: [
    { key: 'gold', label: 'Gold or yellow pouch', hint: 'Cream label, dark brown frame, yellow highlights', bg: '#FFFBF3', border: '#4A2412', panel: '#4A2412', pill: '#FFC72C' },
    { key: 'clear', label: 'Clear or white pouch', hint: 'White label in the brand rust', bg: '#FFFFFF', border: '#B74B0C', panel: '#B74B0C', pill: '#FEF3E8' },
    { key: 'kraft', label: 'Brown paper (kraft) pouch', hint: 'Warm cream label with a deep green panel', bg: '#FBF6EA', border: '#2F4A32', panel: '#2F4A32', pill: '#2F4A32' },
    { key: 'dark', label: 'Black or dark pouch', hint: 'Dark label with cream words and gold highlights', bg: '#1C1408', border: '#E3B04B', panel: '#E3B04B', pill: '#E3B04B' },
    { key: 'mono', label: 'Black and white (label printer)', hint: 'No colour: for a thermal printer or a photocopy', bg: '#FFFFFF', border: '#000000', panel: '#000000', pill: '#000000' },
  ],
  methods: [
    { key: 'microwave', label: 'Microwave & Eat', how: '' }, { key: 'steam', label: 'Steam & Eat', how: '' }, { key: 'pan_fry', label: 'Pan Fry', how: '' },
    { key: 'deep_fry', label: 'Deep Fry', how: '' }, { key: 'air_fry', label: 'Air Fry', how: '' }, { key: 'boil', label: 'Boil & Eat', how: '' },
    { key: 'bake', label: 'Oven Bake', how: '' }, { key: 'ready', label: 'Ready to Eat', how: '' }, { key: 'thaw', label: 'Thaw & Serve', how: '' },
    { key: 'none', label: 'Nothing (no pill)', how: '' },
  ],
  default_look: 'gold', default_method: 'microwave', min_w: 90, min_h: 40, min_ratio: 1.5,
};

export const newPouch = (c: PouchCatalogue): LabelPouch => ({ look: c.default_look, method: c.default_method, method_text: '', method_text_dv: '', tagline: '', tagline_dv: '', size_word: '' });

/** Whether a label this size prints the pouch design (the server's PouchConfig::fits). */
export const pouchFits = (c: PouchCatalogue, shape: string, w: number, h: number): boolean => shape === 'rect' && w >= c.min_w && h >= c.min_h && w >= h * c.min_ratio;

/** One line for a fold's summary. */
export function pouchSummary(value: LabelPouch | null, catalogue: PouchCatalogue | null | undefined): string {
  if (!value) return 'Off';
  const c = catalogue ?? POUCH_FALLBACK;
  const look = c.looks.find((l) => l.key === value.look)?.label ?? value.look;
  const method = value.method === 'none' ? null : (value.method_text || c.methods.find((m) => m.key === value.method)?.label);
  return [look, method].filter(Boolean).join(' · ');
}

const fieldClass = 'h-10 min-h-[44px] px-3 rounded-lg border border-[var(--color-border)] bg-white text-sm text-[var(--color-text)] w-full';
const labelClass = 'block text-xs font-semibold text-[var(--color-text-secondary)] mb-1';
const hintClass = 'text-xs text-[var(--color-text-muted)] mt-1';

export function PouchPicker({ value, onChange, catalogue, howToUse, onUseHow, sizeNote, idPrefix = 'pouch' }: {
  value: LabelPouch | null;
  onChange: (v: LabelPouch | null) => void;
  catalogue?: PouchCatalogue | null;
  /** The label's own How to use, so the method's wording is offered only while it is blank. */
  howToUse?: string;
  /** Puts the method's wording into the label's How to use box, to edit. */
  onUseHow?: (text: string) => void;
  /** Said under the switch when the size being previewed cannot hold a pouch label. */
  sizeNote?: string | null;
  idPrefix?: string;
}) {
  const c = catalogue ?? POUCH_FALLBACK;
  const set = <K extends keyof LabelPouch>(k: K, v: LabelPouch[K]) => value && onChange({ ...value, [k]: v });
  const method = value ? c.methods.find((m) => m.key === value.method) : undefined;

  return (
    <div className="space-y-3 min-w-0" data-testid={`${idPrefix}-picker`}>
      <label className="flex items-center gap-3 min-h-[44px]">
        <Switch checked={value !== null} onChange={(on: boolean) => onChange(on ? newPouch(c) : null)} aria-label="Print as a pouch label" />
        <span className="text-sm font-semibold text-[var(--color-text)]">Print as a pouch label</span>
      </label>
      {sizeNote && value && <p className="text-xs font-semibold text-[var(--color-warning)]" data-testid={`${idPrefix}-size-note`}>{sizeNote}</p>}

      {value && (
        <>
          <div>
            <span className={labelClass} id={`${idPrefix}-look-label`}>What the pouch looks like</span>
            <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))' }} role="radiogroup" aria-labelledby={`${idPrefix}-look-label`}>
              {c.looks.map((l) => {
                const picked = value.look === l.key;
                return (
                  <button
                    key={l.key} type="button" role="radio" aria-checked={picked} onClick={() => set('look', l.key)} data-testid={`${idPrefix}-look-${l.key}`}
                    className={`text-left rounded-lg border p-2 min-w-0 ${picked ? 'border-[var(--color-primary)] bg-[var(--color-tone-rust-bg)]' : 'border-[var(--color-border)]'}`}
                  >
                    {/* A sketch of the label in the look's own colours: they are the print's, not the admin's. */}
                    <span className="flex rounded overflow-hidden h-7 mb-1.5" style={{ border: `2px solid ${l.border}`, background: l.bg }} aria-hidden>
                      <span className="flex-1 flex items-center pl-1.5"><span className="block h-2 w-8 rounded-full" style={{ background: l.pill, outline: l.pill === l.bg ? `1px solid ${l.border}` : undefined }} /></span>
                      <span className="w-6" style={{ background: l.panel }} />
                    </span>
                    <span className="block text-xs font-bold text-[var(--color-text)]">{l.label}</span>
                    <span className="block text-[11px] text-[var(--color-text-muted)]">{l.hint}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))' }}>
            <div>
              <label className={labelClass} htmlFor={`${idPrefix}-method`}>How it is cooked</label>
              <select id={`${idPrefix}-method`} value={value.method} onChange={(e) => set('method', e.target.value)} className={fieldClass}>
                {c.methods.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
              </select>
              <p className={hintClass}>Prints as a pill under the name, with its picture.</p>
            </div>
            <div>
              <label className={labelClass} htmlFor={`${idPrefix}-method-text`}>Your own words on the pill</label>
              <input id={`${idPrefix}-method-text`} value={value.method_text} maxLength={24} onChange={(e) => set('method_text', e.target.value)} className={fieldClass} placeholder={method && method.key !== 'none' ? method.label : 'Steam or Fry'} disabled={value.method === 'none'} />
            </div>
            <div>
              <label className={labelClass} htmlFor={`${idPrefix}-tagline`}>Line under the name</label>
              <input id={`${idPrefix}-tagline`} value={value.tagline} maxLength={60} onChange={(e) => set('tagline', e.target.value)} className={fieldClass} placeholder="Steamed · Frozen · Handmade" />
              <p className={hintClass}>Blank prints the label's heading.</p>
            </div>
            <div>
              <label className={labelClass} htmlFor={`${idPrefix}-size-word`}>Size word</label>
              <input id={`${idPrefix}-size-word`} value={value.size_word} maxLength={14} onChange={(e) => set('size_word', e.target.value)} className={fieldClass} placeholder="Medium" />
              <p className={hintClass}>Over the count: Small, Medium, Large. Blank prints the size being printed, when the item has sizes.</p>
            </div>
          </div>

          {method?.how && !(howToUse ?? '').trim() && (
            <div className="rounded-lg bg-[var(--color-bg)] p-2.5 text-xs text-[var(--color-text-secondary)]" data-testid={`${idPrefix}-how`}>
              <p><span className="font-bold">How to use is blank, so this prints:</span> {method.how}</p>
              <p className="mt-1">Check the times against your own product.{onUseHow && (
                <> <button type="button" className="font-bold text-[var(--color-primary)] underline min-h-[32px]" onClick={() => onUseHow(method.how)}>Put it in How to use to edit</button></>
              )}</p>
            </div>
          )}
          <p className={hintClass}>The count is the pack quantity, the price is the label's price, and the photo is the label's food photo. Bake &amp; Grill's name, phone and the complaints QR always print.</p>
        </>
      )}
    </div>
  );
}
