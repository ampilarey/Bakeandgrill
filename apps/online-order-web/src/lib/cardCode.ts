/**
 * A printed card's QR opens the order app with its code (`/order/?promo=CODE` for a
 * discount or promo card, `?gift=CODE` for a gift card; backend `CardSource::orderUrl`).
 * The code is kept for the tab and fills the checkout's box, so the guest can browse first.
 */
const KEY = 'card.codes';

type Codes = { promo?: string; gift?: string };

function read(): Codes {
  try {
    return JSON.parse(sessionStorage.getItem(KEY) ?? '{}') as Codes;
  } catch {
    return {};
  }
}

function write(codes: Codes): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(codes));
  } catch {
    /* private mode */
  }
}

const clean = (v: string | null): string | undefined => {
  const code = (v ?? '').trim().toUpperCase();
  return /^[A-Z0-9-]{4,40}$/.test(code) ? code : undefined;
};

/** Reads the scan once, on whatever page it lands, and takes it out of the address. */
export function captureCardCode(loc: Location = window.location, hist: History = window.history): void {
  const params = new URLSearchParams(loc.search);
  const promo = clean(params.get('promo'));
  const gift = clean(params.get('gift'));
  if (!promo && !gift) return;
  write({ ...read(), ...(promo ? { promo } : {}), ...(gift ? { gift } : {}) });
  params.delete('promo');
  params.delete('gift');
  const qs = params.toString();
  hist.replaceState(hist.state, '', loc.pathname + (qs ? `?${qs}` : '') + loc.hash);
}

export function cardCode(kind: keyof Codes): string {
  return read()[kind] ?? '';
}

/** Forgets a code once it is on the order. */
export function clearCardCode(kind: keyof Codes): void {
  const codes = read();
  delete codes[kind];
  write(codes);
}
