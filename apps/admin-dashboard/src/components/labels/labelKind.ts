import type { LabelPreset, PouchCatalogue } from '../../api';
import { designFor, sizeOf, withPreset, type SizeChoice } from './labelSize';
import { pouchFits } from './PouchPicker';

/**
 * What kind of label a custom label is (owner, 2026-11-25: "When i select wrap
 * around but preview doesn't show it… at the top i see circle and rectangle.
 * But bottom i see other sections"). The kind was never stored as one thing: a
 * pouch label is `label_pouch`, a tub's lid or side is `label_part`, and a
 * wrap-around label is simply a wide, short size. So the editor reads the kind
 * from those three, and picking a kind sets them together, the size included,
 * which is what makes the preview draw it.
 */
export type LabelKind = 'ordinary' | 'pouch' | 'wrap' | 'lid' | 'side';

export const LABEL_KINDS: Array<{ key: LabelKind; label: string; about: string }> = [
  { key: 'ordinary', label: 'Sticker', about: 'The usual label, round or rectangle, in any size.' },
  { key: 'pouch', label: 'Pouch or bag', about: 'The front of a zip pouch: the photo in a circle, the name in script and how it is cooked.' },
  { key: 'wrap', label: 'Wrap-around', about: 'A wide, short label round a bottle or jar, its parts side by side as strips.' },
  { key: 'lid', label: 'Tub lid', about: 'A round label for the lid: the name and the photo. The details go on the side label.' },
  { key: 'side', label: 'Tub side', about: 'A rectangle for the side of a tub, with the ingredients, the dates and the rest.' },
];

type Has = { label_part: 'lid' | 'side' | null; label_pouch: unknown };

export function kindOf(d: Has, choice: SizeChoice, presets: LabelPreset[]): LabelKind {
  if (d.label_part === 'lid') return 'lid';
  if (d.label_part === 'side') return 'side';
  if (d.label_pouch) return 'pouch';
  const { w, h } = sizeOf(choice, presets);
  return designFor(choice.shape, w, h) === 'wrap' ? 'wrap' : 'ordinary';
}

/** The size a kind needs: the one picked when it already draws that kind, else the usual size for it. */
export function sizeForKind(kind: LabelKind, choice: SizeChoice, presets: LabelPreset[], pouch: PouchCatalogue): SizeChoice {
  const { w, h } = sizeOf(choice, presets);
  const design = designFor(choice.shape, w, h);
  // The usual size for a kind: its one-tap size, or the same millimetres typed in where that size is not offered.
  const to = (preset: string, shape: 'rect' | 'circle', pw: number, ph: number): SizeChoice => (
    presets.some((p) => p.id === preset)
      ? withPreset(choice, preset, presets)
      : { ...choice, shape, preset: 'custom', w: pw, h: ph, on: choice.on === 'printer' ? 'printer' : 'sheet' }
  );
  switch (kind) {
    // A bottle's wrap size is wide enough for a pouch label too, but it is not a pouch's shape: go to the pouch's own.
    case 'pouch': return pouchFits(pouch, choice.shape, w, h) && design !== 'wrap' ? choice : to('r140x62', 'rect', 140, 62);
    case 'wrap': return design === 'wrap' ? choice : to('r180x40', 'rect', 180, 40);
    case 'lid': return choice.shape === 'circle' ? choice : to('c80', 'circle', 80, 80);
    case 'side': return choice.shape === 'rect' && design !== 'wrap' ? choice : to('r100x50', 'rect', 100, 50);
    default: return design === 'wrap' ? to('r105x148', 'rect', 105, 148.5) : choice;
  }
}
