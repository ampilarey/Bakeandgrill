import { describe, expect, it } from 'vitest';
import EN from './en.json';
import DV from './dv.json';
import MISSING from './dv-missing.json';

/*
 * Every customer-facing string carries Dhivehi (iruali import plan, feature
 * 3a). dv-missing.json lists the keys that had none on 2026-10-17; the list
 * may only shrink. A new key goes into en.json and dv.json together.
 */
const en = EN as Record<string, string>;
const dv = DV as Record<string, string>;
const missing = MISSING as string[];

describe('order app strings', () => {
  it('has Dhivehi for every key, except the ones listed as not yet translated', () => {
    const untranslated = Object.keys(en).filter((k) => !dv[k]?.trim() && !missing.includes(k));
    expect(untranslated, 'add these to i18n/dv.json').toEqual([]);
  });

  it('has no Dhivehi for a key English no longer has', () => {
    expect(Object.keys(dv).filter((k) => !(k in en))).toEqual([]);
  });

  it('keeps the not-yet-translated list short and true', () => {
    const stale = missing.filter((k) => !(k in en) || Boolean(dv[k]?.trim()));
    expect(stale, 'remove these from i18n/dv-missing.json').toEqual([]);
    expect([...missing].sort()).toEqual(missing);
  });

  it('keeps every {placeholder} of the English in the Dhivehi', () => {
    const holes = (s: string) => (s.match(/\{[a-z_]+\}/g) ?? []).sort().join(',');
    const broken = Object.keys(dv).filter((k) => en[k] && holes(en[k]) !== holes(dv[k]));
    expect(broken).toEqual([]);
  });
});
