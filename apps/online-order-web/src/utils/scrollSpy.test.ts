import { describe, expect, it } from 'vitest';
import { pickActiveSectionId } from './scrollSpy';

describe('pickActiveSectionId', () => {
  it('returns previous when nothing is intersecting', () => {
    expect(pickActiveSectionId([], 5)).toBe(5);
    expect(pickActiveSectionId([{ id: 1, ratio: 0, top: 10 }], 5)).toBe(5);
  });

  it('picks the topmost intersecting section', () => {
    expect(
      pickActiveSectionId(
        [
          { id: 2, ratio: 0.4, top: 200 },
          { id: 1, ratio: 0.2, top: 80 },
          { id: 3, ratio: 0.9, top: 400 },
        ],
        null,
      ),
    ).toBe(1);
  });
});
