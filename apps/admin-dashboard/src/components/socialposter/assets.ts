import { useEffect, useState } from 'react';
import type { PostAssets } from './draw';

/**
 * The faces and pictures a post is drawn with. Loaded once and kept: a
 * design change redraws at once, with nothing fetched again.
 */

const FACES: Array<[family: string, url: string, weight: string, style: string]> = [
  ['SP Script', '/fonts/lobster-400.woff2', '400', 'normal'],
  ['SP Caps', '/fonts/pdf/Anton-400.ttf', '400', 'normal'],
  ['SP Serif', '/fonts/pdf/Fraunces-900-Italic.ttf', '900', 'italic'],
  ['SP Sans', '/fonts/plus-jakarta-sans-800.woff2', '800', 'normal'],
  ['SP Sans', '/fonts/plus-jakarta-sans-600.woff2', '600', 'normal'],
  ['SP Thaana', '/fonts/noto-sans-thaana-700.woff2', '700', 'normal'],
];

let fontsReady: Promise<void> | null = null;

export function loadPostFonts(): Promise<void> {
  if (fontsReady) return fontsReady;
  if (typeof FontFace === 'undefined' || typeof document === 'undefined' || !document.fonts) {
    fontsReady = Promise.resolve();
    return fontsReady;
  }
  fontsReady = Promise.all(FACES.map(async ([family, url, weight, style]) => {
    try {
      const face = new FontFace(family, `url(${url})`, { weight, style });
      await face.load();
      document.fonts.add(face);
    } catch {
      // A face that will not load falls back to the system's; the post still draws.
    }
  })).then(() => undefined);
  return fontsReady;
}

const pictures = new Map<string, Promise<HTMLImageElement | null>>();

export function loadPicture(url: string): Promise<HTMLImageElement | null> {
  if (!url) return Promise.resolve(null);
  const kept = pictures.get(url);
  if (kept) return kept;
  const made = new Promise<HTMLImageElement | null>((resolve) => {
    if (typeof Image === 'undefined') { resolve(null); return; }
    const img = new Image();
    // Without this a picture from another address taints the canvas and it cannot be saved.
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
  pictures.set(url, made);
  return made;
}

const EMPTY: PostAssets = { photo: null, logoLight: null, logoDark: null, flame: null, qr: null };

/** The assets for one post: the brand's own pictures, the post's photo and its QR code. */
export function usePostAssets(photoUrl: string, qr: HTMLCanvasElement | null): { assets: PostAssets; ready: boolean } {
  const [brand, setBrand] = useState<Pick<PostAssets, 'logoLight' | 'logoDark' | 'flame'> | null>(null);
  const [photo, setPhoto] = useState<{ url: string; img: HTMLImageElement | null }>({ url: '', img: null });
  const [fonts, setFonts] = useState(false);

  useEffect(() => {
    let live = true;
    void loadPostFonts().then(() => { if (live) setFonts(true); });
    void Promise.all([loadPicture('/brand/logo-light.png'), loadPicture('/brand/logo-dark.png'), loadPicture('/brand/flame-mark.svg')])
      .then(([logoLight, logoDark, flame]) => { if (live) setBrand({ logoLight, logoDark, flame }); });
    return () => { live = false; };
  }, []);

  useEffect(() => {
    let live = true;
    void loadPicture(photoUrl).then((img) => { if (live) setPhoto({ url: photoUrl, img }); });
    return () => { live = false; };
  }, [photoUrl]);

  return {
    assets: { ...EMPTY, ...(brand ?? {}), photo: photo.url === photoUrl ? photo.img : null, qr },
    ready: fonts && brand !== null && photo.url === photoUrl,
  };
}
