import { Link } from 'react-router-dom';
import type { LabelBadge, LabelBrand, LabelFooter, LabelSpotKey, LabelType } from '../../api';
import { Btn, Modal, ModalActions } from '../SharedUI';
import { spotName } from './SpotOverlay';
import { BADGE_FALLBACK, MAX_BADGES } from './BadgePicker';

/*
 * The sheet a tap on the preview opens (round 3 of the usability work, owner,
 * 2026-10-13): only the boxes that change the part tapped, and a line saying
 * where the part comes from when it is not the label's own (the pack QR is a
 * setting, the packed-for line is typed when printing). quickSpec() says
 * what each part needs for a custom label or a menu item; the host keeps the
 * values (its own draft) and decides what Done does: the custom label editor
 * keeps editing, the item's Label tab and the wizard save straight away.
 */

export type QuickKind = 'custom' | 'item';
export type QuickValue = string | number | boolean | string[] | null;

export type QuickInput = {
  key: string;
  label: string;
  kind: 'text' | 'textarea' | 'number' | 'date' | 'select' | 'switch' | 'chips';
  hint?: string;
  placeholder?: string;
  dir?: 'rtl';
  maxLength?: number;
  min?: number;
  max?: number;
  step?: string;
  inputMode?: 'numeric' | 'decimal';
  options?: { value: string; label: string }[];
  /** A select of ids: '' is null, anything else a number. */
  numeric?: boolean;
  /** Typed in capitals. */
  upper?: boolean;
};

export type QuickSpec = {
  title: string;
  /** Where the part comes from, or why it is not changed here. */
  note?: string;
  inputs: QuickInput[];
  /** Things the host does (choose a picture…). */
  actions?: { key: string; label: string; danger?: boolean }[];
  /** The page that holds the setting when it is not on the label itself. */
  link?: { label: string; to: string };
};

export type QuickContext = {
  kind: QuickKind;
  types?: LabelType[];
  brands?: LabelBrand[];
  footers?: LabelFooter[];
  /** What prints in an empty box: the type's wording, else the usual one. */
  defaults?: Partial<{ heading: string; heading_dv: string; storage_line: string; storage_line_dv: string; how_to_use: string; how_to_use_dv: string; note: string; note_dv: string; brand: string; unit: string; shelf_life_days: number | null }>;
  /** The business's own brand, whose branding every footer carries. */
  mainBrand?: string;
  /** The badges a product can carry (round 9), from the layouts. */
  badges?: LabelBadge[];
  /** A menu item's allergens, from its Details tab. */
  allergens?: string[];
  menuPrice?: number;
  nutritionWords?: string;
  hasPhoto?: boolean;
};

const STORAGES = [{ value: 'frozen', label: 'Frozen' }, { value: 'chilled', label: 'Chilled' }, { value: 'ambient', label: 'Room temperature' }];

const SETTINGS = { label: 'Labels → Settings', to: '/labels/settings' };
const STICKERS = { label: 'Print labels', to: '/labels/stickers' };
const TYPES = { label: 'Wording and logos', to: '/labels/types' };

function typeSelect(ctx: QuickContext, label = 'Label type'): QuickInput {
  return {
    key: 'label_type_id', label, kind: 'select', numeric: true,
    options: [{ value: '', label: 'No type: the usual wording for its storage' }, ...(ctx.types ?? []).map((t) => ({ value: String(t.id), label: `${t.name}${t.brand_name ? ` · ${t.brand_name}` : ''}` }))],
  };
}

/** What a tap on each part opens, for a custom label or a menu item. */
export function quickSpec(key: LabelSpotKey, ctx: QuickContext): QuickSpec {
  const d = ctx.defaults ?? {};
  const custom = ctx.kind === 'custom';
  const allergens = ctx.allergens ?? [];
  switch (key) {
    case 'brand':
      return custom
        ? {
          title: 'Brand and logo',
          note: `The brand's logo and name go on the header; the bottom strip is always ${ctx.mainBrand ?? 'the business'}'s.`,
          inputs: [{ key: 'brand_id', label: 'Brand', kind: 'select', numeric: true, options: [{ value: '', label: `As the label type${d.brand ? ` (${d.brand})` : ''}` }, ...(ctx.brands ?? []).map((b) => ({ value: String(b.id), label: `${b.name}${b.is_default ? ' (main)' : ''}` }))] }],
          link: TYPES,
        }
        : {
          title: 'Brand and logo',
          note: `A menu item's brand is its label type's${d.brand ? ` (${d.brand})` : ''}. Pick a type with its own brand, or add a brand under Wording and logos.`,
          inputs: [typeSelect(ctx)],
          link: TYPES,
        };
    case 'heading':
      return {
        title: 'Heading',
        note: 'The heading comes from the label type; anything typed here prints instead.',
        inputs: [
          typeSelect(ctx),
          { key: 'label_heading', label: 'Heading (top of the sticker)', kind: 'text', maxLength: 40, placeholder: d.heading ?? 'FROZEN HEDHIKA', upper: custom },
          { key: 'label_heading_dv', label: 'Heading (Dhivehi)', kind: 'text', dir: 'rtl', maxLength: 40, placeholder: d.heading_dv ?? '' },
        ],
      };
    case 'batch_qr':
      return { title: 'Pack QR code', note: "The code opens the pack's page (its batch and dates). It is on or off for every label under Labels → Settings.", inputs: [], link: SETTINGS };
    case 'pack':
      return { title: 'Pack numbering', note: '“Pack 3 of 40” is a print option: Print labels → More options → Number the packs.', inputs: [], link: STICKERS };
    case 'name':
      return custom
        ? {
          title: 'Name',
          note: 'A hand-lettered name picture prints instead of the typed name when there is one: All details → Hand-lettered name.',
          inputs: [
            { key: 'name', label: 'Product name', kind: 'text', maxLength: 80 },
            { key: 'name_dv', label: 'Product name (Dhivehi)', kind: 'text', dir: 'rtl', maxLength: 80 },
          ],
        }
        : { title: 'Name', note: "The name is the menu item's: change it on the item's Details tab under Menu. A hand-lettered name picture prints instead when there is one: All details → Hand-lettered name.", inputs: [] };
    case 'badges':
      return {
        title: 'Badges',
        note: `Halal, Spicy, New and the like, printed as rust pills under the name on every size with the room. Up to ${MAX_BADGES}.`,
        inputs: [{ key: 'label_badges', label: 'Badges', kind: 'chips', max: MAX_BADGES, options: (ctx.badges && ctx.badges.length > 0 ? ctx.badges : BADGE_FALLBACK).map((b) => ({ value: b.key, label: b.word })) }],
      };
    case 'promo':
      return { title: 'Promotion flash', note: 'A Was → Now price or a few words, added when you print: Print labels → More options → Promotion.', inputs: [], link: STICKERS };
    case 'packed':
      return { title: 'Packed for', note: 'Who the packs are for is typed when you print (Print labels → More options → Packed for), or filled in from a wholesale delivery or a catering event.', inputs: [], link: STICKERS };
    case 'photo':
      return {
        title: 'Picture',
        note: custom
          ? 'A PNG with a clear background prints over the label, kept exactly as uploaded; without one, the brand mark.'
          : "The item's cut-out from its Photos tab prints unless a label picture is picked; without either, the flame.",
        inputs: [],
        actions: [{ key: 'photo', label: 'Choose a picture' }, ...(ctx.hasPhoto ? [{ key: 'remove_photo', label: 'Remove the picture', danger: true }] : [])],
      };
    case 'barcode':
      return {
        title: 'Barcode',
        inputs: [{ key: 'label_barcode', label: 'Barcode (EAN-13 or EAN-8)', kind: 'text', inputMode: 'numeric', maxLength: 20, placeholder: '590123412345', hint: '12 digits: the check digit is added (7 for EAN-8). Prints on the full-size sticker.' }],
      };
    case 'ingredients':
      return custom
        ? {
          title: 'Ingredients',
          inputs: [
            { key: 'label_ingredients', label: 'Ingredients', kind: 'textarea', maxLength: 500, placeholder: 'Garlic, oil, lemon, salt' },
            { key: 'label_ingredients_dv', label: 'Ingredients (Dhivehi)', kind: 'textarea', dir: 'rtl', maxLength: 500, hint: 'Empty: the glossary translates the English list.' },
            { key: 'label_allergens', label: 'Allergens', kind: 'text', maxLength: 200, placeholder: 'egg, gluten, peanuts', hint: 'Printed bold in the ingredients, and as “Contains …” when the note is empty.' },
          ],
        }
        : {
          title: 'Ingredients',
          note: allergens.length > 0 ? `Allergens from the Details tab (${allergens.join(', ')}) print bold in the list.` : 'Tick allergens on the Details tab and they print bold in the list.',
          inputs: [
            { key: 'label_ingredients_source', label: 'Where from', kind: 'select', options: [{ value: 'auto', label: 'From the recipe; typed in below if there is no recipe' }, { value: 'recipe', label: 'From the recipe' }, { value: 'manual', label: 'Typed in below' }] },
            { key: 'label_ingredients', label: 'Typed ingredients (English)', kind: 'textarea', maxLength: 500, placeholder: 'Flour, salt, oil, onion, smoked tuna' },
            { key: 'label_ingredients_dv', label: 'Ingredients in Dhivehi', kind: 'textarea', dir: 'rtl', maxLength: 500 },
          ],
        };
    case 'how_to_use':
      return {
        title: 'How to use',
        inputs: [
          { key: 'label_how_to_use', label: 'How to use', kind: 'textarea', maxLength: 200, placeholder: d.how_to_use || 'Thaw 10 min. Deep fry 4–5 min until golden.' },
          { key: 'label_how_to_use_dv', label: 'How to use (Dhivehi)', kind: 'textarea', dir: 'rtl', maxLength: 200, placeholder: d.how_to_use_dv ?? '' },
        ],
      };
    case 'nutrition':
      return custom
        ? {
          title: 'Nutrition',
          inputs: [
            { key: 'label_nutrition', label: 'Nutrition per 100 g or ml', kind: 'text', maxLength: 200, placeholder: 'Energy 250 kcal · Fat 12 g · Carbs 30 g · Protein 8 g · Salt 1.2 g', hint: 'One line, as it should print on the full-size sticker.' },
            { key: 'label_nutrition_per', label: 'Per', kind: 'select', options: [{ value: 'g', label: '100 g' }, { value: 'ml', label: '100 ml (a drink)' }] },
          ],
        }
        : {
          title: 'Nutrition',
          note: ctx.nutritionWords,
          inputs: [{ key: 'label_show_nutrition', label: 'Print nutrition per 100 g', kind: 'switch' }],
        };
    case 'icons':
      return custom
        ? {
          title: 'Allergen pictograms',
          note: 'A symbol with its word prints above the note for each allergen, when the pictograms are switched on under Labels → Settings.',
          inputs: [{ key: 'label_allergens', label: 'Allergens', kind: 'text', maxLength: 200, placeholder: 'egg, gluten, peanuts' }],
          link: SETTINGS,
        }
        : {
          title: 'Allergen pictograms',
          note: `A symbol with its word prints for each allergen ticked on the Details tab${allergens.length > 0 ? ` (${allergens.join(', ')})` : ''}, when the pictograms are switched on under Labels → Settings.`,
          inputs: [],
          link: SETTINGS,
        };
    case 'note':
      return {
        title: 'Note',
        inputs: [
          { key: 'label_note', label: 'Note under the ingredients', kind: 'text', maxLength: 120, placeholder: d.note || 'Contains egg and gluten' },
          { key: 'label_note_dv', label: 'Note (Dhivehi)', kind: 'text', dir: 'rtl', maxLength: 120, placeholder: d.note_dv ?? '' },
        ],
      };
    case 'dates':
      return {
        title: 'Dates',
        note: 'Expiry = made-on date + shelf life. The made-on date is typed when you print; the wording of the boxes comes from the label type.',
        inputs: [{ key: 'label_shelf_life_days', label: 'Shelf life (days)', kind: 'number', min: 1, max: 730, inputMode: 'numeric', placeholder: d.shelf_life_days ? `${d.shelf_life_days} from the type` : 'Blank: write by hand' }],
      };
    case 'batch':
      return { title: 'Batch number', note: 'Typed when you print (Print labels), or filled in from the kitchen batch the stickers are for.', inputs: [], link: STICKERS };
    case 'qty':
      return {
        title: 'Quantity per pack',
        inputs: [
          { key: 'label_pack_qty', label: 'Pieces per pack', kind: 'number', min: 1, max: 9999, inputMode: 'numeric', placeholder: 'Blank: write by hand' },
          { key: 'label_pack_unit', label: 'Unit after the quantity', kind: 'text', maxLength: 10, upper: true, placeholder: d.unit || 'PCS', hint: 'PCS, G, ML, KG, PACK…' },
          { key: 'label_net_weight', label: 'Net weight', kind: 'text', maxLength: 20, placeholder: '250 g', hint: 'Beside the quantity.' },
        ],
      };
    case 'price':
      return custom
        ? { title: 'Price', inputs: [{ key: 'label_price', label: 'Price (MVR)', kind: 'number', min: 0, step: '0.5', inputMode: 'decimal', placeholder: '25.00', hint: 'Empty prints no price.' }] }
        : {
          title: 'Price',
          inputs: [
            { key: 'label_show_price', label: 'Print the price', kind: 'switch' },
            { key: 'label_price', label: 'Label price (MVR)', kind: 'number', min: 0, step: '0.5', inputMode: 'decimal', placeholder: ctx.menuPrice != null ? ctx.menuPrice.toFixed(2) : '', hint: `The menu price${ctx.menuPrice != null ? `, MVR ${ctx.menuPrice.toFixed(2)},` : ''} unless one is typed.` },
          ],
        };
    case 'storage':
      return {
        title: 'Storage',
        inputs: [
          { key: 'label_storage', label: 'Storage', kind: 'select', options: custom ? [{ value: '', label: 'As the label type' }, ...STORAGES] : STORAGES },
          { key: 'label_storage_line', label: 'Storage line (strip above the footer)', kind: 'text', maxLength: 160, placeholder: d.storage_line ?? '' },
          { key: 'label_storage_line_dv', label: 'Storage line (Dhivehi)', kind: 'text', dir: 'rtl', maxLength: 160, placeholder: d.storage_line_dv ?? '' },
        ],
      };
    case 'footer':
      return custom
        ? {
          title: 'Bottom strip and complaints QR',
          note: `The band at the foot of the sticker, always ${ctx.mainBrand ?? 'the business'}'s branding whatever brand is on the header. A bottom strip's words are changed under Wording and logos → Bottom strips.`,
          inputs: [
            { key: 'footer_id', label: 'Bottom strip', kind: 'select', numeric: true, options: [{ value: '', label: 'As the label type, else Standard' }, ...(ctx.footers ?? []).map((f) => ({ value: String(f.id), label: `${f.name}${f.is_default ? ' (standard)' : ''}` }))] },
            { key: 'label_show_qr', label: 'Complaints QR in the bottom strip', kind: 'select', options: [{ value: '', label: 'As the bottom strip' }, { value: 'on', label: 'Print it' }, { value: 'off', label: 'Leave it off' }] },
          ],
          link: TYPES,
        }
        : { title: 'Bottom strip', note: "The band at the foot of the sticker is the label type's, else Standard, always the business's branding. Bottom strips are picked for a type and changed under Wording and logos → Bottom strips.", inputs: [], link: TYPES };
    default:
      return { title: spotName(key), note: 'Change this under All details.', inputs: [] };
  }
}

const fieldClass = 'h-10 min-h-[44px] px-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-sm text-[var(--color-text)] w-full';
const areaClass = 'w-full min-h-[44px] px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-sm text-[var(--color-text)] resize-y';
const labelClass = 'block text-xs font-semibold text-[var(--color-text-secondary)] mb-1';

const str = (v: unknown): string => (v == null ? '' : String(v));

type Props = {
  spec: QuickSpec;
  /** The host's draft; the inputs read their keys from it. */
  values: Record<string, unknown>;
  onChange: (key: string, value: QuickValue) => void;
  onAction?: (key: string) => void;
  onDone: () => void;
  /** Opens the long form; omitted where the long form is already on screen. */
  onAll?: () => void;
  saving?: boolean;
  idPrefix?: string;
};

export function QuickEditSheet({ spec, values, onChange, onAction, onDone, onAll, saving = false, idPrefix = 'qe' }: Props) {
  return (
    <Modal title={spec.title} onClose={onDone} maxWidth={520}>
      <div className="space-y-3" data-testid="quick-edit">
        {spec.note && <p className="text-xs text-[var(--color-text-muted)]">{spec.note}</p>}
        {spec.inputs.map((input) => {
          const id = `${idPrefix}-${input.key}`;
          const value = values[input.key];
          if (input.kind === 'chips') {
            const picked = Array.isArray(value) ? (value as string[]) : [];
            const max = input.max ?? Infinity;
            return (
              <div key={input.key} role="group" aria-label={input.label} data-testid={`${idPrefix}-chips`}>
                <span className={labelClass}>{input.label}</span>
                <div className="flex flex-wrap gap-2">
                  {(input.options ?? []).map((o) => {
                    const on = picked.includes(o.value);
                    const full = !on && picked.length >= max;
                    return (
                      <button key={o.value} type="button" aria-pressed={on} disabled={full} onClick={() => onChange(input.key, on ? picked.filter((k) => k !== o.value) : [...picked, o.value])}
                        className={['h-8 min-h-[32px] px-3 rounded-full border text-xs font-bold tracking-wide', on ? 'bg-[var(--color-primary)] border-[var(--color-primary)] text-[var(--color-on-primary)]' : 'bg-[var(--color-surface)] border-[var(--color-border)] text-[var(--color-text)] disabled:opacity-40'].join(' ')}>{o.label}</button>
                    );
                  })}
                </div>
                {input.hint && <p className="text-xs text-[var(--color-text-muted)] mt-1">{input.hint}</p>}
              </div>
            );
          }
          if (input.kind === 'switch') {
            return (
              <div key={input.key}>
                <label className="flex items-center gap-3 min-h-[44px] cursor-pointer">
                  <input id={id} type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(input.key, e.target.checked)} className="w-5 h-5 shrink-0 accent-[var(--color-primary)]" />
                  <span className="text-sm font-semibold text-[var(--color-text)]">{input.label}</span>
                </label>
                {input.hint && <p className="text-xs text-[var(--color-text-muted)] -mt-1 ml-8">{input.hint}</p>}
              </div>
            );
          }
          return (
            <div key={input.key}>
              <label className={labelClass} htmlFor={id}>{input.label}</label>
              {input.kind === 'select' ? (
                <select id={id} value={str(value)} onChange={(e) => onChange(input.key, input.numeric ? (e.target.value === '' ? null : Number(e.target.value)) : e.target.value)} className={fieldClass}>
                  {(input.options ?? []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              ) : input.kind === 'textarea' ? (
                <textarea id={id} rows={2} dir={input.dir} maxLength={input.maxLength} value={str(value)} placeholder={input.placeholder} onChange={(e) => onChange(input.key, e.target.value)} className={areaClass} />
              ) : (
                <input id={id} type={input.kind === 'number' ? 'number' : input.kind === 'date' ? 'date' : 'text'} dir={input.dir} maxLength={input.maxLength} min={input.min} max={input.max} step={input.step} inputMode={input.inputMode} value={str(value)} placeholder={input.placeholder}
                  onChange={(e) => onChange(input.key, input.upper ? e.target.value.toUpperCase() : e.target.value)} className={fieldClass} />
              )}
              {input.hint && <p className="text-xs text-[var(--color-text-muted)] mt-1">{input.hint}</p>}
            </div>
          );
        })}
        {spec.actions && spec.actions.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {spec.actions.map((a) => <Btn key={a.key} variant={a.danger ? 'danger-outline' : 'secondary'} small onClick={() => onAction?.(a.key)}>{a.label}</Btn>)}
          </div>
        )}
        {spec.link && <p className="text-xs"><Link to={spec.link.to} className="underline text-[var(--color-tone-rust-text)]">{spec.link.label}</Link></p>}
      </div>
      <ModalActions>
        {onAll && <Btn variant="secondary" small onClick={onAll}>All details</Btn>}
        <Btn onClick={onDone} disabled={saving}>{saving ? 'Saving…' : 'Done'}</Btn>
      </ModalActions>
    </Modal>
  );
}
