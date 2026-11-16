import { useRef, useState, type DragEvent, type ReactNode } from 'react';
import { uploadLabelPicture } from '../../api';
import { useToast } from '../ui';

/*
 * A photo added straight from the phone or the computer (owner, 2026-11-16: the Lid and side labels form had "no photo
 * add and drop option", only the Library). The box takes a dropped picture or one picked with the button its children
 * draw, sends it to the label pictures, and hands back its id and address.
 *
 * The server keeps a label picture as a PNG or WebP of at most 4 MB (a cut-out must stay see-through), so a phone's
 * JPEG, or anything bigger, is redrawn here first: 1600 px on its long edge, as WebP, else PNG.
 */

const KEPT_AS_SENT = ['image/png', 'image/webp'];
const MAX_BYTES = 4 * 1024 * 1024;
const LONG_EDGE = 1600;

/** The file as the server takes it: itself when it already fits, else redrawn smaller as WebP or PNG. */
export async function labelPictureFile(file: File): Promise<File> {
  if (KEPT_AS_SENT.includes(file.type) && file.size <= MAX_BYTES) return file;
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('That file is not a picture this browser can open. Try a JPG or a PNG.'));
      el.src = url;
    });
    const scale = Math.min(1, LONG_EDGE / Math.max(img.naturalWidth, img.naturalHeight, 1));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('This browser could not prepare the picture. Pick it from the Library instead.');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = async (type: string) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.9));
    // Safari answers a PNG when asked for WebP; either is taken.
    const out = (await blob('image/webp')) ?? (await blob('image/png'));
    if (!out || !KEPT_AS_SENT.includes(out.type)) throw new Error('This browser could not prepare the picture. Pick it from the Library instead.');
    if (out.size > MAX_BYTES) throw new Error('The picture is still over 4 MB. Save it smaller and try again.');
    return new File([out], file.name.replace(/\.[^.]+$/, '') + (out.type === 'image/webp' ? '.webp' : '.png'), { type: out.type });
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function PhotoDrop({ onUploaded, children, testId = 'photo-drop' }: {
  onUploaded: (photo: { id: number; url: string }) => void;
  /** The row inside the box. `pick` opens the file chooser; `busy` is true while a picture is on its way. */
  children: (pick: () => void, busy: boolean) => ReactNode;
  testId?: string;
}) {
  const { toast } = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);

  const take = async (file: File | null | undefined) => {
    if (!file || busy) return;
    if (!file.type.startsWith('image/')) { toast('error', 'Drop a picture: a JPG, PNG or WebP.'); return; }
    setBusy(true);
    try {
      const r = await uploadLabelPicture(await labelPictureFile(file), 'photo');
      if (r.data.url) onUploaded({ id: r.data.id, url: r.data.url });
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Could not add the picture.');
    } finally {
      setBusy(false);
    }
  };
  const drag = (on: boolean) => (e: DragEvent) => { e.preventDefault(); setOver(on); };

  return (
    // A drop target only: everything it does is also on the button inside it.
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <div
      role="group" aria-label="Photo"
      onDragOver={drag(true)} onDragEnter={drag(true)} onDragLeave={drag(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); void take(e.dataTransfer.files?.[0]); }}
      className="rounded-xl border border-dashed p-3"
      style={{ borderColor: over ? 'var(--color-primary)' : 'var(--color-border)', background: over ? 'var(--color-tone-rust-bg)' : 'transparent' }}
      data-testid={testId}
    >
      {children(() => input.current?.click(), busy)}
      <input ref={input} type="file" accept="image/*" hidden data-testid={`${testId}-file`} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; void take(f); }} />
    </div>
  );
}
