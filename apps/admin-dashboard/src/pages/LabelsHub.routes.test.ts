import { describe, expect, it } from 'vitest';
import { LABELS_HUB_PATHS, LABELS_TABS } from './LabelsHub';

/** Every Labels tab has an address: one left out opened the dashboard instead (Custom labels, 2026-10-11). */
describe('Labels hub routes', () => {
  it('answers on every tab and the old History address', () => {
    for (const t of LABELS_TABS) expect(LABELS_HUB_PATHS).toContain(`labels/${t.id}`);
    expect(LABELS_HUB_PATHS).toEqual(expect.arrayContaining(['labels', 'labels/custom', 'labels/history']));
  });
});
