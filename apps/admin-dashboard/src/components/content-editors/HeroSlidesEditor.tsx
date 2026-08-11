import { useRef, useState, type CSSProperties } from 'react';
import { Clapperboard, EyeOff, Film, Images } from 'lucide-react';
import type { ContentEditorWithUploadProps } from './types';
import { RepeaterShell } from './RepeaterShell';
import { ContentImageField, type ContentImageUploadResult } from './ContentImageField';
import { MediaPicker } from '../MediaPicker';
import { VideoStudioModal } from '../VideoStudioModal';
import type { MediaAsset } from '../../api';
import { Button, Toggle } from '../ui';

export type HeroSlideRow = {
  image: string;
  image_master?: string;
  image_focal_x?: number | string;
  image_focal_y?: number | string;
  image_alt?: string;
  /** Overlay darkness 0–100 (100 = current default wash). */
  dim?: number | string;
  /**
   * Customer visibility. Absent or true = Showing (legacy slides stay live).
   * Explicit false = Hidden — kept in admin, skipped by website + order app.
   */
  showing?: boolean;
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

/** Absent flag means visible — matches HeroSlides::isSlideShowing / order app. */
export function isHeroSlideShowing(slide: { showing?: boolean }): boolean {
  return slide.showing !== false;
}

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
  showing: true,
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
  border: '1px solid var(--color-border)',
  background: 'var(--color-surface)',
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
  const [studioIdx, setStudioIdx] = useState<number | null>(null);

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
      setStatus('Video added — opening editor…');
      setStudioIdx(idx);
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
        <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-text)', margin: 0 }}>{label}</p>
        {description && <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: '3px 0 0' }}>{description}</p>}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="video/mp4,video/webm,video/quicktime,.mov,image/*,.heic,.heif"
        style={{ display: 'none' }}
        onChange={onFileChange}
      />
      {status ? (
        <p style={{ margin: 0, fontSize: 12, color: busy ? 'var(--color-text-muted)' : 'var(--color-text-secondary)' }} role="status">{status}</p>
      ) : null}
      <RepeaterShell
        items={items}
        onChange={(next) => onChange(JSON.stringify(next))}
        createItem={emptySlide}
        itemLabel="slide"
        renderItem={(slide, idx, update) => {
          const dim = Math.max(0, Math.min(100, Number(slide.dim ?? 100)));
          const showing = isHeroSlideShowing(slide);
          return (
            <div
              data-testid={`hero-slide-${idx}`}
              data-showing={showing ? 'true' : 'false'}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                opacity: showing ? 1 : 0.72,
              }}
            >
              <div
                data-testid={`hero-slide-visibility-${idx}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  flexWrap: 'wrap',
                  padding: '8px 10px',
                  borderRadius: 10,
                  border: showing
                    ? '1px solid var(--color-border)'
                    : '1px solid var(--color-warning)',
                  background: showing ? 'var(--color-bg)' : 'var(--color-warning-bg)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                  {!showing ? <EyeOff size={14} color="var(--color-warning-strong)" aria-hidden /> : null}
                  <div>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--color-text)' }}>
                      {showing ? 'Showing' : 'Hidden'}
                    </p>
                    <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--color-text-secondary)' }}>
                      {showing
                        ? 'Customers can see this slide.'
                        : 'Kept here for editing — customers will not see it.'}
                    </p>
                  </div>
                </div>
                <Toggle
                  checked={showing}
                  onChange={(next) => update({ showing: next })}
                  size="sm"
                />
              </div>

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
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)' }}>
                  Dim overlay — {dim}%
                </label>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={dim}
                  onChange={(e) => update({ dim: Number(e.target.value) })}
                  style={{ width: '100%', maxWidth: 320, accentColor: 'var(--color-primary)' }}
                  aria-label="Hero dim overlay"
                />
                <p style={{ margin: 0, fontSize: 11, color: 'var(--color-text-muted)' }}>
                  0 = bright media · 100 = dark wash (default). Applies to website + order app.
                </p>
              </div>

              <div
                data-testid="hero-video-editor"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                  padding: 12,
                  borderRadius: 12,
                  border: '1.5px solid #E8D4B8',
                  background: '#FFFBF5',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <Clapperboard size={16} color="var(--color-primary)" />
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--color-text)' }}>Video editor</p>
                  <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
                    Trim · crop · poster · export
                  </span>
                </div>

                {slide.video ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div
                      style={{
                        position: 'relative',
                        width: 120,
                        height: 68,
                        borderRadius: 8,
                        overflow: 'hidden',
                        background: 'var(--color-text)',
                        flexShrink: 0,
                        border: '1px solid var(--color-border)',
                      }}
                    >
                      {(slide.video_poster || slide.image) ? (
                        <img
                          src={slide.video_poster || slide.image}
                          alt=""
                          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                        />
                      ) : (
                        <video
                          src={slide.video}
                          muted
                          playsInline
                          preload="metadata"
                          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                        />
                      )}
                      <span
                        aria-hidden
                        style={{
                          position: 'absolute',
                          inset: 0,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          background: 'rgba(28,20,8,0.35)',
                        }}
                      >
                        <Film size={22} color="#fff" />
                      </span>
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: 'var(--color-text)' }}>Video attached</p>
                      <p
                        style={{
                          margin: '3px 0 0',
                          fontSize: 11,
                          color: 'var(--color-text-secondary)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                        title={slide.video}
                      >
                        {slide.video}
                      </p>
                    </div>
                  </div>
                ) : (
                  <p style={{ margin: 0, fontSize: 12, color: 'var(--color-text-secondary)' }}>
                    1) Upload or pick a video below · 2) Click <strong>Open video editor</strong> to trim, crop, and set a poster.
                  </p>
                )}

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
                  <Button
                    type="button"
                    size="sm"
                    icon={<Clapperboard size={13} />}
                    disabled={busy || !slide.video}
                    onClick={() => setStudioIdx(idx)}
                    title={!slide.video ? 'Upload or pick a video first' : 'Open trim / crop / poster editor'}
                  >
                    Open video editor
                  </Button>
                  {slide.video ? (
                    <button
                      type="button"
                      onClick={() => {
                        update({ video: '', video_poster: '' });
                        setStatus('');
                      }}
                      style={{ ...btnStyle, background: 'var(--color-warning-bg)' }}
                    >
                      Clear video
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {FIELDS.map((f) => (
                  <div key={f.key} style={{ display: 'flex', flexDirection: 'column', gap: 4, gridColumn: f.col === 'full' ? '1 / -1' : undefined }}>
                    <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)' }}>{f.label}</label>
                    <input
                      value={String(slide[f.key] ?? '')}
                      onChange={(e) => update({ [f.key]: e.target.value } as Partial<HeroSlideRow>)}
                      placeholder={f.placeholder}
                      style={{ height: 32, borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-surface)', padding: '0 10px', fontSize: 13, fontFamily: 'inherit', outline: 'none', color: 'var(--color-text)' }}
                    />
                  </div>
                ))}
              </div>
            </div>
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
      {studioIdx !== null && items[studioIdx]?.video ? (
        <VideoStudioModal
          open
          sourceUrl={items[studioIdx].video || ''}
          onClose={() => setStudioIdx(null)}
          onExported={(res) => {
            commitSlides(items.map((s, i) => (
              i === studioIdx
                ? {
                    ...s,
                    video: res.url,
                    video_poster: res.poster_url,
                    image: s.image || res.poster_url,
                  }
                : s
            )));
            setStudioIdx(null);
            setStatus('Video studio export applied to this slide.');
          }}
        />
      ) : null}
    </div>
  );
}
