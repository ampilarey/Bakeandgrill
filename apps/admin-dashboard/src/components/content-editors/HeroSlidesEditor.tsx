import { useRef, useState, type CSSProperties } from 'react';
import { Film, Images } from 'lucide-react';
import type { ContentEditorWithUploadProps } from './types';
import { RepeaterShell } from './RepeaterShell';
import { ContentImageField, type ContentImageUploadResult } from './ContentImageField';
import { MediaPicker } from '../MediaPicker';
import type { MediaAsset } from '../../api';
import { Button } from '../ui';

export type HeroSlideRow = {
  image: string;
  image_master?: string;
  image_focal_x?: number | string;
  image_focal_y?: number | string;
  image_alt?: string;
  /** Overlay darkness 0–100 (100 = current default wash). */
  dim?: number | string;
  eyebrow: string;
  title: string;
  subtitle: string;
  cta_text: string;
  cta_url: string;
  cta2_text: string;
  cta2_url: string;
  video?: string;
  video_poster?: string;
};

export type HeroSlidesEditorProps = ContentEditorWithUploadProps & {
  uploadImage?: (cropped: File, original: File) => Promise<ContentImageUploadResult>;
  /** Poster file optional when posterUrl (slide image) is provided. */
  uploadVideo?: (
    video: File,
    poster?: File | null,
    posterUrl?: string,
  ) => Promise<{ url: string; poster_url: string }>;
};

const emptySlide = (): HeroSlideRow => ({
  image: '',
  eyebrow: '',
  title: '',
  subtitle: '',
  cta_text: '',
  cta_url: '/order/',
  cta2_text: '',
  cta2_url: '/menu',
  image_focal_x: 50,
  image_focal_y: 50,
  image_alt: '',
  dim: 100,
});

const FIELDS: Array<{ key: keyof HeroSlideRow; label: string; col: 'half' | 'full'; placeholder: string }> = [
  { key: 'eyebrow', label: 'Eyebrow tag', col: 'half', placeholder: "Malé's neighbourhood café" },
  { key: 'cta_text', label: 'Button 1 text', col: 'half', placeholder: 'Order Now →' },
  { key: 'cta_url', label: 'Button 1 URL', col: 'half', placeholder: '/order/' },
  { key: 'cta2_text', label: 'Button 2 text', col: 'half', placeholder: 'View Menu' },
  { key: 'cta2_url', label: 'Button 2 URL', col: 'half', placeholder: '/menu' },
  { key: 'title', label: 'Title (HTML: <br> <em>)', col: 'full', placeholder: 'Dhivehi breakfast<br>meets <em>artisan baking</em>' },
  { key: 'subtitle', label: 'Subtitle', col: 'full', placeholder: 'Real food. Proper char. Baked fresh at 5am.' },
];

const btnStyle: CSSProperties = {
  height: 32,
  padding: '0 10px',
  borderRadius: 8,
  border: '1px solid #E8E0D8',
  background: '#fff',
  fontSize: 12,
  cursor: 'pointer',
  fontFamily: 'inherit',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
};

type LibraryTarget = { idx: number; kind: 'video' | 'poster' } | null;

/** Unlimited hero slides array editor (replaces fixed hero_slide_1/2/3). */
export function HeroSlidesEditor({
  label, description, value, onChange, triggerUpload, uploadImage, uploadVideo,
}: HeroSlidesEditorProps) {
  let items: HeroSlideRow[] = [];
  try {
    const parsed = JSON.parse(value || '[]');
    items = Array.isArray(parsed) ? parsed : [];
  } catch { /* empty */ }

  const videoInput = useRef<{ idx: number; kind: 'video' | 'poster' } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const pendingVideo = useRef<{ idx: number; video?: File; poster?: File }>({ idx: 0 });
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [libraryTarget, setLibraryTarget] = useState<LibraryTarget>(null);

  const commitSlides = (next: HeroSlideRow[]) => onChange(JSON.stringify(next));

  const finishVideoUpload = async (idx: number, video: File, poster: File | null | undefined, posterUrl?: string) => {
    if (!uploadVideo) return;
    if (!poster && !posterUrl) {
      setStatus('Video selected — add a poster, or set a slide image first (used as poster).');
      return;
    }
    setBusy(true);
    setStatus('Uploading video…');
    try {
      const res = await uploadVideo(video, poster ?? null, posterUrl);
      commitSlides(items.map((s, i) => (
        i === idx
          ? { ...s, video: res.url, video_poster: res.poster_url, image: s.image || res.poster_url }
          : s
      )));
      pendingVideo.current = { idx };
      setStatus('Video added.');
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Video upload failed');
    } finally {
      setBusy(false);
    }
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    const ctx = videoInput.current;
    if (!file || !ctx) return;

    if (ctx.kind === 'video') {
      pendingVideo.current = { idx: ctx.idx, video: file, poster: pendingVideo.current.poster };
      const slide = items[ctx.idx];
      const posterUrl = (slide?.image || slide?.video_poster || '').trim() || undefined;
      const poster = pendingVideo.current.poster;
      void finishVideoUpload(ctx.idx, file, poster, posterUrl);
      return;
    }

    // Poster file picked
    pendingVideo.current = { idx: ctx.idx, video: pendingVideo.current.video, poster: file };
    const { video } = pendingVideo.current;
    if (video) {
      void finishVideoUpload(ctx.idx, video, file);
    } else {
      setStatus('Poster selected — now add a video file (or pick video from Library).');
    }
  };

  const onLibraryPick = (asset: MediaAsset) => {
    if (!libraryTarget) return;
    const { idx, kind } = libraryTarget;
    setLibraryTarget(null);
    if (kind === 'video') {
      const slide = items[idx];
      const poster = asset.thumb_url || slide?.image || slide?.video_poster || '';
      commitSlides(items.map((s, i) => (
        i === idx
          ? {
              ...s,
              video: asset.url,
              video_poster: poster || s.video_poster || '',
              image: s.image || poster || asset.thumb_url || '',
            }
          : s
      )));
      setStatus('Video attached from library.');
      return;
    }
    // poster from library
    const videoFile = pendingVideo.current.video;
    if (videoFile && pendingVideo.current.idx === idx) {
      void finishVideoUpload(idx, videoFile, null, asset.url);
      return;
    }
    commitSlides(items.map((s, i) => (i === idx ? { ...s, video_poster: asset.url, image: s.image || asset.url } : s)));
    setStatus('Poster set from library.');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div>
        <p style={{ fontSize: 14, fontWeight: 700, color: '#1C1408', margin: 0 }}>{label}</p>
        {description && <p style={{ fontSize: 12, color: '#9C8E7E', margin: '3px 0 0' }}>{description}</p>}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="video/mp4,video/webm,video/quicktime,.mov,image/*,.heic,.heif"
        style={{ display: 'none' }}
        onChange={onFileChange}
      />
      {status ? (
        <p style={{ margin: 0, fontSize: 12, color: busy ? '#9C8E7E' : '#6B5D4F' }} role="status">{status}</p>
      ) : null}
      <RepeaterShell
        items={items}
        onChange={(next) => onChange(JSON.stringify(next))}
        createItem={emptySlide}
        itemLabel="slide"
        renderItem={(slide, idx, update) => {
          const dim = Math.max(0, Math.min(100, Number(slide.dim ?? 100)));
          return (
            <>
              {uploadImage ? (
                <ContentImageField
                  imageUrl={slide.image || ''}
                  imageAlt={slide.image_alt || ''}
                  focalX={slide.image_focal_x}
                  focalY={slide.image_focal_y}
                  upload={uploadImage}
                  onChange={(patch) => update(patch)}
                />
              ) : (
                <button type="button" onClick={() => triggerUpload(`hero_slides_${idx}_image`, (url) => update({ image: url }))}>
                  Upload image
                </button>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '8px 0' }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: '#6B5D4F' }}>
                  Dim overlay — {dim}%
                </label>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={dim}
                  onChange={(e) => update({ dim: Number(e.target.value) })}
                  style={{ width: '100%', maxWidth: 320, accentColor: '#D4813A' }}
                  aria-label="Hero dim overlay"
                />
                <p style={{ margin: 0, fontSize: 11, color: '#9C8E7E' }}>
                  0 = bright media · 100 = dark wash (default). Applies to website + order app.
                </p>
              </div>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <button
                  type="button"
                  disabled={!uploadVideo || busy}
                  onClick={() => {
                    videoInput.current = { idx, kind: 'video' };
                    if (fileRef.current) fileRef.current.accept = 'video/mp4,video/webm,video/quicktime,.mov';
                    fileRef.current?.click();
                  }}
                  style={btnStyle}
                >
                  <Film size={13} />
                  {slide.video ? 'Replace video' : 'Upload video'}
                </button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  icon={<Images size={13} />}
                  disabled={busy}
                  onClick={() => setLibraryTarget({ idx, kind: 'video' })}
                >
                  Video library
                </Button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    videoInput.current = { idx, kind: 'poster' };
                    if (fileRef.current) fileRef.current.accept = 'image/*,.heic,.heif';
                    fileRef.current?.click();
                  }}
                  style={btnStyle}
                >
                  {slide.video_poster ? 'Replace poster' : 'Upload poster'}
                </button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  icon={<Images size={13} />}
                  disabled={busy}
                  onClick={() => setLibraryTarget({ idx, kind: 'poster' })}
                >
                  Poster library
                </Button>
                {slide.video ? (
                  <button
                    type="button"
                    onClick={() => {
                      update({ video: '', video_poster: '' });
                      setStatus('');
                    }}
                    style={{ ...btnStyle, background: '#FFF7ED' }}
                  >
                    Clear video
                  </button>
                ) : null}
              </div>
              {slide.video ? (
                <p style={{ margin: 0, fontSize: 11, color: '#6B5D4F' }}>
                  Video on · poster {slide.video_poster || slide.image || '(none)'}
                </p>
              ) : (
                <p style={{ margin: 0, fontSize: 11, color: '#9C8E7E' }}>
                  Tip: set a slide image first, then upload video — image is used as the poster automatically.
                </p>
              )}

              <div className="form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {FIELDS.map((f) => (
                  <div key={f.key} style={{ display: 'flex', flexDirection: 'column', gap: 4, gridColumn: f.col === 'full' ? '1 / -1' : undefined }}>
                    <label style={{ fontSize: 11, fontWeight: 600, color: '#6B5D4F' }}>{f.label}</label>
                    <input
                      value={String(slide[f.key] ?? '')}
                      onChange={(e) => update({ [f.key]: e.target.value } as Partial<HeroSlideRow>)}
                      placeholder={f.placeholder}
                      style={{ height: 32, borderRadius: 8, border: '1px solid #E8E0D8', background: '#fff', padding: '0 10px', fontSize: 13, fontFamily: 'inherit', outline: 'none', color: '#1C1408' }}
                    />
                  </div>
                ))}
              </div>
            </>
          );
        }}
      />
      <MediaPicker
        open={libraryTarget !== null}
        onClose={() => setLibraryTarget(null)}
        mediaType={libraryTarget?.kind === 'video' ? 'video' : 'image'}
        title={libraryTarget?.kind === 'video' ? 'Pick hero video' : 'Pick video poster'}
        onPick={onLibraryPick}
      />
    </div>
  );
}
