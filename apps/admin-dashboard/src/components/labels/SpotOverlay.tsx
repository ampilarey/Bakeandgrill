import type { LabelSpot, LabelSpotKey } from '../../api';

/*
 * Touch zones over a sticker's preview, one per part the server drew (round
 * 3 of the usability work, owner, 2026-10-13: "Still its v confusing and not
 * user friendly"): a tap on the name, the dates or the logo opens the sheet
 * that changes it. The boxes come from the sticker summary or the draft
 * preview (`spots`, LabelSpots on the server), in mm from the label's
 * top-left corner, so a zone sits exactly where the part prints at any
 * preview size; a thin line gets a floor of touchable height.
 */

export const SPOT_NAMES: Record<LabelSpotKey, string> = {
  brand: 'brand and logo',
  heading: 'heading',
  batch_qr: 'pack QR code',
  pack: 'pack number',
  name: 'name',
  promo: 'promotion flash',
  packed: 'packed for',
  photo: 'picture',
  barcode: 'barcode',
  ingredients: 'ingredients',
  how_to_use: 'how to use',
  nutrition: 'nutrition',
  icons: 'allergen pictograms',
  note: 'note',
  dates: 'dates',
  batch: 'batch number',
  qty: 'quantity',
  price: 'price',
  storage: 'storage line',
  footer: 'bottom strip',
};

export function spotName(key: LabelSpotKey): string {
  return SPOT_NAMES[key] ?? key;
}

/** The least of the label's height a zone takes, so a hairline can still be tapped. */
const MIN_SHARE = 0.045;

export function SpotOverlay({ spots, w, h, onPick }: { spots: LabelSpot[]; w: number; h: number; onPick: (key: LabelSpotKey) => void }) {
  return (
    <div className="absolute inset-0" data-testid="spot-overlay">
      {spots.map((s, i) => {
        const hh = Math.max(s.h, h * MIN_SHARE);
        const ww = Math.max(s.w, w * MIN_SHARE);
        const top = s.y - (hh - s.h) / 2;
        const left = s.x - (ww - s.w) / 2;
        return (
          <button key={`${s.key}-${i}`} type="button" onClick={() => onPick(s.key)} aria-label={`Change the ${spotName(s.key)}`} title={`Change the ${spotName(s.key)}`}
            style={{ position: 'absolute', left: `${(left / w) * 100}%`, top: `${(top / h) * 100}%`, width: `${(ww / w) * 100}%`, height: `${(hh / h) * 100}%` }}
            className="rounded-sm border border-transparent hover:border-[var(--color-primary)] focus-visible:border-[var(--color-primary)] hover:bg-[color-mix(in_srgb,var(--color-primary)_12%,transparent)] cursor-pointer" />
        );
      })}
    </div>
  );
}
