import { useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import type { LabelSpot, LabelSpotKey } from '../../api';

/*
 * Touch zones over a sticker's preview, one per part the server drew (round
 * 3 of the usability work, owner, 2026-10-13: "Still its v confusing and not
 * user friendly"): a tap on the name, the dates or the logo opens the sheet
 * that changes it. The boxes come from the sticker summary or the draft
 * preview (`spots`, LabelSpots on the server), in mm from the label's
 * top-left corner, so a zone sits exactly where the part prints at any
 * preview size; a thin line gets a floor of touchable height.
 *
 * In move mode (the drag designer, round 8) the same zones are handles: drag
 * one to move the part, drag its corner to resize it, or nudge it with the
 * arrow keys and + / −. The host turns the mm it is told into a layout
 * override (labelLayout.ts) and the preview redraws with the part there. A
 * part the server marks `fixed` has no run of pieces to move and stays put.
 */

export const SPOT_NAMES: Record<LabelSpotKey, string> = {
  brand: 'brand and logo',
  heading: 'heading',
  batch_qr: 'pack QR code',
  pack: 'pack number',
  name: 'name',
  promo: 'promotion flash',
  badges: 'badges',
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
/** A drag shorter than this, in mm, is a tap that slipped. */
const DEAD_MM = 0.3;
/** A keyboard nudge, in mm, and the resize step. */
const STEP_MM = 1;
const STEP_SCALE = 1.1;

type Drag = { i: number; id: number; x0: number; y0: number; dx: number; dy: number; corner: boolean };

export function SpotOverlay({ spots, w, h, onPick, mode = 'tap', onMove, onScale }: {
  spots: LabelSpot[];
  w: number;
  h: number;
  onPick: (key: LabelSpotKey) => void;
  /** tap opens a part's boxes; move drags the parts about (the drag designer). */
  mode?: 'tap' | 'move';
  /** A part dragged, in mm from where it was. */
  onMove?: (key: LabelSpotKey, dx: number, dy: number) => void;
  /** A part resized, as a factor of its size. */
  onScale?: (key: LabelSpotKey, factor: number) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  /** Pixels per mm as the preview stands; 1 when it has no size yet. */
  const pxPerMm = () => {
    const width = root.current?.getBoundingClientRect().width ?? 0;
    return width > 0 && w > 0 ? width / w : 1;
  };

  const start = (i: number, corner: boolean) => (e: ReactPointerEvent<HTMLElement>) => {
    if (mode !== 'move' || spots[i].fixed) return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setDrag({ i, id: e.pointerId, x0: e.clientX, y0: e.clientY, dx: 0, dy: 0, corner });
  };
  // The corner sits inside its zone: each event is handled where it lands and goes no further up.
  const move = (e: ReactPointerEvent<HTMLElement>) => {
    if (!drag || e.pointerId !== drag.id) return;
    e.stopPropagation();
    setDrag({ ...drag, dx: e.clientX - drag.x0, dy: e.clientY - drag.y0 });
  };
  const end = (e: ReactPointerEvent<HTMLElement>) => {
    if (!drag || e.pointerId !== drag.id) return;
    e.stopPropagation();
    const s = spots[drag.i];
    const k = pxPerMm();
    const dx = (e.clientX - drag.x0) / k;
    const dy = (e.clientY - drag.y0) / k;
    setDrag(null);
    if (drag.corner) {
      const widthPx = Math.max(1, s.w * k);
      const factor = (widthPx + (e.clientX - drag.x0)) / widthPx;
      if (Math.abs(factor - 1) > 0.01) onScale?.(s.key, factor);
      return;
    }
    if (Math.hypot(dx, dy) >= DEAD_MM) onMove?.(s.key, dx, dy);
  };
  const keys = (s: LabelSpot) => (e: KeyboardEvent<HTMLElement>) => {
    if (mode !== 'move' || s.fixed) return;
    const step = e.shiftKey ? STEP_MM * 5 : STEP_MM;
    const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (moves[e.key]) { e.preventDefault(); onMove?.(s.key, ...moves[e.key]); return; }
    if (e.key === '+' || e.key === '=') { e.preventDefault(); onScale?.(s.key, STEP_SCALE); return; }
    if (e.key === '-' || e.key === '_') { e.preventDefault(); onScale?.(s.key, 1 / STEP_SCALE); }
  };

  return (
    <div ref={root} className="absolute inset-0" data-testid="spot-overlay" data-mode={mode}>
      {spots.map((s, i) => {
        const hh = Math.max(s.h, h * MIN_SHARE);
        const ww = Math.max(s.w, w * MIN_SHARE);
        const top = s.y - (hh - s.h) / 2;
        const left = s.x - (ww - s.w) / 2;
        const box = { left: `${(left / w) * 100}%`, top: `${(top / h) * 100}%`, width: `${(ww / w) * 100}%`, height: `${(hh / h) * 100}%` };
        if (mode !== 'move') {
          return (
            <button key={`${s.key}-${i}`} type="button" onClick={() => onPick(s.key)} aria-label={`Change the ${spotName(s.key)}`} title={`Change the ${spotName(s.key)}`}
              style={{ position: 'absolute', ...box }}
              className="rounded-sm border border-transparent hover:border-[var(--color-primary)] focus-visible:border-[var(--color-primary)] hover:bg-[color-mix(in_srgb,var(--color-primary)_12%,transparent)] cursor-pointer" />
          );
        }
        const dragging = drag !== null && drag.i === i;
        const shift = dragging && !drag.corner ? `translate(${drag.dx}px, ${drag.dy}px)` : undefined;
        if (s.fixed) {
          return (
            <div key={`${s.key}-${i}`} aria-hidden title={`The ${spotName(s.key)} stays where the design puts it`} data-testid="spot-fixed"
              style={{ position: 'absolute', ...box }} className="rounded-sm border border-dashed border-[var(--color-border)] opacity-60" />
          );
        }
        return (
          <div key={`${s.key}-${i}`} role="button" tabIndex={0} aria-label={`Move the ${spotName(s.key)}`} title={`Drag to move the ${spotName(s.key)}; drag the corner to resize`}
            onPointerDown={start(i, false)} onPointerMove={move} onPointerUp={end} onPointerCancel={() => setDrag(null)} onKeyDown={keys(s)}
            style={{ position: 'absolute', ...box, transform: shift, touchAction: 'none', cursor: dragging ? 'grabbing' : 'grab' }}
            className={['rounded-sm border border-dashed focus-visible:border-solid', dragging ? 'border-[var(--color-primary)] bg-[color-mix(in_srgb,var(--color-primary)_18%,transparent)]' : 'border-[var(--color-primary)] bg-[color-mix(in_srgb,var(--color-primary)_8%,transparent)] hover:bg-[color-mix(in_srgb,var(--color-primary)_14%,transparent)]'].join(' ')}>
            <span role="presentation" aria-label={`Resize the ${spotName(s.key)}`} data-testid="spot-corner" title={`Drag to resize the ${spotName(s.key)}`}
              onPointerDown={start(i, true)} onPointerMove={move} onPointerUp={end} onPointerCancel={() => setDrag(null)}
              style={{ position: 'absolute', right: -5, bottom: -5, width: 12, height: 12, touchAction: 'none', cursor: 'nwse-resize' }}
              className="rounded-sm bg-[var(--color-primary)] border border-[var(--color-on-primary)]" />
          </div>
        );
      })}
    </div>
  );
}
