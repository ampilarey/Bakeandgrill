import { describe, expect, it, vi } from 'vitest';

/*
 * Plain words (round 4, owner, 2026-10-13): the tabs say Print labels and
 * Wording and logos; their addresses stay, so every link into the hub still lands.
 */
vi.mock('../components/labels/MakeLabelWizard', () => ({ MakeLabelWizard: () => null }));
vi.mock('../components/labels/StickerPrintPanel', () => ({ StickerPrintPanel: () => null }));
vi.mock('../components/labels/BoxLabelPanel', () => ({ BoxLabelPanel: () => null }));
vi.mock('../components/labels/TypesAndBrands', () => ({ TypesAndBrands: () => null }));
vi.mock('../components/labels/CustomLabels', () => ({ CustomLabelsTab: () => null }));
vi.mock('../components/labels/ExpiringStock', () => ({ ExpiringStock: () => null }));
vi.mock('../components/labels/IngredientGlossary', () => ({ IngredientGlossary: () => null }));
vi.mock('../components/labels/NutritionCard', () => ({ NutritionCard: () => null }));
vi.mock('../components/labels/LabelPrinterCard', () => ({ LabelPrinterCard: () => null }));

import { LABELS_HUB_PATHS, LABELS_TABS } from './LabelsHub';

describe('Labels hub tabs', () => {
  it('names the tabs in plain words and keeps their addresses', () => {
    const byId = Object.fromEntries(LABELS_TABS.map((t) => [t.id, t.label]));
    expect(byId).toMatchObject({ make: 'Make a label', stickers: 'Print labels', custom: 'Custom labels', box: 'Box labels', types: 'Wording and logos', saved: 'Saved labels', settings: 'Settings' });
    expect(LABELS_TABS.map((t) => t.label)).not.toContain('Pack stickers');
    expect(LABELS_TABS.map((t) => t.label)).not.toContain('Types & brands');
    expect(LABELS_HUB_PATHS).toEqual(expect.arrayContaining(['labels', 'labels/make', 'labels/stickers', 'labels/types', 'labels/saved', 'labels/history']));
  });
});
