import { renderPost, type PostAssets } from './draw';
import { paletteOf, type PostSize, type PostSpec } from './types';

/**
 * An animated post, recorded as it plays: the same drawing as the still
 * picture, one frame after another on a canvas the browser films. The
 * browser's own recording (MP4 on Safari, WebM on most others) is sent to
 * the server, which turns it into an MP4 every platform takes.
 */

const TYPES = ['video/mp4;codecs=avc1.42E01E', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];

function recordingType(): string | null {
  if (typeof MediaRecorder === 'undefined' || typeof HTMLCanvasElement === 'undefined') return null;
  if (typeof HTMLCanvasElement.prototype.captureStream !== 'function') return null;
  return TYPES.find((t) => MediaRecorder.isTypeSupported(t)) ?? null;
}

/** Whether this browser can film a canvas at all. */
export function canRecord(): boolean {
  return recordingType() !== null;
}

/** The post played once at its own size and filmed; `onProgress` runs from 0 to 1. */
export function recordPost(
  spec: PostSpec, layout: string, palette: string, size: PostSize, assets: PostAssets, motion: string, seconds: number,
  onProgress?: (done: number) => void,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const type = recordingType();
    if (!type) { reject(new Error('This browser cannot record a video. Try Chrome or Safari.')); return; }
    const canvas = document.createElement('canvas');
    canvas.width = size.w;
    canvas.height = size.h;
    const ctx = canvas.getContext('2d');
    if (!ctx) { reject(new Error('The video could not be drawn.')); return; }
    const P = paletteOf(palette);
    const frame = (t: number) => renderPost(ctx, size.w, size.h, spec, layout, P, assets, { motion, t, dur: seconds });
    frame(0);

    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(canvas.captureStream(30), { mimeType: type, videoBitsPerSecond: 8_000_000 });
    } catch {
      reject(new Error('This browser cannot record a video. Try Chrome or Safari.'));
      return;
    }
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
    recorder.onerror = () => reject(new Error('The recording stopped. Keep this page open and try again.'));
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: type.split(';')[0] });
      if (blob.size === 0) reject(new Error('The recording came out empty. Try again.'));
      else resolve(blob);
    };

    // A little stillness at the end, so the last frame is the finished post.
    const total = seconds + 0.4;
    const began = performance.now();
    const tick = () => {
      const t = (performance.now() - began) / 1000;
      try {
        frame(Math.min(t, seconds));
      } catch (e) {
        recorder.stop();
        reject(e instanceof Error ? e : new Error('The video could not be drawn.'));
        return;
      }
      onProgress?.(Math.min(1, t / total));
      if (t >= total) recorder.stop(); else requestAnimationFrame(tick);
    };
    recorder.start();
    requestAnimationFrame(tick);
  });
}
