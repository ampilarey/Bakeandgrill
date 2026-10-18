import { describe, expect, it } from 'vitest';
import EN from './en.json';
import DV from './dv.json';

/*
 * Every customer-facing string carries Dhivehi (iruali import plan, feature
 * 3a, 3b). A new key goes into en.json and dv.json together.
 */
const en = EN as Record<string, string>;
const dv = DV as Record<string, string>;

describe('order app strings', () => {
  it('has Dhivehi for every key', () => {
    const untranslated = Object.keys(en).filter((k) => !dv[k]?.trim());
    expect(untranslated, 'add these to i18n/dv.json').toEqual([]);
  });

  it('has no Dhivehi for a key English no longer has', () => {
    expect(Object.keys(dv).filter((k) => !(k in en))).toEqual([]);
  });

  it('keeps every {placeholder} of the English in the Dhivehi', () => {
    const holes = (s: string) => (s.match(/\{[a-z_]+\}/g) ?? []).sort().join(',');
    const broken = Object.keys(dv).filter((k) => en[k] && holes(en[k]) !== holes(dv[k]));
    expect(broken).toEqual([]);
  });
});
