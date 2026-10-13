import { describe, expect, it } from 'vitest';
import type { LabelArrangement } from '../../api';
import { clearDesign, hasOverrides, isMovable, layoutPayload, nudgeSpot } from './labelLayout';

/*
 * The drag designer's bookkeeping (round 8, 2026-10-13): a drag adds to a
 * part's shift, a resize multiplies its scale, bounds hold, a part back in
 * place drops out, and Back to automatic forgets a design.
 */
describe('label layout', () => {
  it('adds a move to the shift and multiplies a resize into the scale, within bounds', () => {
    let l: LabelArrangement = {};
    l = nudgeSpot(l, 'full', 'name', { dx: 3.14, dy: -2.06 });
    expect(l).toEqual({ full: { name: { dx: 3.1, dy: -2.1, s: 1 } } });
    l = nudgeSpot(l, 'full', 'name', { dx: 1, s: 1.5 });
    expect(l).toEqual({ full: { name: { dx: 4.1, dy: -2.1, s: 1.5 } } });
    l = nudgeSpot(l, 'full', 'name', { s: 5 });
    expect(l.full?.name?.s).toBe(2);
    l = nudgeSpot(l, 'full', 'name', { s: 0.01 });
    expect(l.full?.name?.s).toBe(0.5);
    l = nudgeSpot(l, 'small', 'dates', { dx: 999 });
    expect(l.small?.dates).toEqual({ dx: 300, dy: 0, s: 1 });
    expect(hasOverrides(l, 'full')).toBe(true);
    expect(hasOverrides(l, 'mini')).toBe(false);
  });

  it('drops a part put back where it was, and forgets a design on Back to automatic', () => {
    let l = nudgeSpot({}, 'round', 'photo', { dx: 2, dy: 2 });
    l = nudgeSpot(l, 'round', 'photo', { dx: -2, dy: -2 });
    expect(l).toEqual({});
    l = nudgeSpot(nudgeSpot({}, 'full', 'name', { dx: 1 }), 'mini', 'dates', { dy: 1 });
    expect(clearDesign(l, 'full')).toEqual({ mini: { dates: { dx: 0, dy: 1, s: 1 } } });
    expect(clearDesign(l, 'small')).toEqual(l);
    expect(layoutPayload({})).toBeNull();
    expect(layoutPayload(l)).toEqual(l);
  });

  it('knows which designs place their parts', () => {
    expect(isMovable('full')).toBe(true);
    expect(isMovable('round')).toBe(true);
    expect(isMovable('wrap')).toBe(false);
    expect(isMovable(null)).toBe(false);
  });
});
