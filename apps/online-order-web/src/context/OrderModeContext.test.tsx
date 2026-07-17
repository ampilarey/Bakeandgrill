import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getSalesChannel, setSalesChannel } from '../api/menu';
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
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('maps sales channels to modes', () => {
    expect(channelToMode('online_pickup')).toBe('pickup');
    expect(channelToMode('delivery')).toBe('delivery');
    expect(modeToChannel('pickup')).toBe('online_pickup');
    expect(modeToChannel('delivery')).toBe('delivery');
  });

  it('initializes from getSalesChannel()', () => {
    setSalesChannel('delivery');
    const { result } = renderHook(() => useOrderMode(), { wrapper });
    expect(result.current.mode).toBe('delivery');
    expect(result.current.channel).toBe('delivery');
  });

  it('setMode persists channel and updates mode', () => {
    const { result } = renderHook(() => useOrderMode(), { wrapper });
    act(() => {
      result.current.setMode('delivery');
    });
    expect(result.current.mode).toBe('delivery');
    expect(getSalesChannel()).toBe('delivery');
  });

  it('treats sales_channel_change as authoritative (delivery→pickup fallback)', () => {
    const { result } = renderHook(() => useOrderMode(), { wrapper });
    act(() => {
      result.current.setMode('delivery');
    });
    expect(result.current.mode).toBe('delivery');

    act(() => {
      // Simulates fetchItems empty-delivery fallback (menu.ts)
      setSalesChannel('online_pickup');
    });

    expect(result.current.mode).toBe('pickup');
    expect(getSalesChannel()).toBe('online_pickup');
  });

  it('does not re-emit when setMode is a no-op for the current channel', () => {
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
});
