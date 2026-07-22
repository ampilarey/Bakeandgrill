import { useRef } from 'react';
import type { ContentEditorWithUploadProps } from './types';
import { RepeaterShell } from './RepeaterShell';
import { ContentImageField, type ContentImageUploadResult } from './ContentImageField';

export type HeroSlideRow = {
  image: string;
  image_master?: string;
  image_focal_x?: number | string;
  image_focal_y?: number | string;
  image_alt?: string;
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
  uploadVideo?: (video: File, poster: File) => Promise<{ url: string; poster_url: string }>;
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div>
        <p style={{ fontSize: 14, fontWeight: 700, color: '#1C1408', margin: 0 }}>{label}</p>
        {description && <p style={{ fontSize: 12, color: '#9C8E7E', margin: '3px 0 0' }}>{description}</p>}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="video/mp4,video/webm,image/*"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          const ctx = videoInput.current;
          if (!file || !ctx) return;
          if (ctx.kind === 'video') {
            pendingVideo.current = { idx: ctx.idx, video: file, poster: pendingVideo.current.poster };
          } else {
            pendingVideo.current = { idx: ctx.idx, video: pendingVideo.current.video, poster: file };
          }
          const { idx, video, poster } = pendingVideo.current;
          if (video && poster && uploadVideo) {
            void uploadVideo(video, poster).then((res) => {
              const next = items.map((s, i) => (i === idx ? { ...s, video: res.url, video_poster: res.poster_url, image: s.image || res.poster_url } : s));
              onChange(JSON.stringify(next));
              pendingVideo.current = { idx };
            }).catch(() => { /* parent toast */ });
          }
        }}
      />
      <RepeaterShell
        items={items}
        onChange={(next) => onChange(JSON.stringify(next))}
        createItem={emptySlide}
        itemLabel="slide"
        renderItem={(slide, idx, update) => (
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
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                disabled={!uploadVideo}
                onClick={() => { videoInput.current = { idx, kind: 'video' }; fileRef.current?.click(); }}
                style={{ height: 32, padding: '0 10px', borderRadius: 8, border: '1px solid #E8E0D8', background: '#fff', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}
              >
                {slide.video ? 'Replace video' : 'Add muted video'}
              </button>
              <button
                type="button"
                disabled={!uploadVideo}
                onClick={() => { videoInput.current = { idx, kind: 'poster' }; fileRef.current?.click(); }}
                style={{ height: 32, padding: '0 10px', borderRadius: 8, border: '1px solid #E8E0D8', background: '#fff', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}
              >
                {slide.video_poster ? 'Replace poster' : 'Add video poster'}
              </button>
              {slide.video ? (
                <button
                  type="button"
                  onClick={() => update({ video: '', video_poster: '' })}
                  style={{ height: 32, padding: '0 10px', borderRadius: 8, border: '1px solid #E8E0D8', background: '#FFF7ED', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}
                >
                  Clear video
                </button>
              ) : null}
            </div>
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
        )}
      />
    </div>
  );
}
