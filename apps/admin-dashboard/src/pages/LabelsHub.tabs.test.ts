import { describe, expect, it, vi } from 'vitest';

/*
 * Plain words (round 4, owner, 2026-10-13): the tabs say Print labels and
 * Wording and logos; their addresses stay, so every link into the hub still lands.
 */
vi.mock('../components/labels/MakeLabelWizard', () => ({ MakeLabelWizard: () => null }));
vi.mock('../components/labels/StickerPrintPanel', () => ({ StickerPrintPanel: () => null }));
vi.mock('../components/labels/BoxLabelPanel', () => ({ BoxLabelPanel: () => null }));
vi.mock('../components/labels/TypesAndBrands', () => ({ TypesAndBrands: () => null }));
vi.mock('../components/labels/MyLabels', () => ({ MyLabelsTab: () => null }));
vi.mock('../components/labels/ExpiringStock', () => ({ ExpiringStock: () => null }));
vi.mock('../components/labels/IngredientGlossary', () => ({ IngredientGlossary: () => null }));
vi.mock('../components/labels/NutritionCard', () => ({ NutritionCard: () => null }));
vi.mock('../components/labels/LabelPrinterCard', () => ({ LabelPrinterCard: () => null }));

import { LABELS_HUB_PATHS, LABELS_TABS } from './LabelsHub';

describe('Labels hub tabs', () => {
  // Owner, 2026-11-14: seven tabs became four; every screen keeps its address.
  it('shows four tabs and keeps every old address open under one of them', () => {
    const strip = LABELS_TABS.filter((t) => !t.under);
    expect(strip.map((t) => t.label)).toEqual(['My labels', 'New label', 'Box labels', 'Setup']);
    const under = Object.fromEntries(LABELS_TABS.filter((t) => t.under).map((t) => [t.id, t.under]));
    expect(under).toEqual({ stickers: 'mine', custom: 'mine', saved: 'mine', types: 'setup', settings: 'setup' });
    for (const t of LABELS_TABS) if (t.under) expect(strip.map((x) => x.id)).toContain(t.under);
    expect(LABELS_HUB_PATHS).toEqual(expect.arrayContaining(['labels', 'labels/mine', 'labels/make', 'labels/stickers', 'labels/custom', 'labels/box', 'labels/types', 'labels/saved', 'labels/settings', 'labels/setup', 'labels/history']));
  });
});
