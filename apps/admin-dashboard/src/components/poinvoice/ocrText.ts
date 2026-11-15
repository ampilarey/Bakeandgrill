import { linesOf, type PdfWord } from './readPo';

/*
 * Reading a scanned purchase order or a photo of one (owner, 2026-11-15: "what
 * if I get a scanned PO" → "yes add it").
 *
 * A scan is a picture, so there is no text to lift out: Tesseract looks at the
 * picture and works out the words. It runs here in the browser, from files on
 * this site (`/ocr/`: the worker, the engine and the English data), so nothing
 * is sent anywhere and nothing is fetched from another website. Its words come
 * back with their places on the page and go through the same `linesOf()` and
 * `readPo()` as a PDF's own text.
 *
 * A scan can be misread, mostly in numbers. That is why the screen says so,
 * shows every value in a box, and holds the items against the PO's total.
 */

/** Where the reader's own files are served from. */
const OCR_PATH = '/ocr';

/**
 * The longest edge a page is read at. A big photo is brought down to it, so a
 * phone does not run out of memory, and a small one is enlarged to it (three
 * times at most): at the size a chat app sends a picture, the print of a PO is
 * a few pixels tall and 200.00 reads as 20000.
 */
const MAX_EDGE = 2400;
const MAX_ENLARGE = 3;

/** How much a picture is scaled to be read. */
export function readingScale(width: number, height: number): number {
  return Math.min(MAX_ENLARGE, MAX_EDGE / Math.max(1, width, height));
}

/** How many pages of a scanned PDF are read. */
const MAX_PAGES = 3;

type Box = { x0: number; y0: number; x1: number; y1: number };
type OcrWord = { text: string; bbox: Box; line?: { bbox?: Box } };

/**
 * A number the reader spelt with letters: "2OO.OO" is 200.00, "l,350.00" is
 * 1,350.00. Only a word that is plainly a figure is touched.
 */
export function tidyFigure(word: string): string {
  if (!/\d/.test(word) || !/^[\dOoIl|,.\-]+$/.test(word)) return word;
  return word.replace(/[Oo]/g, '0').replace(/[Il|]/g, '1');
}

/** Tesseract's words, each with its box, as the lines a person sees on the page. */
export function linesOfScan(words: OcrWord[], pageHeight: number): string[] {
  const placed: PdfWord[] = [];
  for (const w of words) {
    const text = tidyFigure((w.text ?? '').trim());
    // A speck or a ruled line read as "~~" or "|" is not a word; a lone hyphen
    // or "&" is part of a name ("SHORT EAT - PATTIES").
    if (!/[A-Za-z0-9]/.test(text) && !/^[-–&+/]$/.test(text)) continue;
    const box = w.bbox;
    // The line's height, not the word's: "a" and "Tg" on one line must land on one row.
    const lineBox = w.line?.bbox ?? box;
    const height = Math.max(6, lineBox.y1 - lineBox.y0);
    const middle = (lineBox.y0 + lineBox.y1) / 2;
    placed.push({ str: text, x: box.x0, y: pageHeight - middle, width: box.x1 - box.x0, height });
  }
  return linesOf(placed);
}

async function canvasOfImage(file: File): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = readingScale(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This device cannot draw the picture.');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  return canvas;
}

async function canvasesOfPdf(file: File): Promise<HTMLCanvasElement[]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const { default: PdfWorker } = await import('pdfjs-dist/legacy/build/pdf.worker.mjs?worker');
  const port = new PdfWorker();
  pdfjs.GlobalWorkerOptions.workerPort = port;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false }).promise;
  const out: HTMLCanvasElement[] = [];
  try {
    for (let n = 1; n <= Math.min(doc.numPages, MAX_PAGES); n++) {
      const page = await doc.getPage(n);
      const base = page.getViewport({ scale: 1 });
      // A scanned page is a picture inside the PDF; drawn at this size it is read as sharply as it was scanned.
      const viewport = page.getViewport({ scale: MAX_EDGE / Math.max(base.width, base.height) });
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('This device cannot draw the page.');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport }).promise;
      out.push(canvas);
    }
  } finally {
    void doc.destroy();
    port.terminate();
    pdfjs.GlobalWorkerOptions.workerPort = null;
  }
  return out;
}

/**
 * The lines of a scanned PO or a photo of one. `onProgress` hears 0 to 1 as the
 * pages are read. Throws when the reader cannot start; the screen then leaves
 * the boxes for typing.
 */
export async function ocrLines(file: File, onProgress?: (done: number) => void): Promise<string[]> {
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  const pages = isPdf ? await canvasesOfPdf(file) : [await canvasOfImage(file)];

  const { createWorker } = await import('tesseract.js');
  let page = 0;
  const worker = await createWorker('eng', 1, {
    workerPath: `${OCR_PATH}/worker.min.js`,
    corePath: OCR_PATH,
    langPath: OCR_PATH,
    // A worker from this site's own address, never a blob: the page's security
    // rules allow scripts from here only.
    workerBlobURL: false,
    logger: (m: { status: string; progress: number }) => {
      if (m.status === 'recognizing text') onProgress?.((page + m.progress) / pages.length);
    },
  });

  const lines: string[] = [];
  try {
    // One block of text read straight across: a PO is a form and a table, and
    // a row must stay a row rather than be split into columns.
    await worker.setParameters({ tessedit_pageseg_mode: '6' as never, preserve_interword_spaces: '1' });
    for (const canvas of pages) {
      // A photo is rarely square to the page: the reader straightens it first,
      // or the far end of a row drifts into the row above or below.
      const { data } = await worker.recognize(canvas, { rotateAuto: true });
      lines.push(...linesOfScan((data.words ?? []) as OcrWord[], canvas.height));
      page += 1;
      onProgress?.(page / pages.length);
    }
  } finally {
    await worker.terminate();
  }
  return lines;
}
