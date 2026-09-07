import { describe, it, expect } from 'vitest';
import { asPacks, describePack, packSizeOf, tidyNumber } from './packDetails';

const aCase = { pack_name: 'Case', pack_size: '210.000000', pack_quantity: '2.000000' };
const loose = { pack_name: null, pack_size: null, pack_quantity: null };

describe('tidyNumber', () => {
  it('drops the stored decimal padding', () => {
    expect(tidyNumber('210.000000')).toBe('210');
    expect(tidyNumber('0.5000')).toBe('0.5');
    expect(tidyNumber(16)).toBe('16');
    expect(tidyNumber(null)).toBe('0');
  });
});

describe('describePack', () => {
  it('says what one pack holds', () => {
    expect(describePack(aCase, 'pcs')).toBe('Case of 210 pcs');
  });

  it('manages without a unit or a name', () => {
    expect(describePack(aCase)).toBe('Case of 210');
    expect(describePack({ pack_size: 12 }, 'kg')).toBe('pack of 12 kg');
  });

  it('says nothing about a line bought loose', () => {
    expect(describePack(loose, 'pcs')).toBeNull();
    expect(packSizeOf(loose)).toBeNull();
    expect(describePack({ pack_name: 'Case', pack_size: 0 })).toBeNull();
  });
});

describe('asPacks', () => {
  it('reads base units back as boxes', () => {
    expect(asPacks(420, aCase, 'pcs')).toBe('2 × Case');
    expect(asPacks('420.0000', aCase, 'pcs')).toBe('2 × Case');
  });

  it('keeps the odd remainder visible', () => {
    expect(asPacks(435, aCase, 'pcs')).toBe('2 × Case + 15 pcs');
    expect(asPacks(435, aCase)).toBe('2 × Case + 15');
  });

  it('has nothing to say below one whole pack', () => {
    expect(asPacks(100, aCase, 'pcs')).toBeNull();
    expect(asPacks(0, aCase, 'pcs')).toBeNull();
    expect(asPacks(420, loose, 'pcs')).toBeNull();
  });

  it('does not print a zero remainder from floating point', () => {
    // 0.3 kg sacks: 3 / 0.3 is 9.999999999999998 in IEEE 754.
    expect(asPacks(3, { pack_name: 'Sack', pack_size: 0.3 }, 'kg')).toBe('10 × Sack');
  });
});
