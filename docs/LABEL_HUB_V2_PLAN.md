# Label Hub v2

**Built 2026-10-05**, steps 1 to 5; the guide is `docs/LABELS.md`.

Owner, 2026-10-04, after the first week with the Label Hub: "Still im not happy
with the label hub. This is what i need to do:" ten points, listed below with
what each becomes. The first build (`docs/LABEL_HUB_PLAN.md`, `docs/LABELS.md`)
stays underneath; this is what changes.

## The ten points

| # | Asked | Built as |
|---|---|---|
| 1 | Labels for different packaging and sizes, all with a common header and footer with the branding, plus the small complaints barcode | Every design (full, compact, round) draws the same header (brand logo, brand name line, label type heading) and footer (brand, tagline, address, phone, website, QR). The QR is `ComplaintBoxLink::url('label')`, the same code as the receipts and the complaint poster. `show_qr` per label type. |
| 2 | Different sizes and shapes, selectable | Label stocks as before, plus round stickers (50 mm and 70 mm circles on A4; any round size on a label printer or custom) and rounded corners on rectangles. `shape` on the stock: `rect`, `rounded`, `circle`. |
| 3 | Label types ("frozen hedhika is a type of food"), easy to select | `label_types`: name, brand, heading (EN/DV), storage and storage line, date wording, use-within line, how-to-use default, note, shelf life, show_qr. Seeded with Frozen, Chilled and Fresh Hedhika from the v1 per-storage wording. An item picks a type (`items.label_type_id`); a sheet can print "as" a type. |
| 4 | Manufacture date, expiry, "use within 2 days" | Per type: `mfg_label`, `exp_label`, `use_within` (EN/DV). Expiry from shelf life as before. Date style (`04/10/2026` or `4 Oct 2026`) is a setting. |
| 5 | Item photo; background-less PNG per item | The item's cut-out (Photos tab, `docs/CUTOUT_THUMBNAILS.md`) already is that and already prints. The Label tab shows it and says where it comes from; `label_photo_media_id` stays as the labels-only override. |
| 6 | Brands with logos (Amma under Bake & Grill) | `label_brands`: name (EN/DV), tagline, PNG logo kept as uploaded, `is_default`. The default brand is Bake & Grill from Business Details. A type belongs to a brand; a sub-brand's footer carries "by Bake & Grill". |
| 7 | Storage | On the type, overridable per item (as v1). |
| 8 | How to use | `how_to_use` (EN/DV) on the type and on the item; a HOW TO USE block under the ingredients on the full sticker, a line on the compact one when there is room. |
| 9 | Ingredients | As v1 (recipe or typed, EN/DV, on the item or the Settings list). |
| 10 | Saved, re-downloaded, reprinted, re-edited | `label_jobs`: a named, saved print request. Saved labels tab: Reprint, Download PDF, Edit (loads the form), Duplicate, Rename, Delete. Box labels too. |

## Steps

1. Brands and types: tables, seed, models, API, Admin tab (Types & brands), item picks a type, sticker reads heading/storage/brand name from the type.
2. Design: brand logo in the header, QR and full contact in every footer, how-to-use, use-within, date wording, date style; full and compact.
3. Shapes: round stocks and the round design; rounded corners.
4. Saved labels: `label_jobs`, save on prepare, Saved labels tab, edit/duplicate/reprint/delete; box labels.
5. Guide, import command, tests, phone and computer check of every stock.

Each step ends with real prints checked on a phone-width screen and in the PDF.

## Decisions

- Types are the source of truth for sticker wording. The v1 per-storage settings
  (`label_header_line*`, `label_storage_*`) seed the three first types and remain
  only as the fallback for an item with no type; they leave the Settings screen.
- Brand logos are stored as the PNG uploaded (`LabelMedia::storePng`), never
  re-encoded, so transparency survives; the same path the legacy import used.
- A sheet printed "as" a type uses that type for every sticker on it; an item's
  own overrides (heading, storage line, note, how-to-use) still win.
- The QR encodes the live site's complaint box, never the host printing it.

## Later: sizes and custom labels (2026-10-11)

Owner: "Add label size. For example rectangular 4 cm by 6 cm, circle 6 cm diameter
ect. Add option to add custom labels using different brands logos and other details.
Not only from the menu list."

- A size is chosen, not a stock: shape, a one-tap size or one typed in, then where it
  prints (A4 sheet, ready-cut, landscape A4, label printer). The old stock keys stay as
  the layouts the presets print with, so saved labels and the print log read as before.
- Any size fills A4 inside a 5 mm edge, upright or landscape, whichever holds more
  (40 × 60 mm: 21). Sizes go down to 30 × 20 mm and 30 mm round.
- Below the compact sticker's room (50 × 60 mm) a third design, `SmallStickerDesign`,
  keeps who it is from, what it is, its dates and how to keep it, and fits the rest in
  order while there is room; rounds under 45 mm drop the ingredients.
- Custom labels are their own table with an item's label columns, so the type
  resolution and the sheet treat them as items; a request item carries `kind`, the
  print log and saved labels keep which kind it was. Their own brand beats the type's
  and a sheet's "Print as" type.
- The picker's mirror of the server's sizing is held to it by a shared table
  (`fixtures/label_size_parity.json`), as the money and permission mirrors are.
