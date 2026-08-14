import { useRef, useState, type ReactNode } from 'react';
import {
  ChevronDown, ChevronUp, Clapperboard, Copy, EyeOff, Film, Images, Plus, Trash2,
} from 'lucide-react';
import type { ContentEditorWithUploadProps } from '../types';
import { RepeaterShell } from '../RepeaterShell';
import { ContentImageField, type ContentImageUploadResult } from '../ContentImageField';
import { MediaPicker } from '../../MediaPicker';
import { VideoStudioModal } from '../../VideoStudioModal';
import type { MediaAsset } from '../../../api';
import { Button, Toggle } from '../../ui';
import { ContentEditorSheet } from '../../ContentEditorSheet';
import {
  formatHeroSlideScheduleLabel,
  resolveHeroSlidePresentation,
  withHeroPresentationFields,
  type HeroElementKey,
  type HeroPresentationPatch,
} from '../../../utils/heroSlidePresentation';
import { HeroElementBgEditor } from './HeroElementBgEditor';
import {
  btnStyle,
  emptySlide,
  FIELDS,
  isHeroSlideShowing,
  stripHtml,
  type HeroSlideRow,
  type LibraryTarget,
} from './heroSlidesModel';

export type HeroSlidesEditorProps = ContentEditorWithUploadProps & {
  uploadImage?: (cropped: File, original: File) => Promise<ContentImageUploadResult>;
  /** Poster file optional when posterUrl (slide image) is provided. */
  uploadVideo?: (
    video: File,
    poster?: File | null,
    posterUrl?: string,
  ) => Promise<{ url: string; poster_url: string }>;
  /**
   * Mobile: compact slide overview + full-screen slide editor sheet.
   * Desktop behaviour unchanged when false/undefined.
   */
  mobileMode?: boolean;
  /**
   * Website desktop Stage C — slides as selectable cards across the top,
   * fields for the selected slide in a two-column grid below.
   */
  wideLayout?: boolean;
  /** Publish-state banner shown inside nested slide sheets. */
  draftStatus?: ReactNode;
  /** Content Hub schedule controls — surfaced inside the slide sheet on mobile. */
  scheduleSlot?: ReactNode;
};

/** Unlimited hero slides array editor (replaces fixed hero_slide_1/2/3). */
export function HeroSlidesEditor({
  label, description, value, onChange, triggerUpload, uploadImage, uploadVideo,
  mobileMode = false,
  wideLayout = false,
  draftStatus,
  scheduleSlot,
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
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [heroReorderMode, setHeroReorderMode] = useState(false);
  const [openElementPanels, setOpenElementPanels] = useState<Record<string, boolean>>({});
  const [advancedHexOpen, setAdvancedHexOpen] = useState<Record<string, boolean>>({});

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
    const videoFile = pendingVideo.current.video;
    if (videoFile && pendingVideo.current.idx === idx) {
      void finishVideoUpload(idx, videoFile, null, asset.url);
      return;
    }
    commitSlides(items.map((s, i) => (i === idx ? { ...s, video_poster: asset.url, image: s.image || asset.url } : s)));
    setStatus('Poster set from library.');
  };

  const updateAt = (idx: number, patch: Partial<HeroSlideRow>) => {
    commitSlides(items.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  };

  const applyPresentation = (idx: number, patch: HeroPresentationPatch) => {
    // Replace the row so legacy `dim` cannot linger after merge.
    commitSlides(items.map((s, i) => (i === idx ? withHeroPresentationFields(s, patch) : s)));
  };

  const renderElementBgEditor = (slide: HeroSlideRow, idx: number, key: HeroElementKey) => {
    const panelKey = `${idx}-${key}`;
    const open = Boolean(openElementPanels[panelKey]);
    const storedToken = String((slide as Record<string, unknown>)[`${key}_bg`] ?? '').trim().toLowerCase();
    const isCustomHex = Boolean(storedToken) && !['none', 'dark', 'light', 'amber', 'brand_dark', 'glass'].includes(storedToken);
    const advOpen = Boolean(advancedHexOpen[panelKey]) || isCustomHex;

    return (
      <HeroElementBgEditor
        key={key}
        slide={slide}
        idx={idx}
        elementKey={key}
        open={open}
        onToggleOpen={() => setOpenElementPanels((m) => ({ ...m, [panelKey]: !open }))}
        advancedOpen={advOpen}
        onToggleAdvanced={() => setAdvancedHexOpen((m) => ({ ...m, [panelKey]: !advOpen }))}
        applyPresentation={applyPresentation}
      />
    );
  };

  const toDatetimeLocalValue = (raw: string | undefined) => {
    const s = String(raw ?? '').trim();
    if (!s) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return `${s}T00:00`;
    const m = /^(\d{4}-\d{2}-\d{2})[T\s](\d{2}):(\d{2})/.exec(s);
    if (m) return `${m[1]}T${m[2]}:${m[3]}`;
    return '';
  };

  /** Showing/Hidden toggle + schedule label + start/end dates. Reused by the
   *  default/mobile stack (original position) and the wide LOOK column. */
  const renderVisibilityAndSchedule = (slide: HeroSlideRow, idx: number, update: (patch: Partial<HeroSlideRow>) => void) => {
    const showing = isHeroSlideShowing(slide);
    const scheduleLabel = formatHeroSlideScheduleLabel(slide);
    return (
      <>
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
              <p
                data-testid={`hero-slide-schedule-label-${idx}`}
                style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--color-text-secondary)' }}
              >
                {scheduleLabel}
              </p>
            </div>
          </div>
          <Toggle
            checked={showing}
            onChange={(next) => update({ showing: next })}
            size="sm"
          />
        </div>

        <div
          data-testid={`hero-slide-dates-${idx}`}
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            padding: '8px 10px',
            borderRadius: 10,
            border: '1px solid var(--color-border)',
            background: 'var(--color-bg)',
          }}
        >
          <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: 'var(--color-text)' }}>
            Slide dates
          </p>
          <p style={{ margin: 0, fontSize: 11, color: 'var(--color-text-muted)' }}>
            Optional. Empty means always. Hidden above always wins. Times use the restaurant clock (Maldives).
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: '1 1 140px', fontSize: 11, color: 'var(--color-text-secondary)' }}>
              Start
              <input
                type="datetime-local"
                data-testid={`hero-show-from-${idx}`}
                value={toDatetimeLocalValue(slide.show_from)}
                onChange={(e) => applyPresentation(idx, { show_from: e.target.value || null })}
                style={{
                  height: 40,
                  borderRadius: 8,
                  border: '1px solid var(--color-border)',
                  background: 'var(--color-surface)',
                  padding: '0 8px',
                  fontFamily: 'inherit',
                  color: 'var(--color-text)',
                }}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: '1 1 140px', fontSize: 11, color: 'var(--color-text-secondary)' }}>
              End
              <input
                type="datetime-local"
                data-testid={`hero-show-until-${idx}`}
                value={toDatetimeLocalValue(slide.show_until)}
                onChange={(e) => applyPresentation(idx, { show_until: e.target.value || null })}
                style={{
                  height: 40,
                  borderRadius: 8,
                  border: '1px solid var(--color-border)',
                  background: 'var(--color-surface)',
                  padding: '0 8px',
                  fontFamily: 'inherit',
                  color: 'var(--color-text)',
                }}
              />
            </label>
          </div>
        </div>
      </>
    );
  };

  /** The slide image (focal/alt/replace/crop). Reused by the default/mobile
   *  stack and the wide PICTURE column. */
  const renderImageBlock = (slide: HeroSlideRow, idx: number, update: (patch: Partial<HeroSlideRow>) => void) => (
    uploadImage ? (
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
    )
  );

  /** Photo brightness, text background, text position, per-element swatches.
   *  Reused by the default/mobile stack and the wide LOOK column. */
  const renderPresentationBlock = (slide: HeroSlideRow, idx: number) => {
    const presentation = resolveHeroSlidePresentation(slide);
    return (
      <div
        data-testid={`hero-slide-presentation-${idx}`}
        style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '8px 0' }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label
            htmlFor={`hero-${idx}-photo-brightness`}
            style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)' }}
          >
            Photo brightness — {presentation.photo_brightness}%
          </label>
          <input
            id={`hero-${idx}-photo-brightness`}
            type="range"
            min={0}
            max={100}
            value={presentation.photo_brightness}
            onChange={(e) => applyPresentation(idx, { photo_brightness: Number(e.target.value) })}
            style={{ width: '100%', maxWidth: 320, accentColor: 'var(--color-primary)' }}
            aria-label="Photo brightness"
          />
          <p style={{ margin: 0, fontSize: 11, color: 'var(--color-text-muted)' }}>
            Higher keeps the photo looking like the photo. Lower knocks it back.
          </p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label
            htmlFor={`hero-${idx}-text-background`}
            style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)' }}
          >
            Text background — {presentation.text_background}%
          </label>
          <input
            id={`hero-${idx}-text-background`}
            type="range"
            min={0}
            max={100}
            value={presentation.text_background}
            onChange={(e) => applyPresentation(idx, { text_background: Number(e.target.value) })}
            style={{ width: '100%', maxWidth: 320, accentColor: 'var(--color-primary)' }}
            aria-label="Text background"
          />
          <p style={{ margin: 0, fontSize: 11, color: 'var(--color-text-muted)' }}>
            Dark panel behind the words only — the photo stays untouched.
          </p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)' }}>
            Text position
          </span>
          <div
            role="radiogroup"
            aria-label="Text position"
            style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}
          >
            {([
              ['top', 'Top'],
              ['middle', 'Middle'],
              ['bottom', 'Bottom'],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={presentation.text_position === value}
                data-testid={`hero-text-position-${idx}-${value}`}
                onClick={() => applyPresentation(idx, { text_position: value })}
                style={{
                  ...btnStyle,
                  fontWeight: presentation.text_position === value ? 700 : 600,
                  background: presentation.text_position === value
                    ? 'var(--color-warning-bg)'
                    : 'var(--color-surface)',
                  borderColor: presentation.text_position === value
                    ? 'var(--color-primary)'
                    : 'var(--color-border)',
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div
          data-testid={`hero-element-bg-group-${idx}`}
          style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
        >
          <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: 'var(--color-text)' }}>
            Per-element backgrounds
          </p>
          <p style={{ margin: 0, fontSize: 11, color: 'var(--color-text-muted)' }}>
            Leave on Default to keep today’s look. Open only the pieces you want to change.
          </p>
          {(['eyebrow', 'title', 'subtitle', 'cta1', 'cta2'] as HeroElementKey[]).map((key) =>
            renderElementBgEditor(slide, idx, key))}
        </div>
      </div>
    );
  };

  /** Video upload/replace/trim entry points. Reused by the default/mobile
   *  stack and the wide PICTURE column. */
  const renderVideoBlock = (slide: HeroSlideRow, idx: number, update: (patch: Partial<HeroSlideRow>) => void) => (
    <div
      data-testid="hero-video-editor"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        padding: 12,
        borderRadius: 12,
        border: '1.5px solid var(--color-border)',
        background: 'var(--color-bg)',
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
                overflowWrap: 'anywhere',
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
  );

  /** Eyebrow / title / subtitle / CTA1 / CTA2 text + URL fields. Reused by
   *  the default/mobile grid and the wide WORDS column (stacked). */
  const renderWordsFieldsBlock = (slide: HeroSlideRow, idx: number, update: (patch: Partial<HeroSlideRow>) => void, multiline: boolean) => (
    <div className="form-grid-2 hero-slide-fields" style={{ display: 'grid', gridTemplateColumns: multiline ? '1fr' : '1fr 1fr', gap: 10 }}>
      {FIELDS.map((f) => {
        const useArea = multiline || f.multiline;
        return (
          <div key={f.key} style={{ display: 'flex', flexDirection: 'column', gap: 4, gridColumn: (!multiline && f.col === 'full') || useArea ? '1 / -1' : undefined }}>
            <label htmlFor={`hero-${idx}-${f.key}`} style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)' }}>{f.label}</label>
            {useArea ? (
              <textarea
                id={`hero-${idx}-${f.key}`}
                value={String(slide[f.key] ?? '')}
                onChange={(e) => update({ [f.key]: e.target.value } as Partial<HeroSlideRow>)}
                placeholder={f.placeholder}
                rows={f.key === 'title' || f.key === 'subtitle' ? 3 : 2}
                style={{
                  minHeight: 44,
                  borderRadius: 8,
                  border: '1px solid var(--color-border)',
                  background: 'var(--color-surface)',
                  padding: '8px 10px',
                  fontSize: 13,
                  fontFamily: 'inherit',
                  outline: 'none',
                  color: 'var(--color-text)',
                  resize: 'vertical',
                  width: '100%',
                  overflowWrap: 'anywhere',
                }}
              />
            ) : (
              <input
                id={`hero-${idx}-${f.key}`}
                value={String(slide[f.key] ?? '')}
                onChange={(e) => update({ [f.key]: e.target.value } as Partial<HeroSlideRow>)}
                placeholder={f.placeholder}
                style={{ height: 32, borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-surface)', padding: '0 10px', fontSize: 13, fontFamily: 'inherit', outline: 'none', color: 'var(--color-text)', width: '100%' }}
              />
            )}
          </div>
        );
      })}
    </div>
  );

  /** Original single-column stack — mobile sheet + default RepeaterShell.
   *  Composes the same sub-blocks the wide layout's 3 columns use below. */
  const renderSlideFields = (slide: HeroSlideRow, idx: number, update: (patch: Partial<HeroSlideRow>) => void, multiline: boolean) => {
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
        {renderVisibilityAndSchedule(slide, idx, update)}
        {renderImageBlock(slide, idx, update)}
        {renderPresentationBlock(slide, idx)}
        {renderVideoBlock(slide, idx, update)}
        {renderWordsFieldsBlock(slide, idx, update, multiline)}
      </div>
    );
  };

  /** Small caps heading shared by the three wide-layout columns. */
  const renderColumnHeading = (text: string) => (
    <p
      style={{
        margin: 0,
        fontSize: 11,
        fontWeight: 800,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        color: 'var(--color-text-muted)',
      }}
    >
      {text}
    </p>
  );

  /** Website desktop Stage C — PICTURE column: image + video, full width. */
  const renderPictureColumn = (slide: HeroSlideRow, idx: number, update: (patch: Partial<HeroSlideRow>) => void) => (
    <div className="hero-slides-wide-col" data-testid={`hero-slide-wide-picture-${idx}`} style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
      {renderColumnHeading('Picture')}
      {renderImageBlock(slide, idx, update)}
      {renderVideoBlock(slide, idx, update)}
    </div>
  );

  /** Website desktop Stage C — WORDS column: eyebrow/title/subtitle/CTAs, stacked. */
  const renderWordsColumn = (slide: HeroSlideRow, idx: number, update: (patch: Partial<HeroSlideRow>) => void) => (
    <div className="hero-slides-wide-col" data-testid={`hero-slide-wide-words-${idx}`} style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
      {renderColumnHeading('Words')}
      {renderWordsFieldsBlock(slide, idx, update, true)}
    </div>
  );

  /** Website desktop Stage C — LOOK column: brightness/text bg/position/swatches + Showing/dates. */
  const renderLookColumn = (slide: HeroSlideRow, idx: number, update: (patch: Partial<HeroSlideRow>) => void) => (
    <div className="hero-slides-wide-col" data-testid={`hero-slide-wide-look-${idx}`} style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
      {renderColumnHeading('Look')}
      {renderVisibilityAndSchedule(slide, idx, update)}
      {renderPresentationBlock(slide, idx)}
    </div>
  );

  const sharedChrome = (
    <>
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
    </>
  );

  if (mobileMode) {
    const editing = editingIdx !== null ? items[editingIdx] : null;
    return (
      <div
        className="hero-slides-mobile"
        data-testid="hero-slides-mobile"
        data-reorder={heroReorderMode ? 'true' : 'false'}
        style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-text)', margin: 0 }}>{label}</p>
            {description && <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: '3px 0 0' }}>{description}</p>}
          </div>
          <button
            type="button"
            data-testid="hero-reorder-toggle"
            aria-pressed={heroReorderMode}
            className="hub-block-edit-btn"
            onClick={() => setHeroReorderMode((v) => !v)}
          >
            {heroReorderMode ? 'Done reordering' : 'Reorder slides'}
          </button>
        </div>
        {sharedChrome}
        <div className="hero-slide-overview-list" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {items.map((slide, idx) => {
            const showing = isHeroSlideShowing(slide);
            const titleText = stripHtml(slide.title || '') || `Slide ${idx + 1}`;
            return (
              <div
                key={idx}
                className="hero-slide-overview-row"
                data-showing={showing ? 'true' : 'false'}
              >
                <button
                  type="button"
                  className="hero-slide-overview-card"
                  data-testid={`hero-slide-overview-${idx}`}
                  disabled={heroReorderMode}
                  onClick={() => {
                    if (heroReorderMode) return;
                    setEditingIdx(idx);
                  }}
                >
                  <span className="hero-slide-overview-thumb" aria-hidden>
                    {slide.image || slide.video_poster ? (
                      <img src={slide.image || slide.video_poster} alt="" />
                    ) : (
                      <Images size={18} />
                    )}
                  </span>
                  <span className="hero-slide-overview-meta">
                    <span className="hero-slide-overview-title">{titleText}</span>
                    <span className={`hero-slide-overview-state${showing ? '' : ' hero-slide-overview-state--hidden'}`}>
                      {showing ? 'Showing' : 'Hidden'}
                      {' · '}
                      {idx + 1}
                      {' of '}
                      {items.length}
                    </span>
                  </span>
                </button>
                {heroReorderMode ? (
                  <div className="hero-slide-overview-order" role="group" aria-label={`Reorder slide ${idx + 1}`}>
                    <button
                      type="button"
                      className="hero-slide-move-btn"
                      data-testid={`hero-slide-move-up-${idx}`}
                      aria-label={`Move slide ${idx + 1} up`}
                      disabled={idx === 0}
                      onClick={() => {
                        if (idx === 0) return;
                        const next = items.slice();
                        const tmp = next[idx - 1];
                        next[idx - 1] = next[idx];
                        next[idx] = tmp;
                        commitSlides(next);
                      }}
                    >
                      <ChevronUp size={16} />
                    </button>
                    <button
                      type="button"
                      className="hero-slide-move-btn"
                      data-testid={`hero-slide-move-down-${idx}`}
                      aria-label={`Move slide ${idx + 1} down`}
                      disabled={idx === items.length - 1}
                      onClick={() => {
                        if (idx >= items.length - 1) return;
                        const next = items.slice();
                        const tmp = next[idx + 1];
                        next[idx + 1] = next[idx];
                        next[idx] = tmp;
                        commitSlides(next);
                      }}
                    >
                      <ChevronDown size={16} />
                    </button>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button
            type="button"
            size="sm"
            icon={<Plus size={14} />}
            onClick={() => {
              const next = [...items, emptySlide()];
              commitSlides(next);
              setEditingIdx(next.length - 1);
            }}
          >
            Add slide
          </Button>
        </div>

        <ContentEditorSheet
          open={editingIdx !== null && Boolean(editing)}
          title={editingIdx !== null ? `Slide ${(editingIdx ?? 0) + 1}` : 'Slide'}
          onClose={() => setEditingIdx(null)}
          status={draftStatus}
          layer={2}
          testId="hero-slide-editor-sheet"
          footer={(
            <div style={{ display: 'flex', gap: 8, width: '100%' }}>
              {editingIdx !== null ? (
                <>
                  <button
                    type="button"
                    className="hub-block-edit-btn"
                    aria-label="Duplicate slide"
                    onClick={() => {
                      const clone = { ...items[editingIdx] };
                      const next = items.slice();
                      next.splice(editingIdx + 1, 0, clone);
                      commitSlides(next);
                      setEditingIdx(editingIdx + 1);
                    }}
                  >
                    <Copy size={14} /> Duplicate
                  </button>
                  <button
                    type="button"
                    className="hub-block-edit-btn"
                    aria-label="Delete slide"
                    onClick={() => {
                      commitSlides(items.filter((_, i) => i !== editingIdx));
                      setEditingIdx(null);
                    }}
                  >
                    <Trash2 size={14} /> Delete
                  </button>
                </>
              ) : null}
              <button
                type="button"
                className="hub-block-edit-btn"
                style={{ marginLeft: 'auto', fontWeight: 700 }}
                onClick={() => setEditingIdx(null)}
              >
                Done
              </button>
            </div>
          )}
        >
          {editing && editingIdx !== null ? (
            <>
              {scheduleSlot ? (
                <div data-testid="hero-slide-schedule-slot" style={{ marginBottom: 12 }}>
                  {scheduleSlot}
                </div>
              ) : null}
              {renderSlideFields(editing, editingIdx, (patch) => updateAt(editingIdx, patch), true)}
            </>
          ) : null}
        </ContentEditorSheet>
      </div>
    );
  }

  if (wideLayout && !mobileMode) {
    const selectedIdx = editingIdx ?? 0;
    const selected = items[selectedIdx] ?? null;
    return (
      <div
        className="hero-slides-wide"
        data-testid="hero-slides-wide"
        style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
      >
        <div>
          <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-text)', margin: 0 }}>{label}</p>
          {description && <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: '3px 0 0' }}>{description}</p>}
        </div>
        {draftStatus ? (
          <div className="hero-slides-wide-draft" data-testid="hero-wide-draft-status">
            {draftStatus}
          </div>
        ) : null}
        {sharedChrome}
        <div
          className="hero-slides-wide-rail"
          data-testid="hero-slides-wide-rail"
          style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 4 }}
        >
          {items.map((slide, idx) => {
            const showing = isHeroSlideShowing(slide);
            const titleText = stripHtml(slide.title || '') || `Slide ${idx + 1}`;
            const pressed = selectedIdx === idx;
            return (
              <button
                key={idx}
                type="button"
                className={`hero-slide-wide-card${pressed ? ' hero-slide-wide-card--active' : ''}`}
                data-testid={`hero-slide-wide-${idx}`}
                aria-pressed={pressed}
                onClick={() => setEditingIdx(idx)}
                style={{
                  flex: '0 0 160px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                  textAlign: 'left',
                  padding: 8,
                  borderRadius: 12,
                  border: pressed ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
                  background: 'var(--color-surface)',
                  cursor: 'pointer',
                  minHeight: 44,
                }}
              >
                <span
                  aria-hidden
                  style={{
                    display: 'block',
                    height: 72,
                    borderRadius: 8,
                    overflow: 'hidden',
                    background: 'var(--color-bg)',
                  }}
                >
                  {slide.image || slide.video_poster ? (
                    <img
                      src={slide.image || slide.video_poster}
                      alt=""
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  ) : (
                    <span style={{ display: 'grid', placeItems: 'center', height: '100%' }}>
                      <Images size={18} />
                    </span>
                  )}
                </span>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text)' }}>{titleText}</span>
                <span style={{ fontSize: 11, color: showing ? 'var(--color-success)' : 'var(--color-text-muted)' }}>
                  {showing ? 'Showing' : 'Hidden'}
                </span>
              </button>
            );
          })}
          <button
            type="button"
            className="hero-slide-wide-add"
            data-testid="hero-slide-wide-add"
            onClick={() => {
              const next = [...items, emptySlide()];
              commitSlides(next);
              setEditingIdx(next.length - 1);
            }}
            style={{
              flex: '0 0 120px',
              minHeight: 44,
              borderRadius: 12,
              border: '1px dashed var(--color-border)',
              background: 'transparent',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: 12,
              color: 'var(--color-text-secondary)',
            }}
          >
            + Add slide
          </button>
        </div>
        {selected && items.length > 0 ? (
          <>
            <div
              className="hero-slides-wide-columns"
              data-testid="hero-slides-wide-fields"
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                gap: 20,
                alignItems: 'start',
              }}
            >
              {renderPictureColumn(selected, selectedIdx, (patch) => updateAt(selectedIdx, patch))}
              {renderWordsColumn(selected, selectedIdx, (patch) => updateAt(selectedIdx, patch))}
              {renderLookColumn(selected, selectedIdx, (patch) => updateAt(selectedIdx, patch))}
            </div>
            <div
              className="hero-slides-wide-foot"
              data-testid="hero-slides-wide-foot"
              style={{
                display: 'flex',
                gap: 8,
                paddingTop: 10,
                borderTop: '1px solid var(--color-border)',
              }}
            >
              <button
                type="button"
                className="hub-block-edit-btn"
                aria-label="Duplicate slide"
                data-testid={`hero-slide-wide-duplicate-${selectedIdx}`}
                onClick={() => {
                  const clone = { ...items[selectedIdx] };
                  const next = items.slice();
                  next.splice(selectedIdx + 1, 0, clone);
                  commitSlides(next);
                  setEditingIdx(selectedIdx + 1);
                }}
              >
                <Copy size={14} /> Duplicate
              </button>
              <button
                type="button"
                className="hub-block-edit-btn"
                aria-label="Delete slide"
                data-testid={`hero-slide-wide-delete-${selectedIdx}`}
                onClick={() => {
                  const next = items.filter((_, i) => i !== selectedIdx);
                  commitSlides(next);
                  setEditingIdx(Math.max(0, selectedIdx - 1));
                }}
              >
                <Trash2 size={14} /> Delete
              </button>
            </div>
          </>
        ) : (
          <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-muted)' }}>
            Add a slide to start editing the hero.
          </p>
        )}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div>
        <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-text)', margin: 0 }}>{label}</p>
        {description && <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: '3px 0 0' }}>{description}</p>}
      </div>
      {sharedChrome}
      <RepeaterShell
        items={items}
        onChange={(next) => onChange(JSON.stringify(next))}
        createItem={emptySlide}
        itemLabel="slide"
        renderItem={(slide, idx, update) => renderSlideFields(slide, idx, update, false)}
      />
    </div>
  );
}
