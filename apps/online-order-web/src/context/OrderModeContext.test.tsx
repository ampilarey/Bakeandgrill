import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  confirmSalesChannel,
  getSalesChannel,
  isSalesChannelConfirmed,
  setSalesChannel,
} from '../api/menu';
import {
  OrderModeProvider,
  channelToMode,
  modeToChannel,
  useOrderMode,
} from './OrderModeContext';

function wrapper({ children }: { children: ReactNode }) {
  return <OrderModeProvider>{children}</OrderModeProvider>;
}

describe('OrderModeContext', () => {
  beforeEach(() => {
    localStorage.clear();
    setSalesChannel('online_pickup');
    window.history.replaceState({}, '', '/');
  });

  afterEach(() => {
    localStorage.clear();
    window.history.replaceState({}, '', '/');
  });

  it('maps sales channels to modes', () => {
    expect(channelToMode('online_pickup')).toBe('pickup');
    expect(channelToMode('delivery')).toBe('delivery');
    expect(modeToChannel('pickup')).toBe('online_pickup');
    expect(modeToChannel('delivery')).toBe('delivery');
  });

  it('initializes from getSalesChannel() with modeConfirmed false on fresh storage', () => {
    setSalesChannel('delivery');
    const { result } = renderHook(() => useOrderMode(), { wrapper });
    expect(result.current.mode).toBe('delivery');
    expect(result.current.channel).toBe('delivery');
    expect(result.current.modeConfirmed).toBe(false);
    expect(isSalesChannelConfirmed()).toBe(false);
  });

  it('setMode persists channel, updates mode, and confirms by default', () => {
    const { result } = renderHook(() => useOrderMode(), { wrapper });
    act(() => {
      result.current.setMode('delivery');
    });
    expect(result.current.mode).toBe('delivery');
    expect(getSalesChannel()).toBe('delivery');
    expect(result.current.modeConfirmed).toBe(true);
    expect(isSalesChannelConfirmed()).toBe(true);
  });

  it('setMode with explicit:false does not confirm', () => {
    const { result } = renderHook(() => useOrderMode(), { wrapper });
    act(() => {
      result.current.setMode('delivery', { explicit: false });
    });
    expect(result.current.mode).toBe('delivery');
    expect(result.current.modeConfirmed).toBe(false);
    expect(isSalesChannelConfirmed()).toBe(false);
  });

  it('tapping the already-active mode still confirms', () => {
    const { result } = renderHook(() => useOrderMode(), { wrapper });
    expect(result.current.mode).toBe('pickup');
    expect(result.current.modeConfirmed).toBe(false);
    act(() => {
      result.current.setMode('pickup');
    });
    expect(result.current.mode).toBe('pickup');
    expect(result.current.modeConfirmed).toBe(true);
  });

  it('treats sales_channel_change as authoritative without confirming (delivery→pickup fallback)', () => {
    const { result } = renderHook(() => useOrderMode(), { wrapper });
    act(() => {
      result.current.setMode('delivery', { explicit: false });
    });
    expect(result.current.mode).toBe('delivery');
    expect(result.current.modeConfirmed).toBe(false);

    act(() => {
      // Simulates fetchItems empty-delivery fallback (menu.ts) — no confirmSalesChannel
      setSalesChannel('online_pickup');
    });

    expect(result.current.mode).toBe('pickup');
    expect(getSalesChannel()).toBe('online_pickup');
    expect(result.current.modeConfirmed).toBe(false);
  });

  it('does not clear confirmation when channel changes after an explicit choice', () => {
    const { result } = renderHook(() => useOrderMode(), { wrapper });
    act(() => {
      result.current.setMode('delivery');
    });
    expect(result.current.modeConfirmed).toBe(true);

    act(() => {
      setSalesChannel('online_pickup');
    });
    expect(result.current.mode).toBe('pickup');
    // confirm flag remains in storage — automatic flip after a real choice stays confirmed
    expect(isSalesChannelConfirmed()).toBe(true);
    expect(result.current.modeConfirmed).toBe(true);
  });

  it('does not re-emit when setMode is a no-op for the current channel', () => {
    confirmSalesChannel();
    const { result } = renderHook(() => useOrderMode(), { wrapper });
    let events = 0;
    const spy = () => {
      events += 1;
    };
    window.addEventListener('sales_channel_change', spy);
    act(() => {
      result.current.setMode('pickup');
      result.current.setMode('pickup');
    });
    window.removeEventListener('sales_channel_change', spy);
    expect(events).toBe(0);
  });

  it('honours ?mode= deep links from the marketing site and strips the param', () => {
    window.history.replaceState({}, '', '/menu?mode=delivery&utm=1');
    const { result } = renderHook(() => useOrderMode(), { wrapper });
    expect(result.current.mode).toBe('delivery');
    expect(result.current.modeConfirmed).toBe(true);
    expect(getSalesChannel()).toBe('delivery');
    expect(window.location.search).toBe('?utm=1');
  });
});
