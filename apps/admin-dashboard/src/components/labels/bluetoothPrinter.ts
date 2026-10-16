/*
 * Printing from a phone straight to a Bluetooth label printer (round 16,
 * owner 2026-10-13: "printing from a phone straight to a Bluetooth label
 * printer"). The server already draws the stickers in the printer's own
 * language (TSPL or ZPL, signed links on every prepared print); this sends
 * those bytes over Bluetooth Low Energy with Web Bluetooth, which Chrome on
 * Android and on a computer has and iPhone browsers do not.
 *
 * Cheap thermal label printers talk BLE through a "serial" service with one
 * writable characteristic; which one varies by maker, so the known services
 * are asked for and the first characteristic that takes writes is used. The
 * bytes go in small chunks, a printer's buffer being small.
 */

/** The serial-over-BLE services label printers are known to use. */
export const PRINTER_SERVICES = [
  '000018f0-0000-1000-8000-00805f9b34fb', // most Chinese thermal printers (write 2af1)
  '0000ff00-0000-1000-8000-00805f9b34fb', // TSC/Xprinter style (write ff02)
  '0000ffe0-0000-1000-8000-00805f9b34fb', // HM-10 serial modules (ffe1)
  '49535343-fe7d-4ae5-8fa9-9fafd205e455', // Microchip ISSC transparent UART
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2', // a common printer module (bef8d6c9…)
  '38eb4a80-c570-11e3-9507-0002a5d5c51b', // Zebra's parser service
];

/** Bytes a write carries: well under the smallest BLE packet a printer takes after negotiation. */
export const CHUNK = 180;

type Char = {
  uuid: string;
  properties: { write: boolean; writeWithoutResponse: boolean };
  writeValue?: (data: BufferSource) => Promise<void>;
  writeValueWithResponse?: (data: BufferSource) => Promise<void>;
  writeValueWithoutResponse?: (data: BufferSource) => Promise<void>;
};
type Service = { uuid: string; getCharacteristics: () => Promise<Char[]> };
type Server = { connected: boolean; getPrimaryServices: () => Promise<Service[]>; getPrimaryService: (uuid: string) => Promise<Service> };
type Device = { id: string; name?: string; gatt?: { connected: boolean; connect: () => Promise<Server>; disconnect?: () => void } };
type Bluetooth = { requestDevice: (o: { acceptAllDevices?: boolean; filters?: unknown[]; optionalServices?: string[] }) => Promise<Device>; getAvailability?: () => Promise<boolean> };

const bt = (): Bluetooth | null => (typeof navigator !== 'undefined' && (navigator as unknown as { bluetooth?: Bluetooth }).bluetooth) || null;

/** Whether this browser can reach a Bluetooth printer at all. */
export function bluetoothSupported(): boolean {
  return bt() !== null;
}

/** Why it cannot, in words for the person holding the phone. */
export function bluetoothWhyNot(): string {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  if (/iPhone|iPad|iPod/.test(ua)) return 'iPhones and iPads do not let a web page use Bluetooth. Print the PDF instead, or use an Android phone with Chrome.';
  return 'This browser cannot use Bluetooth. Open the Admin in Chrome (Android or a computer) to print to a Bluetooth label printer.';
}

let device: Device | null = null;
let writer: Char | null = null;

/** The printer paired in this tab, if any. */
export function pairedPrinter(): { name: string } | null {
  return device ? { name: device.name || 'Label printer' } : null;
}

/** Forget the printer paired in this tab (tests, or to pick another). */
export function forgetPrinter() {
  try { device?.gatt?.disconnect?.(); } catch { /* already gone */ }
  device = null;
  writer = null;
}

async function findWriter(server: Server): Promise<Char> {
  let services: Service[] = [];
  try {
    services = await server.getPrimaryServices();
  } catch {
    for (const uuid of PRINTER_SERVICES) {
      try { services.push(await server.getPrimaryService(uuid)); } catch { /* not this one */ }
    }
  }
  // Known printer services first, then anything else the printer offers.
  services.sort((a, b) => (PRINTER_SERVICES.includes(a.uuid) ? 0 : 1) - (PRINTER_SERVICES.includes(b.uuid) ? 0 : 1));
  for (const s of services) {
    const chars = await s.getCharacteristics().catch(() => [] as Char[]);
    const w = chars.find((c) => c.properties.writeWithoutResponse) ?? chars.find((c) => c.properties.write);
    if (w) return w;
  }
  throw new Error('That device has no way in for printing. Pick the label printer itself, switched on and near the phone.');
}

/** Ask the person to pick the printer (a tap is needed), connect, and find where to write. */
export async function pairPrinter(): Promise<{ name: string }> {
  const b = bt();
  if (!b) throw new Error(bluetoothWhyNot());
  let picked: Device;
  try {
    picked = await b.requestDevice({ acceptAllDevices: true, optionalServices: PRINTER_SERVICES });
  } catch (e) {
    const name = (e as { name?: string })?.name ?? '';
    throw new Error(name === 'NotFoundError' ? 'No printer was picked.' : 'Bluetooth could not be started. Switch it on and allow it for this site.');
  }
  if (!picked.gatt) throw new Error('That device cannot be printed to.');
  const server = await picked.gatt.connect();
  writer = await findWriter(server);
  device = picked;
  try { localStorage.setItem('labels.bluetooth', picked.name || 'Label printer'); } catch { /* a private window */ }
  return { name: picked.name || 'Label printer' };
}

/** The name of the printer last paired on this phone, to say which one to pick again. */
export function rememberedPrinterName(): string | null {
  try { return localStorage.getItem('labels.bluetooth'); } catch { return null; }
}

async function write(c: Char, part: Uint8Array<ArrayBuffer>) {
  if (c.properties.writeWithoutResponse && c.writeValueWithoutResponse) return c.writeValueWithoutResponse(part);
  if (c.writeValueWithResponse) return c.writeValueWithResponse(part);
  if (c.writeValue) return c.writeValue(part);
  throw new Error('The printer refused the stickers.');
}

/**
 * Where each sticker ends in a TSPL or ZPL job (label audit, Batch B): the
 * byte just past each TSPL `PRINT` line or ZPL `^XZ`, so a send that stops
 * part way can say how many stickers went.
 */
export function stickerEnds(bytes: Uint8Array): number[] {
  const text = new TextDecoder('latin1').decode(bytes);
  const ends: number[] = [];
  const re = /(?:^|\n)PRINT [^\n]*\n|\^XZ/g;
  for (let m = re.exec(text); m; m = re.exec(text)) ends.push(m.index + m[0].length);
  return ends;
}

/** A send that stopped part way: how many stickers reached the printer. */
export class PartialSendError extends Error {
  constructor(public sent: number, public total: number, reason: string) {
    super(`Sent ${sent} of ${total} ${total === 1 ? 'sticker' : 'stickers'}; the other ${total - sent} did not reach the printer. ${reason}`);
    this.name = 'PartialSendError';
  }
}

/** Send bytes to the paired printer in chunks (pairing first when nothing is paired). */
export async function sendBytes(bytes: Uint8Array<ArrayBuffer>, opts: { chunk?: number; pause?: number } = {}): Promise<number> {
  if (!device || !writer || !device.gatt?.connected) {
    if (device?.gatt && !device.gatt.connected) {
      writer = await findWriter(await device.gatt.connect());
    } else {
      await pairPrinter();
    }
  }
  const chunk = opts.chunk ?? CHUNK;
  const pause = opts.pause ?? 12;
  for (let i = 0; i < bytes.length; i += chunk) {
    try {
      await write(writer!, bytes.subarray(i, Math.min(bytes.length, i + chunk)));
    } catch (e) {
      const ends = stickerEnds(bytes);
      const reason = e instanceof Error && e.message ? (/[.!?]$/.test(e.message) ? e.message : `${e.message}.`) : 'The printer stopped answering.';
      if (ends.length > 0) throw new PartialSendError(ends.filter((end) => end <= i).length, ends.length, reason);
      throw e;
    }
    if (pause > 0) await new Promise((r) => setTimeout(r, pause));
  }
  return bytes.length;
}

/** Fetch a signed printer-language link (TSPL or ZPL) and send it to the paired printer. */
export async function printOverBluetooth(url: string): Promise<{ bytes: number }> {
  if (!bluetoothSupported()) throw new Error(bluetoothWhyNot());
  // Pair first, while the tap that asked to print still counts: a browser shows the picker only in answer to one.
  if (!device || !writer) await pairPrinter();
  const res = await fetch(url.startsWith('http') ? url : `${window.location.origin}${url}`);
  if (!res.ok) throw new Error(res.status === 422 ? 'A label printer takes one sticker a label: pick a label-printer size.' : 'The stickers could not be fetched for the printer.');
  const bytes = new Uint8Array(await res.arrayBuffer());
  return { bytes: await sendBytes(bytes) };
}
