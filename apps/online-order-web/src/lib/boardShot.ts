/**
 * A small JPEG of what the TV is showing, for the Devices tab.
 *
 * Owner's shortlist, 2026-09-23: see what is actually on each screen
 * without walking over. Drawn from the DOM with html2canvas at a fifth of
 * the size (384×216 for a 1080p board), JPEG at 0.6 — some 15–30 KB — and
 * sent with a heartbeat every couple of minutes. The library loads on
 * demand, so the customer app never pays for it.
 */
export const BOARD_SHOT_INTERVAL_MS = 120_000;
const SHOT_SCALE = 0.2;
const SHOT_QUALITY = 0.6;

type Html2Canvas = (el: HTMLElement, opts: Record<string, unknown>) => Promise<HTMLCanvasElement>;

let loader: Promise<Html2Canvas> | null = null;

function loadHtml2Canvas(): Promise<Html2Canvas> {
  if (!loader) {
    loader = import('html2canvas').then((m) => (m.default ?? m) as unknown as Html2Canvas);
  }
  return loader;
}

/** JPEG data URI of the element, or null when it cannot be drawn. */
export async function captureBoard(el: HTMLElement | null): Promise<string | null> {
  if (!el) return null;
  try {
    const html2canvas = await loadHtml2Canvas();
    const canvas = await html2canvas(el, {
      scale: SHOT_SCALE,
      useCORS: true,
      logging: false,
      backgroundColor: '#0d0a07',
      imageTimeout: 3000,
      ignoreElements: (node: Element) => node.classList?.contains('signage-fs-btn') === true,
    });
    const uri = canvas.toDataURL('image/jpeg', SHOT_QUALITY);
    return uri.startsWith('data:image/jpeg') ? uri : null;
  } catch {
    return null;
  }
}
