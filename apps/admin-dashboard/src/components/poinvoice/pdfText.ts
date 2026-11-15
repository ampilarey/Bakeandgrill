import { linesOf, type PdfWord } from './readPo';

/**
 * The lines of text in a PDF, read in the browser with pdf.js (loaded only when
 * a PO is opened, so the admin's first load does not carry it). A scanned PO
 * has no text at all and comes back as no lines; the screen then says so and
 * leaves the boxes for typing.
 */
export async function pdfLines(file: File): Promise<string[]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  // Bundled as an ordinary .js worker: a bare .mjs file is not served as script by every host.
  const { default: PdfWorker } = await import('pdfjs-dist/legacy/build/pdf.worker.mjs?worker');
  const port = new PdfWorker();
  pdfjs.GlobalWorkerOptions.workerPort = port;

  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false }).promise;
  const lines: string[] = [];
  try {
    for (let n = 1; n <= Math.min(doc.numPages, 10); n++) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      const words: PdfWord[] = [];
      for (const item of content.items) {
        if (!('str' in item)) continue;
        words.push({ str: item.str, x: item.transform[4], y: item.transform[5], width: item.width, height: item.height || 10 });
      }
      lines.push(...linesOf(words));
    }
  } finally {
    void doc.destroy();
    port.terminate();
    pdfjs.GlobalWorkerOptions.workerPort = null;
  }
  return lines;
}
