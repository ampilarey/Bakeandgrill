import { describe, it, expect, vi, afterEach } from 'vitest';
import { ApiRequestError } from '@shared/api';
import {
  ServiceUnavailableError,
  broadcastServiceUnavailable,
  toServiceUnavailableError,
} from './serviceUnavailable';

describe('toServiceUnavailableError', () => {
  it('maps a canonical 503 ApiRequestError to a typed error', () => {
    const err = new ApiRequestError('nope', 503, {
      code: 'SERVICE_UNAVAILABLE',
      service_key: 'online_checkout',
      message: 'Checkout is paused for maintenance.',
      alternatives: ['pickup', 'call'],
      retry_at: '2026-07-22T04:00:00+05:00',
      notify_enabled: true,
    });
    const typed = toServiceUnavailableError(err);
    expect(typed).toBeInstanceOf(ServiceUnavailableError);
    expect(typed!.serviceKey).toBe('online_checkout');
    expect(typed!.status).toBe(503);
    expect(typed!.alternatives).toEqual(['pickup', 'call']);
    expect(typed!.retryAt).toBe('2026-07-22T04:00:00+05:00');
    expect(typed!.notifyEnabled).toBe(true);
    expect(typed!.message).toBe('Checkout is paused for maintenance.');
  });

  it('returns null for a 503 that is not tagged SERVICE_UNAVAILABLE', () => {
    const err = new ApiRequestError('gateway', 503, { message: 'gateway timeout' });
    expect(toServiceUnavailableError(err)).toBeNull();
  });

  it('returns null for non-ApiRequestError inputs', () => {
    expect(toServiceUnavailableError(new Error('boom'))).toBeNull();
    expect(toServiceUnavailableError(null)).toBeNull();
    expect(toServiceUnavailableError({ status: 503 })).toBeNull();
  });

  it('returns null for a 422 (legacy gate) even with SERVICE_UNAVAILABLE code', () => {
    const err = new ApiRequestError('closed', 422, {
      code: 'SERVICE_UNAVAILABLE',
      service_key: 'online_delivery',
      message: 'Delivery closed.',
    });
    expect(toServiceUnavailableError(err)).toBeNull();
  });
});

describe('broadcastServiceUnavailable', () => {
  const listeners: Array<[string, EventListenerOrEventListenerObject]> = [];
  afterEach(() => {
    for (const [type, fn] of listeners) window.removeEventListener(type, fn);
    listeners.length = 0;
  });

  it('dispatches a service_unavailable CustomEvent with the typed error as detail', () => {
    const spy = vi.fn();
    window.addEventListener('service_unavailable', spy as EventListener);
    listeners.push(['service_unavailable', spy as EventListener]);
    const err = new ServiceUnavailableError({
      code: 'SERVICE_UNAVAILABLE',
      service_key: 'online_payment',
      message: 'Payments offline.',
      alternatives: ['cod'],
      retry_at: null,
      notify_enabled: false,
    });
    broadcastServiceUnavailable(err);
    expect(spy).toHaveBeenCalledTimes(1);
    const evt = spy.mock.calls[0][0] as CustomEvent<ServiceUnavailableError>;
    expect(evt.detail).toBe(err);
    expect(evt.detail.serviceKey).toBe('online_payment');
  });
});
