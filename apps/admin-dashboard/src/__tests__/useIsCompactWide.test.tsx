import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  COMPACT_ADMIN_MEDIA_QUERY,
  WIDE_DESKTOP_MEDIA_QUERY,
  useIsCompactAdmin,
  useIsWideDesktop,
} from '../hooks/useIsMobile';
import { setViewportWidth } from './viewport';

describe('Content Hub responsive band hooks (§7.2)', () => {
  afterEach(() => {
    setViewportWidth(1024);
  });

  it('exports the Stage 5 compact and wide media queries', () => {
    expect(COMPACT_ADMIN_MEDIA_QUERY).toBe('(min-width: 768px) and (max-width: 1199px)');
    expect(WIDE_DESKTOP_MEDIA_QUERY).toBe('(min-width: 1200px)');
  });

  it('useIsCompactAdmin is true only in 768–1199', () => {
    for (const width of [768, 1024, 1199] as const) {
      setViewportWidth(width);
      const { result } = renderHook(() => useIsCompactAdmin());
      expect(result.current, `compact @ ${width}`).toBe(true);
    }
    for (const width of [414, 767, 1200, 1366] as const) {
      setViewportWidth(width);
      const { result } = renderHook(() => useIsCompactAdmin());
      expect(result.current, `not compact @ ${width}`).toBe(false);
    }
  });

  it('useIsWideDesktop is true at 1200 and 1366, false below', () => {
    for (const width of [1200, 1366] as const) {
      setViewportWidth(width);
      const { result } = renderHook(() => useIsWideDesktop());
      expect(result.current, `wide @ ${width}`).toBe(true);
    }
    for (const width of [414, 767, 768, 1199] as const) {
      setViewportWidth(width);
      const { result } = renderHook(() => useIsWideDesktop());
      expect(result.current, `not wide @ ${width}`).toBe(false);
    }
  });
});
