import { renderHook, act } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { MOBILE_MEDIA_QUERY, useIsMobile } from '../hooks/useIsMobile';
import { setViewportWidth } from './viewport';

describe('useIsMobile', () => {
  afterEach(() => {
    setViewportWidth(1024);
  });

  it('uses the AppShell / CSS max-width: 767px band', () => {
    expect(MOBILE_MEDIA_QUERY).toBe('(max-width: 767px)');
  });

  it('is true at 390px and 767px, false at 768px', () => {
    setViewportWidth(390);
    const { result, rerender } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);

    act(() => { setViewportWidth(767); });
    // Remount so initial state + effect re-read the stubbed matchMedia.
    rerender();
    const at767 = renderHook(() => useIsMobile());
    expect(at767.result.current).toBe(true);

    act(() => { setViewportWidth(768); });
    const at768 = renderHook(() => useIsMobile());
    expect(at768.result.current).toBe(false);

    act(() => { setViewportWidth(1024); });
    const atDesktop = renderHook(() => useIsMobile());
    expect(atDesktop.result.current).toBe(false);
  });
});
