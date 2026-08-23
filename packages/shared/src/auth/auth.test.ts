import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createTokenStore, readStored, writeStored } from './tokenStore';
import { getOrCreateDeviceId } from './deviceId';

/**
 * The token store and the device id.
 *
 * Most of these are about the failure paths, because those are what the three
 * hand-rolled copies did not handle: localStorage that throws, and a
 * crypto.randomUUID that does not exist outside a secure context. Both turn a
 * working app into a blank screen, on exactly the devices least likely to have
 * anyone watching — a kitchen display and a driver's phone.
 */
describe('createTokenStore', () => {
  beforeEach(() => localStorage.clear());

  it('round-trips a token', () => {
    const store = createTokenStore('driver_token');

    expect(store.get()).toBeNull();
    store.set('abc123');
    expect(store.get()).toBe('abc123');
    store.clear();
    expect(store.get()).toBeNull();
  });

  it('keeps the exact key it was given', () => {
    // Renaming a key on migration signs every device out on the next deploy,
    // so the key is passed in and never derived.
    createTokenStore('kds_token').set('t');

    expect(localStorage.getItem('kds_token')).toBe('t');
  });

  it('treats an empty string as no token', () => {
    // A stored empty string used to leave the app sending a bare
    // "Authorization: Bearer " and getting a puzzling 401 back.
    localStorage.setItem('kds_token', '');

    expect(createTokenStore('kds_token').get()).toBeNull();
  });

  it('refuses to store an empty token', () => {
    const store = createTokenStore('kds_token');
    store.set('real');
    store.set('');

    expect(store.get()).toBe('real');
  });

  it('keeps two principals apart', () => {
    // Staff, driver and customer are different token types, not variants —
    // one must never be read as another.
    createTokenStore('kds_token').set('staff-token');
    createTokenStore('driver_token').set('driver-token');

    expect(createTokenStore('kds_token').get()).toBe('staff-token');
    expect(createTokenStore('driver_token').get()).toBe('driver-token');
  });
});

describe('when the browser refuses storage', () => {
  // A private window, or a browser set to block site data. Direct
  // localStorage calls throw here; the old code did exactly that.
  let getItem: ReturnType<typeof vi.spyOn>;
  let setItem: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
  });

  afterEach(() => { getItem.mockRestore(); setItem.mockRestore(); });

  it('reads null instead of throwing', () => {
    expect(() => createTokenStore('kds_token').get()).not.toThrow();
    expect(createTokenStore('kds_token').get()).toBeNull();
  });

  it('writes nothing instead of throwing', () => {
    expect(() => createTokenStore('kds_token').set('t')).not.toThrow();
  });

  it('clears without throwing', () => {
    expect(() => createTokenStore('kds_token').clear()).not.toThrow();
  });

  it('reports whether a write actually stuck', () => {
    expect(writeStored('k', 'v')).toBe(false);
  });

  it('still hands back a usable device id for this session', () => {
    // Unremembered, but the screen works rather than failing to start.
    const id = getOrCreateDeviceId('kds_device_id', 'KDS');

    expect(id).toMatch(/^KDS-[0-9A-F]{8}$/);
  });
});

describe('getOrCreateDeviceId', () => {
  beforeEach(() => localStorage.clear());

  it('generates a prefixed id and remembers it', () => {
    const first = getOrCreateDeviceId('kds_device_id', 'KDS');

    expect(first).toMatch(/^KDS-[0-9A-F]{8}$/);
    expect(getOrCreateDeviceId('kds_device_id', 'KDS')).toBe(first);
    expect(readStored('kds_device_id')).toBe(first);
  });

  it('carries the prefix so a screen is recognisable in the device list', () => {
    // "KDS-7F3A9C2B" says which screen at a glance; a bare UUID does not.
    expect(getOrCreateDeviceId('a', 'KDS').startsWith('KDS-')).toBe(true);
    expect(getOrCreateDeviceId('b', 'POS').startsWith('POS-')).toBe(true);
  });

  it('works where crypto.randomUUID does not exist', () => {
    // THE one that matters. randomUUID is secure-context only, so a kitchen
    // screen opened over plain HTTP threw while the component was
    // initialising and rendered nothing at all.
    const spy = vi.spyOn(globalThis.crypto, 'randomUUID').mockImplementation(() => {
      throw new TypeError('crypto.randomUUID is not a function');
    });

    try {
      expect(getOrCreateDeviceId('kds_device_id', 'KDS')).toMatch(/^KDS-[0-9A-F]{8}$/);
    } finally {
      spy.mockRestore();
    }
  });

  it('gives two screens different ids', () => {
    const a = getOrCreateDeviceId('screen_a', 'KDS');
    const b = getOrCreateDeviceId('screen_b', 'KDS');

    expect(a).not.toBe(b);
  });
});
