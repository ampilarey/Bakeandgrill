import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CHUNK, PRINTER_SERVICES, bluetoothSupported, bluetoothWhyNot, forgetPrinter, pairPrinter, pairedPrinter, printOverBluetooth, sendBytes, stickerEnds } from './bluetoothPrinter';

/*
 * Printing to a Bluetooth label printer from a phone (round 16, 2026-10-13):
 * the printer is picked once, the first characteristic that takes writes on
 * a known printer service is used, and the stickers' bytes go in chunks.
 */
function fakeBluetooth(opts: { withoutResponse?: boolean } = {}) {
  const written: Uint8Array[] = [];
  const write = vi.fn(async (d: BufferSource) => { written.push(new Uint8Array(d as Uint8Array)); });
  const writer = { uuid: '00002af1-0000-1000-8000-00805f9b34fb', properties: { write: true, writeWithoutResponse: Boolean(opts.withoutResponse) }, writeValueWithoutResponse: write, writeValueWithResponse: write, writeValue: write };
  const notifier = { uuid: 'notify', properties: { write: false, writeWithoutResponse: false } };
  const services = [
    { uuid: '0000180a-0000-1000-8000-00805f9b34fb', getCharacteristics: async () => [notifier] },
    { uuid: PRINTER_SERVICES[0], getCharacteristics: async () => [notifier, writer] },
  ];
  const gatt = { connected: false, connect: vi.fn(async () => { gatt.connected = true; return { connected: true, getPrimaryServices: async () => services, getPrimaryService: async (u: string) => services.find((s) => s.uuid === u)! }; }), disconnect: vi.fn() };
  const requestDevice = vi.fn(async () => ({ id: 'p1', name: 'XP-P323B', gatt }));
  vi.stubGlobal('navigator', { ...navigator, bluetooth: { requestDevice } });
  return { written, requestDevice, write, gatt };
}

describe('bluetoothPrinter', () => {
  beforeEach(() => { forgetPrinter(); try { localStorage.clear(); } catch { /* jsdom */ } });
  afterEach(() => { vi.unstubAllGlobals(); forgetPrinter(); });

  it('says why a browser without Bluetooth cannot print', () => {
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)' });
    expect(bluetoothSupported()).toBe(false);
    expect(bluetoothWhyNot()).toContain('iPhones and iPads do not let a web page use Bluetooth');
  });

  it('pairs once, finds the writable characteristic and sends the bytes in chunks', async () => {
    const bt = fakeBluetooth({ withoutResponse: true });
    expect(await pairPrinter()).toEqual({ name: 'XP-P323B' });
    expect(bt.requestDevice).toHaveBeenCalledWith(expect.objectContaining({ acceptAllDevices: true, optionalServices: PRINTER_SERVICES }));
    expect(pairedPrinter()).toEqual({ name: 'XP-P323B' });
    expect(localStorage.getItem('labels.bluetooth')).toBe('XP-P323B');
    const bytes = new Uint8Array(CHUNK * 2 + 7).map((_, i) => i % 251);
    expect(await sendBytes(bytes, { pause: 0 })).toBe(bytes.length);
    expect(bt.written.map((w) => w.length)).toEqual([CHUNK, CHUNK, 7]);
    expect(Array.from(bt.written[2])).toEqual(Array.from(bytes.subarray(CHUNK * 2)));
    expect(bt.requestDevice).toHaveBeenCalledTimes(1);
  });

  it('fetches the printer-language link and prints it, pairing first when nothing is paired', async () => {
    const bt = fakeBluetooth();
    const tspl = new TextEncoder().encode('SIZE 60 mm,40 mm\r\nGAP 2 mm,0\r\nCLS\r\nPRINT 1,1\r\n');
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, arrayBuffer: async () => tspl.buffer }));
    vi.stubGlobal('fetch', fetchMock);
    const r = await printOverBluetooth('/labels/stickers.tspl?signature=x');
    expect(r.bytes).toBe(tspl.length);
    expect(bt.requestDevice).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(`${window.location.origin}/labels/stickers.tspl?signature=x`);
    expect(new TextDecoder().decode(new Uint8Array(bt.written.flatMap((w) => Array.from(w))))).toContain('PRINT 1,1');
  });

  it('says so when the printer is not picked or the size is not a label printer\'s', async () => {
    vi.stubGlobal('navigator', { ...navigator, bluetooth: { requestDevice: vi.fn(async () => { throw Object.assign(new Error('x'), { name: 'NotFoundError' }); }) } });
    await expect(pairPrinter()).rejects.toThrow('No printer was picked.');
    fakeBluetooth();
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 422 })));
    await expect(printOverBluetooth('/labels/stickers.tspl?x')).rejects.toThrow('A label printer takes one sticker a label');
  });

  it('says how many stickers went when a send stops part way (label audit, Batch B)', async () => {
    const bt = fakeBluetooth({ withoutResponse: true });
    await pairPrinter();
    const one = 'SIZE 60 mm,40 mm\r\nCLS\r\n' + 'BAR 0,0,10,10\r\n'.repeat(12) + 'PRINT 1,1\r\n';
    const bytes = new TextEncoder().encode(one.repeat(4));
    expect(stickerEnds(bytes)).toHaveLength(4);
    expect(stickerEnds(new TextEncoder().encode('^XA^FO0,0^FS^XZ\n^XA^XZ\n'))).toHaveLength(2);
    // Fails once 2 stickers' bytes have gone.
    let sent = 0;
    bt.write.mockImplementation(async (d: BufferSource) => {
      const part = new Uint8Array(d as Uint8Array);
      if (sent + part.length > one.length * 2 + 20) throw new Error('GATT operation failed');
      sent += part.length;
      bt.written.push(part);
    });
    await expect(sendBytes(bytes, { pause: 0, chunk: 20 })).rejects.toThrow('Sent 2 of 4 stickers; the other 2 did not reach the printer. GATT operation failed.');
  });
});
