import { Upload } from 'lucide-react';
import { Button } from '../ui';
import type { ContentEditorWithUploadProps } from './types';
import { RepeaterShell } from './RepeaterShell';

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

const emptySlide = (): HeroSlideRow => ({
  image: '',
  eyebrow: '',
  title: '',
  subtitle: '',
  cta_text: '',
  cta_url: '/order/',
  cta2_text: '',
  cta2_url: '/menu',
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
export function HeroSlidesEditor({ label, description, value, onChange, triggerUpload }: ContentEditorWithUploadProps) {
  let items: HeroSlideRow[] = [];
  try {
    const parsed = JSON.parse(value || '[]');
    items = Array.isArray(parsed) ? parsed : [];
  } catch { /* empty */ }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div>
        <p style={{ fontSize: 14, fontWeight: 700, color: '#1C1408', margin: 0 }}>{label}</p>
        {description && <p style={{ fontSize: 12, color: '#9C8E7E', margin: '3px 0 0' }}>{description}</p>}
      </div>
      <RepeaterShell
        items={items}
        onChange={(next) => onChange(JSON.stringify(next))}
        createItem={emptySlide}
        itemLabel="slide"
        renderItem={(slide, idx, update) => (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#6B5D4F', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Slide Image</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                {slide.image ? (
                  <img src={slide.image} alt="" style={{ height: 54, width: 90, objectFit: 'cover', borderRadius: 8, border: '1px solid #E8E0D8', flexShrink: 0 }} />
                ) : (
                  <div style={{ height: 54, width: 90, borderRadius: 8, border: '1.5px dashed #E8E0D8', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9C8E7E', fontSize: 11, flexShrink: 0 }}>No image</div>
                )}
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<Upload size={13} />}
                  onClick={() => triggerUpload(`hero_slides_${idx}_image`, (url) => update({ image: url }))}
                >
                  Upload image
                </Button>
                <input
                  value={slide.image ?? ''}
                  onChange={(e) => update({ image: e.target.value })}
                  placeholder="/images/cafe/filename.jpg"
                  style={{ flex: 1, minWidth: 160, height: 32, borderRadius: 8, border: '1px solid #E8E0D8', background: '#fff', padding: '0 10px', fontSize: 12, fontFamily: 'inherit', outline: 'none', color: '#6B5D4F' }}
                />
              </div>
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
