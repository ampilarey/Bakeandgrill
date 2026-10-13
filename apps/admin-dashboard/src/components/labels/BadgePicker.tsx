import type { LabelBadge } from '../../api';

/*
 * Badges (round 9 of the usability work, owner, 2026-10-13: "badges you drop
 * on: Halal, Spicy, New, Gluten-free, drawn in the brand style"): up to four
 * from a fixed set, kept with the product (`label_badges`) and printed as
 * rust pills under the name on every size with the room. The set comes
 * with the layouts (LabelBadges::catalogue()); this list stands in until it
 * arrives.
 */

export const MAX_BADGES = 4;

export const BADGE_FALLBACK: LabelBadge[] = [
  { key: 'halal', label: 'Halal', word: 'HALAL', word_dv: 'ހަލާލް' },
  { key: 'spicy', label: 'Spicy', word: 'SPICY', word_dv: 'ކުޅި' },
  { key: 'new', label: 'New', word: 'NEW', word_dv: 'އާ' },
  { key: 'gluten_free', label: 'Gluten-free', word: 'GLUTEN-FREE', word_dv: 'ގްލޫޓަން ނުހިމެނޭ' },
  { key: 'vegan', label: 'Vegan', word: 'VEGAN', word_dv: 'ވީގަން' },
  { key: 'vegetarian', label: 'Vegetarian', word: 'VEGETARIAN', word_dv: 'ވެޖިޓޭރިއަން' },
  { key: 'sugar_free', label: 'Sugar-free', word: 'SUGAR-FREE', word_dv: 'ހަކުރު ނުހިމެނޭ' },
  { key: 'dairy_free', label: 'Dairy-free', word: 'DAIRY-FREE', word_dv: 'ކިރު ނުހިމެނޭ' },
  { key: 'nut_free', label: 'Nut-free', word: 'NUT-FREE', word_dv: 'ނަޓްސް ނުހިމެނޭ' },
  { key: 'homemade', label: 'Homemade', word: 'HOMEMADE', word_dv: 'ގޭގައި ތައްޔާރުކުރި' },
  { key: 'best_seller', label: 'Best seller', word: 'BEST SELLER', word_dv: 'އެންމެ ވިކޭ' },
];

export function badgeLabel(key: string, catalogue?: LabelBadge[] | null): string {
  return (catalogue && catalogue.length > 0 ? catalogue : BADGE_FALLBACK).find((b) => b.key === key)?.label ?? key;
}

export function BadgePicker({ value, onChange, catalogue, idPrefix = 'badges', max = MAX_BADGES }: {
  value: string[];
  onChange: (keys: string[]) => void;
  catalogue?: LabelBadge[] | null;
  idPrefix?: string;
  max?: number;
}) {
  const list = catalogue && catalogue.length > 0 ? catalogue : BADGE_FALLBACK;
  const toggle = (key: string) => {
    if (value.includes(key)) onChange(value.filter((k) => k !== key));
    else if (value.length < max) onChange([...value, key]);
  };
  return (
    <div role="group" aria-label="Badges" data-testid={idPrefix}>
      <div className="flex flex-wrap gap-2">
        {list.map((b) => {
          const on = value.includes(b.key);
          const full = !on && value.length >= max;
          return (
            <button key={b.key} type="button" onClick={() => toggle(b.key)} aria-pressed={on} disabled={full} title={full ? `Up to ${max} badges` : undefined}
              className={['h-8 min-h-[32px] px-3 rounded-full border text-xs font-bold tracking-wide inline-flex items-center', on ? 'bg-[var(--color-primary)] border-[var(--color-primary)] text-[var(--color-on-primary)]' : 'bg-[var(--color-surface)] border-[var(--color-border)] text-[var(--color-text)] disabled:opacity-40'].join(' ')}>
              {b.word}
            </button>
          );
        })}
      </div>
      <p className="text-xs text-[var(--color-text-muted)] mt-1" data-testid={`${idPrefix}-hint`}>
        {value.length === 0 ? `Up to ${max}, printed as rust pills under the name wherever the size has room.` : `${value.length} of ${max}: ${value.map((k) => badgeLabel(k, list)).join(', ')}.`}
      </p>
    </div>
  );
}
