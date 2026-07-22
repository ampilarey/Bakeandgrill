import { useEffect, useState } from 'react';

type PreviewProps = {
  editor: string;
  value: string;
  appLabel: string;
};

function safeParse<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw || 'null') ?? fallback;
  } catch {
    return fallback;
  }
}

/** Read-only live preview for visual Content Studio blocks (active draft). */
export function VisualBlockPreview({ editor, value, appLabel }: PreviewProps) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(value), 200);
    return () => window.clearTimeout(t);
  }, [value]);

  return (
    <div
      data-testid="content-live-preview"
      style={{
        marginTop: 12, padding: 12, borderRadius: 12, background: '#1C1408', color: '#F8F6F3',
        fontSize: 13, lineHeight: 1.4,
      }}
    >
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#9C8E7E', marginBottom: 10 }}>
        Live preview · {appLabel}
      </div>
      {renderPreview(editor, debounced)}
    </div>
  );
}

function renderPreview(editor: string, value: string) {
  switch (editor) {
    case 'hero': {
      const parsed = safeParse<unknown>(value, []);
      const slides = Array.isArray(parsed)
        ? (parsed as Record<string, string>[])
        : parsed && typeof parsed === 'object'
          ? [parsed as Record<string, string>]
          : [];
      const slide = slides[0] || {};
      return (
        <div style={{ position: 'relative', minHeight: 120, borderRadius: 10, overflow: 'hidden', background: '#2a2118' }}>
          {slide.image ? (
            <img src={slide.image} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.45 }} />
          ) : null}
          <div style={{ position: 'relative', padding: 16 }}>
            <div style={{ fontSize: 10, color: '#9C8E7E', marginBottom: 6 }}>{slides.length} slide{slides.length === 1 ? '' : 's'}</div>
            {slide.eyebrow ? <div style={{ fontSize: 11, color: '#D4813A', fontWeight: 600, marginBottom: 4 }}>{slide.eyebrow}</div> : null}
            <div style={{ fontSize: 18, fontWeight: 700 }} dangerouslySetInnerHTML={{ __html: slide.title || 'Hero title' }} />
            {slide.subtitle ? <p style={{ margin: '6px 0 0', color: '#E8E0D8', fontSize: 12 }}>{slide.subtitle}</p> : null}
            <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
              {slide.cta_text ? <span style={{ background: '#D4813A', color: '#fff', padding: '4px 10px', borderRadius: 8, fontSize: 11 }}>{slide.cta_text}</span> : null}
              {slide.cta2_text ? <span style={{ border: '1px solid #E8E0D8', padding: '4px 10px', borderRadius: 8, fontSize: 11 }}>{slide.cta2_text}</span> : null}
            </div>
          </div>
        </div>
      );
    }
    case 'trust': {
      const items = safeParse<{ icon: string; heading: string; subtext: string }[]>(value, []);
      return (
        <div className="content-preview-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {items.map((item, i) => (
            <div key={i} style={{ background: '#2a2118', borderRadius: 8, padding: 10 }}>
              <div style={{ fontSize: 16 }}>{item.icon || '·'}</div>
              <div style={{ fontWeight: 700, marginTop: 4 }}>{item.heading || '—'}</div>
              <div style={{ color: '#9C8E7E', fontSize: 11 }}>{item.subtext}</div>
            </div>
          ))}
        </div>
      );
    }
    case 'categories': {
      const items = safeParse<{ icon: string; name: string; hook: string; image_url: string }[]>(value, []);
      return (
        <div className="content-preview-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {items.map((item, i) => (
            <div key={i} style={{ background: '#2a2118', borderRadius: 8, overflow: 'hidden' }}>
              {item.image_url ? (
                <img src={item.image_url} alt="" style={{ width: '100%', height: 56, objectFit: 'cover' }} />
              ) : (
                <div style={{ height: 56, background: '#3a2f24', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>{item.icon || '?'}</div>
              )}
              <div style={{ padding: 8 }}>
                <div style={{ fontWeight: 700 }}>{item.name || 'Category'}</div>
                <div style={{ color: '#9C8E7E', fontSize: 11 }}>{item.hook}</div>
              </div>
            </div>
          ))}
        </div>
      );
    }
    case 'proof': {
      const items = safeParse<{ value: string; label: string }[]>(value, []);
      return (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {items.map((item, i) => (
            <div key={i} style={{ textAlign: 'center', minWidth: 72 }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#D4813A' }}>{item.value || '—'}</div>
              <div style={{ fontSize: 11, color: '#9C8E7E' }}>{item.label}</div>
            </div>
          ))}
        </div>
      );
    }
    case 'about_values': {
      const items = safeParse<{ initial: string; title: string; description: string }[]>(value, []);
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {items.map((item, i) => (
            <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <div style={{ width: 28, height: 28, borderRadius: 8, background: '#D4813A', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>{item.initial || '?'}</div>
              <div>
                <div style={{ fontWeight: 700 }}>{item.title || '—'}</div>
                <div style={{ color: '#9C8E7E', fontSize: 11 }}>{item.description}</div>
              </div>
            </div>
          ))}
        </div>
      );
    }
    case 'preorder_steps': {
      const items = safeParse<{ text: string }[]>(value, []);
      return (
        <ol style={{ margin: 0, paddingLeft: 18 }}>
          {items.map((item, i) => (
            <li key={i} style={{ marginBottom: 6 }}>{item.text || '—'}</li>
          ))}
        </ol>
      );
    }
    case 'footer_links': {
      const items = safeParse<{ label: string; url: string }[]>(value, []);
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {items.map((item, i) => (
            <div key={i} style={{ color: '#D4813A' }}>{item.label || 'Link'} <span style={{ color: '#9C8E7E' }}>{item.url}</span></div>
          ))}
        </div>
      );
    }
    case 'business_hours': {
      const parsed = safeParse<Record<string, string>>(value, {});
      return (
        <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr', gap: '4px 10px', fontSize: 12 }}>
          {Object.entries(parsed).map(([day, hours]) => (
            <div key={day} style={{ display: 'contents' }}>
              <span style={{ color: '#9C8E7E', textTransform: 'capitalize' }}>{day}</span>
              <span>{hours}</span>
            </div>
          ))}
        </div>
      );
    }
    default:
      return <div style={{ color: '#9C8E7E' }}>No preview for this block.</div>;
  }
}
