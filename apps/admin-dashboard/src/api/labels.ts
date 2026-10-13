import { req } from './client';

/*
 * Label Hub (owner, 2026-10-04: "I want to print labels like this … accessible
 * to all staff who have the authority"). Print labels and box labels are
 * drawn by the server; these calls get signed links to them and the settings
 * behind them. docs/LABEL_HUB_PLAN.md.
 */

export type LabelStorage = 'frozen' | 'chilled' | 'ambient';
export type IngredientsSource = 'auto' | 'recipe' | 'manual';

export type LabelProduct = {
  id: number;
  name: string;
  name_dv: string | null;
  label_enabled: boolean;
  label_ingredients_source: IngredientsSource;
  label_ingredients: string | null;
  label_ingredients_dv: string | null;
  label_shelf_life_days: number | null;
  label_storage: LabelStorage;
  label_pack_qty: number | null;
  /** The item's own wording; null prints the default for its storage (in `defaults`). */
  label_heading: string | null;
  label_heading_dv: string | null;
  label_storage_line: string | null;
  label_storage_line_dv: string | null;
  label_note: string | null;
  label_note_dv: string | null;
  label_pack_unit: string | null;
  label_type_id: number | null;
  label_type_name: string | null;
  label_how_to_use: string | null;
  label_how_to_use_dv: string | null;
  /** 2026-10-12: the price prints when switched on (the menu price unless one is typed), a barcode (EAN-13 or EAN-8), a net weight. */
  label_price: number | null;
  label_show_price: boolean;
  label_barcode: string | null;
  label_net_weight: string | null;
  /** The nutrition panel (round C): printed when on and the recipe's panel is complete; `nutrition` is the panel as it stands. */
  label_show_nutrition: boolean;
  nutrition: NutritionPanel;
  /** Values per 100 g, or per 100 ml for a drink. */
  label_nutrition_per: NutritionPer;
  /** The wrap-around label's parts (2026-10-12), as they stand (the defaults when nothing is kept). */
  label_wrap: LabelWrap;
  wrap_pictures: WrapPicture[];
  /** The parts moved or resized by hand on the preview, per design (the drag designer, round 8). */
  label_layout: LabelArrangement;
  /** Badges (round 9): keys from the layouts' `badges` catalogue, up to four, printed as rust pills under the name. */
  label_badges: string[];
  menu_price: number;
  /** From the item's Details tab, as words ("tree nuts"): printed bold and as "Contains …". */
  allergens: string[];
  /** What prints when the item's own box is empty: its type's wording, else the storage defaults. */
  defaults: { heading: string; heading_dv: string; storage_line: string; storage_line_dv: string; how_to_use: string; how_to_use_dv: string; note: string; note_dv: string; shelf_life_days: number | null; brand: string; unit: string };
  label_title_media_id: number | null;
  label_title_url: string | null;
  label_photo_media_id: number | null;
  label_photo_url: string | null;
  cutout_url: string | null;
  has_recipe: boolean;
  /** `dv_from` (2026-10-12): typed, from the inventory items' Dhivehi names, or the glossary. */
  ingredients: { en: string; dv: string; from: 'recipe' | 'manual' | 'none'; dv_from?: 'typed' | 'inventory' | 'glossary' | ''; recipe_en: string; recipe_dv: string };
};

export type NutritionPer = 'g' | 'ml';

/** A wrap-around label's parts (owner, 2026-10-12: a bottle label with parts side by side), kept per product. */
export type WrapPartKey = 'brand' | 'legal' | 'nutrition' | 'dates' | 'barcode' | 'qr' | 'marks' | 'text' | 'packed';
export type LabelWrap = {
  parts: WrapPartKey[];
  /** The flavour band along the bottom; its words, else the product name, with the net content at the end. */
  band: boolean;
  band_text: string;
  band_text_dv: string;
  /** Recycling marks (keys from the layouts catalogue) and pictures from the media library, in the marks part. */
  marks: string[];
  pictures: number[];
  text_heading: string;
  text_heading_dv: string;
  text: string;
  text_dv: string;
};
export type WrapPicture = { id: number; url: string | null };

/** The looks a sticker prints in, decided by its size (StickerLayouts::design()). */
export type LabelDesign = 'full' | 'mini' | 'small' | 'round' | 'wrap';
/** A part moved by (dx, dy) mm and scaled by s, about its own top-left corner. */
export type LabelPartOverride = { dx: number; dy: number; s: number };
/**
 * The parts moved or resized by hand on the preview (the drag designer,
 * round 8, 2026-10-13), per design and part: `label_layout`, LabelLayout on the
 * server (the print layouts are LabelLayout here). A wrap-around label is
 * arranged by its strips instead.
 */
export type LabelArrangement = Partial<Record<'full' | 'mini' | 'small' | 'round', Partial<Record<LabelSpotKey, LabelPartOverride>>>>;
export type WrapCatalogue = {
  parts: { key: WrapPartKey; label: string; hint: string }[];
  marks: { key: string; label: string; caption: string }[];
  default_parts: WrapPartKey[];
  default_marks: string[];
  max_pictures: number;
};

/** The values an ingredient carries per 100 g (round C). */
export type NutritionValues = { kcal: number; fat: number; sat_fat: number; carbs: number; sugars: number; protein: number; salt: number };
export const NUTRITION_KEYS = ['kcal', 'fat', 'sat_fat', 'carbs', 'sugars', 'protein', 'salt'] as const;
export type NutritionKey = (typeof NUTRITION_KEYS)[number];
/** A product's panel from its recipe: complete, or which ingredients have no values (`missing`) or no weight in grams (`unweighed`). */
export type NutritionPanel = { complete: boolean; per100: Partial<NutritionValues>; grams: number; missing: string[]; unweighed: string[]; rows: { en: string; grams: number | null; has: boolean }[] };
export type NutritionIngredient = { id: number; name: string; unit: string; nutrition: NutritionValues | null; used_by: string[] };
export type NutritionProduct = { id: number; name: string; show: boolean; complete: boolean; per100: Partial<NutritionValues>; grams: number; missing: string[]; unweighed: string[] };

/** Label Hub v2: who the label is from. The default brand is the business itself. */
export type LabelBrand = {
  id: number; name: string; name_dv: string | null; tagline: string | null; tagline_dv: string | null;
  logo_media_id: number | null; logo_url: string | null; is_default: boolean; sort: number; types_count: number | null;
};

/** Label Hub v2: what kind of food the label is for, with its wording. */
export type LabelType = {
  id: number; brand_id: number | null; brand_name: string | null; name: string;
  heading: string; heading_dv: string | null; storage: LabelStorage; storage_line: string | null; storage_line_dv: string | null;
  use_within: string | null; use_within_dv: string | null; mfg_label: string; exp_label: string;
  how_to_use: string | null; how_to_use_dv: string | null; note: string | null; note_dv: string | null;
  shelf_life_days: number | null; show_qr: boolean;
  /** The footer preset its stickers print by default (owner, 2026-10-12); null prints the brand's. */
  footer_id: number | null;
  is_active: boolean; sort: number; items_count: number | null;
  defaults: { storage_line: string; storage_line_dv: string };
};

/**
 * A sticker footer to pick by name and change in place (owner, 2026-10-12:
 * "No easy option to select and edit branding footer"). A blank line prints
 * the brand's or Business Details' live value, shown in `effective`.
 */
/**
 * A footer preset. The footer is always the business's branding (owner,
 * 2026-10-12): a food brand such as Amma is on the header only, so a footer
 * has no brand of its own and a blank line prints Business Details' value.
 */
/** The looks a footer prints in (owner, 2026-10-12: "different styles"); LabelFooter::STYLES. */
export type LabelFooterStyle = 'dark' | 'light' | 'rust' | 'plain' | 'logo';

export type LabelFooter = {
  id: number; name: string; style: LabelFooterStyle;
  heading: string | null; heading_dv: string | null; tagline: string | null; tagline_dv: string | null;
  phone: string | null; ways: string | null; ways_dv: string | null; website: string | null;
  address: string | null; address_dv: string | null; landmark: string | null; landmark_dv: string | null;
  show_qr: boolean; show_mark: boolean; is_default: boolean; sort: number;
  /** What each line prints, blanks filled in. */
  effective: { name: string; name_dv: string; tagline: string; tagline_dv: string; phone: string; ways: string; ways_dv: string; website: string; address: string; address_dv: string; landmark: string; landmark_dv: string; show_qr: boolean; show_mark: boolean };
  custom_labels_count: number | null; types_count: number | null;
};

export type LabelFooterPayload = Partial<Pick<LabelFooter,
  'name' | 'style' | 'heading' | 'heading_dv' | 'tagline' | 'tagline_dv'
  | 'phone' | 'ways' | 'ways_dv' | 'website' | 'address' | 'address_dv' | 'landmark' | 'landmark_dv' | 'show_qr' | 'show_mark' | 'sort'>>;

export type LabelTypePayload = Partial<Omit<LabelType, 'id' | 'brand_name' | 'items_count' | 'defaults'>>;

export type LabelLayout = {
  key: string; label: string; hint: string;
  /** Null for "any size on A4": it depends on the size. */
  per_page: number | null;
  w: number; h: number; page_w: number; page_h: number; compact: boolean; shape: 'rect' | 'circle';
  /** Takes its label size from the request (w, and h for a rectangle). */
  sized?: boolean;
  /** As many as fit on A4. */
  grid?: boolean;
};

/** Where a label prints: plain A4 cut on the lines, a ready-cut sheet, two on landscape A4, or a label printer. */
export type LabelStock = 'sheet' | 'precut' | 'landscape' | 'printer';

/**
 * A size offered as one tap (owner, 2026-10-11: "Add label size. For example
 * rectangular 4 cm by 6 cm, circle 6 cm diameter"), with the layout that
 * prints it on each stock and how many fit a page.
 */
export type LabelPreset = {
  id: string; shape: 'rect' | 'circle'; w: number; h: number;
  /** "40 × 60 mm", "Round 60 mm". */
  name: string;
  /** "4 × 6 cm", "6 cm across". */
  cm: string;
  design: 'full' | 'mini' | 'small' | 'round' | 'wrap';
  options: { on: LabelStock; layout: string; label: string; per_page: number; landscape: boolean }[];
};

export type LabelLimits = { min_short: number; min_long: number; max_w: number; max_h: number; min_round: number; max_round: number; sheet_margin: number };

/**
 * A label roll or sheet the business owns (round 6, 2026-10-13: "only the
 * sizes you own"; Labels → Settings → My label rolls): a size choice as the
 * picker holds it, with a name of the owner's. Every size picker shows them
 * first and the rest under More sizes. Kept as the JSON setting `label_rolls`.
 */
export type LabelRoll = { id: string; name: string; shape: 'rect' | 'circle'; preset: string; on: LabelStock; w: number; h: number };

/** A badge a product can carry (round 9, 2026-10-13): its key, everyday name and the words printed on the pill. */
export type LabelBadge = { key: string; label: string; word: string; word_dv: string };

export type LabelLayoutsResponse = { data: LabelLayout[]; presets: LabelPreset[]; limits: LabelLimits; wrap: WrapCatalogue; rolls?: LabelRoll[]; badges?: LabelBadge[] };

/**
 * A label template (round 7, 2026-10-13: "Start from a saved label or a
 * built-in template, and Save as template from any label"): a label's
 * settings without the product itself (never the name, pictures, barcode or
 * price) and the size it printed at. Built-in ones carry a string id and
 * `builtin`; saved ones live in `label_templates`. A key left out leaves
 * that box alone when starting from it; one that is null blanks the box.
 */
export type LabelTemplateFields = Partial<{
  brand_id: number | null; label_type_id: number | null; label_storage: LabelStorage | null;
  label_heading: string | null; label_heading_dv: string | null; label_storage_line: string | null; label_storage_line_dv: string | null;
  label_ingredients: string | null; label_ingredients_dv: string | null; label_how_to_use: string | null; label_how_to_use_dv: string | null;
  label_note: string | null; label_note_dv: string | null; footer_id: number | null; label_show_qr: boolean | null; label_lang: StickerLang | null;
  label_shelf_life_days: number | null; label_pack_qty: number | null; label_pack_unit: string | null; label_net_weight: string | null;
  label_allergens: string | null; label_nutrition: string | null; label_nutrition_per: NutritionPer | null; label_wrap: LabelWrap | null;
  label_show_price: boolean | null; label_show_nutrition: boolean | null; label_layout: LabelArrangement | null; label_badges: string[] | null;
}>;
export type LabelTemplateSize = { shape: 'rect' | 'circle'; preset: string; on: LabelStock; w: number; h: number };
export type LabelTemplate = {
  id: number | string; builtin: boolean; name: string; blurb: string | null;
  /** The label it was saved from. */
  source: string | null;
  fields: LabelTemplateFields; wrap_pictures: WrapPicture[]; size: LabelTemplateSize | null;
  /** The names behind the ids, for the list line; `storage` is what its fields or its type say. */
  type_name: string | null; brand_name: string | null; footer_name: string | null; storage: LabelStorage | null;
  created_by: string | null; created_at: string | null;
};
export type LabelTemplatePayload = { name?: string; source?: string | null; fields?: LabelTemplateFields; size?: LabelTemplateSize | null };

/**
 * A pack sticker for something that is not on the menu (owner, 2026-10-11:
 * "Add option to add custom labels using different brands logos and other
 * details. Not only from the menu list"). Its label fields are named as an
 * item's; empty ones print the type's wording (in `defaults`).
 */
export type CustomLabel = {
  id: number; kind: 'custom'; name: string; name_dv: string | null;
  brand_id: number | null; brand_name: string; brand_logo_url: string | null;
  label_type_id: number | null; label_type_name: string | null;
  /** Its own storage; null follows the type. `storage` is what prints. */
  label_storage: LabelStorage | null; storage: LabelStorage;
  label_heading: string | null; label_heading_dv: string | null;
  label_storage_line: string | null; label_storage_line_dv: string | null;
  label_ingredients: string | null; label_ingredients_dv: string | null;
  label_how_to_use: string | null; label_how_to_use_dv: string | null;
  label_note: string | null; label_note_dv: string | null;
  /** The footer preset it prints (owner, 2026-10-12); null prints its brand's footer. */
  footer_id: number | null; footer_name: string | null;
  /** The complaints QR: null follows the footer, then the label type. */
  label_show_qr: boolean | null;
  /** The language it usually prints in; null means English, or both when it has a Dhivehi name. */
  label_lang: StickerLang | null;
  /** From the print log; the list carries them. */
  print_count: number; last_printed_at: string | null;
  label_shelf_life_days: number | null; label_pack_qty: number | null; label_pack_unit: string | null;
  /** 2026-10-12: price, barcode, net weight and the allergens (a comma list, printed bold and as "Contains …"). */
  label_price: number | null; label_barcode: string | null; label_net_weight: string | null; label_allergens: string | null;
  /** A typed nutrition line (round C): "Energy 250 kcal · Fat 12 g …", on the full sticker. */
  label_nutrition: string | null;
  label_nutrition_per: NutritionPer;
  /** The wrap-around label's parts, as they stand. */
  label_wrap: LabelWrap;
  wrap_pictures: WrapPicture[];
  /** The parts moved or resized by hand on the preview, per design (round 8). */
  label_layout: LabelArrangement;
  /** Badges (round 9): up to four keys from the catalogue. */
  label_badges: string[];
  label_photo_media_id: number | null; label_photo_url: string | null;
  label_title_media_id: number | null; label_title_url: string | null;
  defaults: { heading: string; heading_dv: string; storage_line: string; storage_line_dv: string; how_to_use: string; how_to_use_dv: string; note: string; note_dv: string; shelf_life_days: number | null; brand: string; unit: string };
  ingredients: { en: string; dv: string; from: 'manual' | 'none' };
  created_by: string | null; updated_at: string | null;
};

export type CustomLabelPayload = Partial<Pick<CustomLabel,
  'name' | 'name_dv' | 'brand_id' | 'label_type_id' | 'label_storage' | 'label_heading' | 'label_heading_dv'
  | 'label_storage_line' | 'label_storage_line_dv' | 'label_ingredients' | 'label_ingredients_dv'
  | 'label_how_to_use' | 'label_how_to_use_dv' | 'label_note' | 'label_note_dv'
  | 'footer_id' | 'label_show_qr' | 'label_lang'
  | 'label_shelf_life_days' | 'label_pack_qty' | 'label_pack_unit' | 'label_photo_media_id' | 'label_title_media_id'
  | 'label_price' | 'label_barcode' | 'label_net_weight' | 'label_allergens' | 'label_nutrition' | 'label_nutrition_per' | 'label_wrap'>> & { label_layout?: LabelArrangement | null; label_badges?: string[] | null };

/** The sticker's languages: English, Dhivehi, or both on one sticker (2026-10-12). */
export type StickerLang = 'en' | 'dv' | 'both';

/** A row's own details on a variable run (round 10, 2026-10-13): printed on that product's stickers instead of the sheet's. */
export type StickerRun = { batch?: string | null; qty?: number | null; mfg?: string | null; exp?: string | null; for?: string | null; for2?: string | null };

export type StickerRequest = {
  /** A menu item, or a custom label when `kind` says so; with its own details on a variable run. */
  items: ({ id: number; copies: number; kind?: 'item' | 'custom' } & StickerRun)[];
  lang?: StickerLang;
  layout?: string;
  w?: number | null;
  h?: number | null;
  fill?: boolean;
  mfg?: string | null;
  exp?: string | null;
  batch?: string | null;
  qty?: number | null;
  pi?: number | null;
  /** Print the whole sheet as this label type. */
  type?: number | null;
  /** One footer preset for the whole sheet (owner, 2026-10-12). */
  footer?: number | null;
  /** Rounded corners on a rectangle's cut line. */
  rounded?: boolean;
  preview?: boolean;
  /** Packed for (2026-10-12): who the packs are for, and a second line (the delivery, the date). */
  for?: string | null;
  for2?: string | null;
  /** A promotion flash (2026-10-12): an old and new price, or a short line of words. */
  promo?: PromoKind | null;
  promo_was?: number | null;
  promo_now?: number | null;
  promo_text?: string | null;
  /** Round C: "Pack 3 of 40" on each copy; crop marks, and a bleed in mm (0–5) around a single label; the label printer's dots per inch. */
  number?: boolean;
  marks?: boolean;
  bleed?: number | null;
  dpi?: PrinterDpi | null;
};

export type PromoKind = '' | 'was_now' | 'text';
export type PrinterDpi = 203 | 300;
export type PrinterLanguage = 'zpl' | 'tspl';
/** How the admin reaches a label printer (round C): through the print agent on this computer (scripts/label-print-agent.mjs), kept in this browser. */
export type PrinterSetup = { language: PrinterLanguage; dpi: PrinterDpi; agent: string; host: string; port: number };
export const PRINTER_SETUP_KEY = 'labels.printer';
export const DEFAULT_PRINTER_SETUP: PrinterSetup = { language: 'tspl', dpi: 203, agent: 'http://127.0.0.1:9110', host: '', port: 9100 };
export function readPrinterSetup(): PrinterSetup {
  try {
    const raw = localStorage.getItem(PRINTER_SETUP_KEY);
    if (!raw) return DEFAULT_PRINTER_SETUP;
    const p = JSON.parse(raw) as Partial<PrinterSetup>;
    return {
      language: p.language === 'zpl' ? 'zpl' : 'tspl',
      dpi: p.dpi === 300 ? 300 : 203,
      agent: typeof p.agent === 'string' && p.agent.trim() ? p.agent.trim() : DEFAULT_PRINTER_SETUP.agent,
      host: typeof p.host === 'string' ? p.host.trim() : '',
      port: Number.isFinite(Number(p.port)) && Number(p.port) > 0 ? Number(p.port) : 9100,
    };
  } catch { return DEFAULT_PRINTER_SETUP; }
}
export function savePrinterSetup(setup: PrinterSetup) {
  try { localStorage.setItem(PRINTER_SETUP_KEY, JSON.stringify(setup)); } catch { /* a private window keeps nothing */ }
}
/** Hand a signed printer-language link to the print agent, which fetches it and sends the bytes to the printer. */
export async function sendToLabelPrinter(url: string, setup: PrinterSetup = readPrinterSetup()): Promise<{ ok: true; bytes: number }> {
  if (!setup.host.trim()) throw new Error('Type the printer\'s address under Labels → Settings → Label printer.');
  let res: Response;
  try {
    res = await fetch(`${setup.agent.replace(/\/$/, '')}/print`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: `${window.location.origin}${url}`, host: setup.host.trim(), port: setup.port }),
    });
  } catch {
    throw new Error('The print agent is not running on this computer. Start it (scripts/label-print-agent.mjs), or download the file and send it to the printer yourself.');
  }
  const body = (await res.json().catch(() => ({}))) as { ok?: boolean; bytes?: number; error?: string };
  if (!res.ok || !body.ok) throw new Error(body.error || 'The print agent could not reach the printer.');
  return { ok: true, bytes: body.bytes ?? 0 };
}

/** What a wholesale delivery or a catering event fills in on Print labels (2026-10-12). */
export type PackedForPrefill = {
  for: string; for2: string;
  items: { id: number; name: string; copies: number; label_enabled: boolean }[];
};

/** A word of the ingredient glossary, English → Dhivehi (2026-10-12). */
export type GlossaryWord = { id: number; en: string; word: string; dv: string };
/** An ingredient word on a label that has no Dhivehi yet, and the products using it. */
export type GlossaryMissing = { word: string; products: string[] };

/**
 * Where a wrap-around label's strips land (round 2, 2026-10-13): each part
 * that prints with its box in mm from the label's top-left corner, the band's
 * box, and the parts asked for that were left out and why (empty: nothing to
 * print; narrow: no room even squeezed).
 */
export type WrapStrips = {
  strips: { part: WrapPartKey; x: number; y: number; w: number; h: number }[];
  band: { x: number; y: number; w: number; h: number } | null;
  left_out: Partial<Record<WrapPartKey, 'empty' | 'narrow'>>;
};

/**
 * The parts of a sticker a tap can open (round 3, 2026-10-13: "tap to edit on
 * every label"); LabelSpots::KEYS. `batch_qr` is the pack page's code in the
 * header; the complaints QR belongs to the footer.
 */
export type LabelSpotKey = 'brand' | 'heading' | 'batch_qr' | 'pack' | 'name' | 'promo' | 'badges' | 'packed' | 'photo' | 'barcode' | 'ingredients' | 'how_to_use' | 'nutrition' | 'icons' | 'note' | 'dates' | 'batch' | 'qty' | 'price' | 'storage' | 'footer';

/** Where a part of the first sticker landed, in mm from its top-left corner; a part drawn in two places comes twice. `fixed`: a box of its own that the drag designer cannot move. */
export type LabelSpot = { key: LabelSpotKey; x: number; y: number; w: number; h: number; fixed?: boolean };

export type StickerSummary = {
  layout: string;
  label: string;
  design: LabelDesign;
  shape?: 'rect' | 'circle';
  w?: number;
  h?: number;
  stickers: number;
  pages: number;
  per_page: number;
  /** `code`: the print's code (2026-10-12), which its stickers carry as a QR; null on a preview. */
  products: { id: number; kind?: 'item' | 'custom'; key?: string; name: string; copies: number; mfg: string | null; exp: string | null; shelf_life_days: number | null; ingredients_from: string; code?: string | null;
    /** What the row prints with (round 10): its own details where it has them (`varied`), else the sheet's. */
    batch?: string; qty?: number | null; for?: string; for2?: string; varied?: boolean }[];
  /** On a wrap-around label: the first product's strips. */
  wrap?: WrapStrips | null;
  /** On every other design: where the first product's parts are, for the preview's touch zones (empty on a wrap label). */
  spots?: LabelSpot[];
};

export type SheetLinks = {
  url: string;
  /** A preview only: the first sticker alone, at its own size. */
  one_url?: string | null;
  view_url: string;
  pdf_url: string;
  /** Round C: the sheet for a label printer (one sticker a page only; null on a preview). */
  zpl_url?: string | null;
  tspl_url?: string | null;
  raster_url?: string | null;
  expires_in_minutes: number;
  job?: { id: number; name: string };
};

/** A saved label (v2 point 10): a prepared print kept with its request. */
export type LabelJob = {
  id: number; kind: 'stickers' | 'box'; name: string;
  /** A favourite (2026-10-12): leads Saved labels and Print again. */
  pinned: boolean;
  summary: (StickerSummary | { label: string; customer: string; when: string; lines: { name: string; qty: number }[] }) | null;
  print_count: number; last_printed_at: string | null; created_at: string; created_by: string | null;
};
export type LabelJobFull = LabelJob & { request: Record<string, unknown> };

export type BoxFields = {
  customer?: string; attn?: string; contact?: string;
  boat?: string; boat2?: string; pickup?: string; pickup2?: string; when?: string; when2?: string;
  po?: string; box?: string; of?: string;
  /** Picks the badge and the default heading and strip; heading and strip override them. */
  storage?: LabelStorage; heading?: string; strip?: string;
};

export type BoxRequest = BoxFields & {
  delivery?: number | null;
  /** article: the shop's own name for the line; empty prints the usual one. */
  lines?: { id: number; qty: number; article?: string }[];
  articles?: boolean;
  /** A look only: nothing is logged or saved. */
  preview?: boolean;
};

/** A box label line as the server fills it: the shop's article name, and the usual one to fall back on. */
export type BoxLine = { id: number; qty: number; name: string; article: string; default_article: string };

export type BoxPrefill = { trade_account_id: number; saved: boolean; fields: BoxFields; lines: BoxLine[] };

export type LabelShop = { id: number; shop_name: string; saved: boolean };

export type LabelPrintRow = {
  id: number;
  kind: 'sticker_en' | 'sticker_dv' | 'sticker_both' | 'box_label';
  layout: string;
  /** The stock in words, with the size it printed at ("40 × 60 mm, 21 on A4"). */
  stock?: string;
  /** A custom label rather than a menu item. */
  custom?: boolean;
  item: string | null;
  delivery: string | null;
  copies: number;
  mfg_date: string | null;
  exp_date: string | null;
  batch_code: string | null;
  pack_qty: number | null;
  details: Record<string, unknown> | null;
  printed_by: string | null;
  created_at: string;
  /** The sticker's code and the pack page it opens (2026-10-12), stickers only. */
  code?: string | null;
  batch_url?: string | null;
};

/**
 * Printed stock near its expiry (2026-10-12): one row per product, batch and
 * date from the print log, soonest first; `days_left` is negative once past.
 */
export type ExpiringLabelGroup = {
  key: string; kind: 'item' | 'custom' | 'gone'; id: number | null; name: string;
  copies: number; prints: number; batch_code: string | null; mfg_date: string | null; exp_date: string; days_left: number;
  /** The newest prints' codes, for the pack pages. */
  codes: string[];
  last_printed_at: string | null;
  /** The owners have been told (the daily alert). */
  alerted: boolean;
};

export type LabelSettingsMap = Record<string, string>;

export function fetchLabelProducts(all = false) {
  return req<{ data: LabelProduct[] }>(`/labels/products${all ? '?all=1' : ''}`);
}

export function fetchLabelItem(id: number) {
  return req<{ data: LabelProduct }>(`/labels/items/${id}`);
}

export function updateItemLabel(id: number, body: Partial<Omit<LabelProduct, 'id' | 'name' | 'name_dv' | 'ingredients' | 'has_recipe' | 'allergens' | 'cutout_url' | 'label_title_url' | 'label_photo_url' | 'label_layout'>> & { label_layout?: LabelArrangement | null; label_badges?: string[] | null }) {
  return req<{ data: LabelProduct }>(`/items/${id}/label`, { method: 'PUT', body: JSON.stringify(body) });
}

export function fetchLabelLayouts() {
  return req<LabelLayoutsResponse>('/labels/layouts');
}

export function fetchCustomLabels() {
  return req<{ data: CustomLabel[] }>('/labels/custom');
}

export function createCustomLabel(body: CustomLabelPayload) {
  return req<{ data: CustomLabel }>('/labels/custom', { method: 'POST', body: JSON.stringify(body) });
}

export function updateCustomLabel(id: number, body: CustomLabelPayload) {
  return req<{ data: CustomLabel }>(`/labels/custom/${id}`, { method: 'PUT', body: JSON.stringify(body) });
}

/** The picture (slot photo) or the hand-lettered name (slot title): a PNG kept exactly as uploaded. */
export function uploadCustomLabelPicture(id: number, file: File, slot: 'photo' | 'title' = 'photo') {
  const form = new FormData();
  form.append('file', file);
  form.append('slot', slot);
  return req<{ data: CustomLabel }>(`/labels/custom/${id}/picture`, { method: 'POST', body: form });
}

export function duplicateCustomLabel(id: number) {
  return req<{ data: CustomLabel }>(`/labels/custom/${id}/duplicate`, { method: 'POST' });
}

export function deleteCustomLabel(id: number) {
  return req<{ ok: true }>(`/labels/custom/${id}`, { method: 'DELETE' });
}

export function stickerLinks(body: StickerRequest) {
  return req<SheetLinks & { summary: StickerSummary }>('/labels/stickers/url', { method: 'POST', body: JSON.stringify(body) });
}

export function boxLabelLinks(body: BoxRequest) {
  return req<SheetLinks>('/labels/box/url', { method: 'POST', body: JSON.stringify(body) });
}

export function fetchDeliveryBoxLabel(deliveryId: number) {
  return req<{ data: BoxPrefill & { delivery: number; delivery_number: string } }>(`/labels/deliveries/${deliveryId}/box-label`);
}

export function fetchLabelShops() {
  return req<{ data: LabelShop[] }>('/labels/shops');
}

export function fetchShopBoxLabel(accountId: number) {
  return req<{ data: BoxPrefill }>(`/labels/shops/${accountId}/box-label`);
}

/** Keep the label as the shop's box label: who, boat, pick-up, window, and its items with their article names. */
export function saveShopBoxLabel(accountId: number, body: BoxFields & { items: { id: number; article?: string }[] }) {
  return req<{ data: BoxPrefill }>(`/labels/shops/${accountId}/box-label`, { method: 'PUT', body: JSON.stringify(body) });
}

/** Packed-for stickers from a wholesale delivery: the shop, the delivery and its date, a sticker per pack sent. */
export function fetchDeliveryStickers(deliveryId: number) {
  return req<{ data: PackedForPrefill & { delivery: number; delivery_number: string } }>(`/labels/deliveries/${deliveryId}/stickers`);
}

/** Packed-for stickers from a catering event: who it is for, the event and its date, a sticker per pack. */
export function fetchCateringStickers(cateringId: number) {
  return req<{ data: PackedForPrefill & { catering: number; reference: string } }>(`/labels/catering/${cateringId}/stickers`);
}

export function fetchLabelGlossary() {
  return req<{ data: GlossaryWord[]; missing: GlossaryMissing[] }>('/labels/glossary');
}

/** Add a word, or give a listed word its Dhivehi again (the same English is one row). */
export function saveGlossaryWord(body: { en: string; dv: string }) {
  return req<{ data: GlossaryWord }>('/labels/glossary', { method: 'POST', body: JSON.stringify(body) });
}

export function updateGlossaryWord(id: number, body: Partial<{ en: string; dv: string }>) {
  return req<{ data: GlossaryWord }>(`/labels/glossary/${id}`, { method: 'PUT', body: JSON.stringify(body) });
}

export function deleteGlossaryWord(id: number) {
  return req<{ ok: true }>(`/labels/glossary/${id}`, { method: 'DELETE' });
}

/** Nutrition per 100 g (round C): the ingredients label-enabled recipes use, and each product's panel as it stands. */
export function fetchLabelNutrition() {
  return req<{ data: NutritionIngredient[]; products: NutritionProduct[]; fields: Record<NutritionKey, string> }>('/labels/nutrition');
}

export function saveIngredientNutrition(inventoryItemId: number, body: Partial<Record<NutritionKey, number | string | null>>) {
  return req<{ data: Omit<NutritionIngredient, 'used_by'> }>(`/labels/nutrition/${inventoryItemId}`, { method: 'PUT', body: JSON.stringify(body) });
}

export function fetchProductionStickers(productionItemId: number) {
  return req<{ data: { pi: number; item: { id: number; name: string; label_enabled: boolean; label_shelf_life_days: number | null } | null; batch: string; exp: string | null; mfg: string | null; qty: number } }>(`/labels/production-items/${productionItemId}`);
}

export function fetchLabelJobs(params: { page?: number; kind?: string; q?: string; pinned?: boolean } = {}) {
  const qs = new URLSearchParams();
  if (params.page) qs.set('page', String(params.page));
  if (params.kind) qs.set('kind', params.kind);
  if (params.q) qs.set('q', params.q);
  if (params.pinned) qs.set('pinned', '1');
  return req<{ data: LabelJob[]; current_page: number; last_page: number; total: number }>(`/labels/jobs${qs.toString() ? `?${qs}` : ''}`);
}

export function fetchLabelJob(id: number) {
  return req<{ data: LabelJobFull }>(`/labels/jobs/${id}`);
}

export function renameLabelJob(id: number, name: string) {
  return req<{ data: LabelJob }>(`/labels/jobs/${id}`, { method: 'PUT', body: JSON.stringify({ name }) });
}

/** Pin (favourite) a saved label so it leads the list and Print again (2026-10-12). */
export function pinLabelJob(id: number, pinned: boolean) {
  return req<{ data: LabelJob }>(`/labels/jobs/${id}`, { method: 'PUT', body: JSON.stringify({ pinned }) });
}

/**
 * A custom label as it is being written, drawn before it is saved
 * (2026-10-12): the server keeps the draft for half an hour and the link
 * names it. Nothing is saved or logged.
 */
export function previewCustomDraft(body: CustomLabelPayload & { layout?: string; w?: number | null; h?: number | null; lang?: StickerLang }) {
  return req<{ one_url: string; url: string; expires_in_minutes: number; design?: StickerSummary['design']; wrap?: WrapStrips | null; spots?: LabelSpot[] }>('/labels/custom/preview', { method: 'POST', body: JSON.stringify(body) });
}

/** Print a saved label again: stickers with dates get today's made-on date. */
export function printLabelJob(id: number) {
  return req<SheetLinks & { summary: unknown }>(`/labels/jobs/${id}/print`, { method: 'POST' });
}

export function duplicateLabelJob(id: number) {
  return req<{ data: LabelJobFull }>(`/labels/jobs/${id}/duplicate`, { method: 'POST' });
}

export function deleteLabelJob(id: number) {
  return req<{ ok: true }>(`/labels/jobs/${id}`, { method: 'DELETE' });
}

export function fetchLabelPrints(params: { page?: number; kind?: string } = {}) {
  const qs = new URLSearchParams();
  if (params.page) qs.set('page', String(params.page));
  if (params.kind) qs.set('kind', params.kind);
  return req<{ data: LabelPrintRow[]; current_page: number; last_page: number; total: number }>(`/labels/prints${qs.toString() ? `?${qs}` : ''}`);
}

/** Printed stock expiring within `days` (and expired in the last couple), from the print log. */
export function fetchExpiringLabels(days = 7) {
  return req<{ data: ExpiringLabelGroup[]; days: number; expired_kept_days: number }>(`/labels/expiring?days=${days}`);
}

export function fetchLabelTypes() {
  return req<{ data: LabelType[] }>('/labels/types');
}

export function createLabelType(body: LabelTypePayload) {
  return req<{ data: LabelType }>('/labels/types', { method: 'POST', body: JSON.stringify(body) });
}

export function updateLabelType(id: number, body: LabelTypePayload) {
  return req<{ data: LabelType }>(`/labels/types/${id}`, { method: 'PUT', body: JSON.stringify(body) });
}

export function deleteLabelType(id: number) {
  return req<{ ok: true }>(`/labels/types/${id}`, { method: 'DELETE' });
}

export function fetchLabelBrands() {
  return req<{ data: LabelBrand[] }>('/labels/brands');
}

export function createLabelBrand(body: Partial<Pick<LabelBrand, 'name' | 'name_dv' | 'tagline' | 'tagline_dv' | 'sort'>>) {
  return req<{ data: LabelBrand }>('/labels/brands', { method: 'POST', body: JSON.stringify(body) });
}

export function updateLabelBrand(id: number, body: Partial<Pick<LabelBrand, 'name' | 'name_dv' | 'tagline' | 'tagline_dv' | 'sort' | 'logo_media_id'>>) {
  return req<{ data: LabelBrand }>(`/labels/brands/${id}`, { method: 'PUT', body: JSON.stringify(body) });
}

/** A PNG with a clear background, kept exactly as uploaded. */
export function uploadLabelBrandLogo(id: number, file: File) {
  const form = new FormData();
  form.append('file', file);
  return req<{ data: LabelBrand }>(`/labels/brands/${id}/logo`, { method: 'POST', body: form });
}

export function deleteLabelBrand(id: number) {
  return req<{ ok: true }>(`/labels/brands/${id}`, { method: 'DELETE' });
}

export function fetchLabelFooters() {
  return req<{ data: LabelFooter[] }>('/labels/footers');
}

export function createLabelFooter(body: LabelFooterPayload) {
  return req<{ data: LabelFooter }>('/labels/footers', { method: 'POST', body: JSON.stringify(body) });
}

export function updateLabelFooter(id: number, body: LabelFooterPayload) {
  return req<{ data: LabelFooter }>(`/labels/footers/${id}`, { method: 'PUT', body: JSON.stringify(body) });
}

export function deleteLabelFooter(id: number) {
  return req<{ ok: true }>(`/labels/footers/${id}`, { method: 'DELETE' });
}

/** The saved templates and the built-in ones (round 7). */
export function fetchLabelTemplates() {
  return req<{ data: LabelTemplate[]; builtin: LabelTemplate[] }>('/labels/templates');
}

export function createLabelTemplate(body: LabelTemplatePayload) {
  return req<{ data: LabelTemplate }>('/labels/templates', { method: 'POST', body: JSON.stringify(body) });
}

export function updateLabelTemplate(id: number, body: LabelTemplatePayload) {
  return req<{ data: LabelTemplate }>(`/labels/templates/${id}`, { method: 'PUT', body: JSON.stringify(body) });
}

export function deleteLabelTemplate(id: number) {
  return req<{ ok: true }>(`/labels/templates/${id}`, { method: 'DELETE' });
}

export function fetchLabelSettings() {
  return req<{ data: LabelSettingsMap; defaults: LabelSettingsMap }>('/labels/settings');
}

export function saveLabelSettings(body: LabelSettingsMap) {
  return req<{ data: LabelSettingsMap }>('/labels/settings', { method: 'PUT', body: JSON.stringify(body) });
}

/** Open a signed sheet link (relative to this site) in a new tab. */
/**
 * Owner, 2026-10-04: "Its not printing the correct amount in the A4" from
 * an iPhone. A phone's print dialog does not keep the sheet's exact page
 * size: iOS adds its own paper margins, so the last row of stickers spills
 * onto a second page. Phones and tablets print the PDF instead, which the
 * OS prints at true size.
 */
export function printsViaPdf(ua: string = navigator.userAgent, touchPoints: number = navigator.maxTouchPoints ?? 0): boolean {
  if (/iPhone|iPad|iPod|Android/i.test(ua)) return true;
  // iPadOS reports itself as a Mac; the touch screen gives it away.
  return /Macintosh/.test(ua) && touchPoints > 1;
}

/** Open the sheet to print: the web sheet with its print dialog, or the PDF on a phone or tablet. */
export function openLabelSheet(url: string, pdfUrl?: string) {
  const target = pdfUrl && printsViaPdf() ? pdfUrl : url;
  window.open(`${window.location.origin}${target}`, '_blank', 'noopener');
}

/** Download a signed PDF link. */
export function downloadLabelSheet(url: string) {
  window.location.href = `${window.location.origin}${url}`;
}
