type Props = {
  title: string;
  description: string;
  onTitleChange: (v: string) => void;
  onDescriptionChange: (v: string) => void;
  titleLabel?: string;
  descriptionLabel?: string;
};

const TITLE_SOFT = 60;
const DESC_SOFT = 160;

function Counter({ value, soft }: { value: number; soft: number }) {
  const over = value > soft;
  return (
    <span style={{ fontSize: 11, fontWeight: 600, color: over ? '#B91C1C' : 'var(--color-text-muted)' }}>
      {value}/{soft}
    </span>
  );
}

/** Google-style SEO snippet with character counters for meta title/description. */
export function SeoSnippetPreview({
  title,
  description,
  onTitleChange,
  onDescriptionChange,
  titleLabel = 'Meta title',
  descriptionLabel = 'Meta description',
}: Props) {
  const displayTitle = title.trim() || 'Page title';
  const displayDesc = description.trim() || 'Add a meta description so search results show a clear preview.';

  return (
    <div data-testid="seo-snippet" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text)' }}>{titleLabel}</label>
          <Counter value={title.length} soft={TITLE_SOFT} />
        </div>
        <input
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          style={{
            width: '100%', height: 44, borderRadius: 10, border: '1px solid var(--color-border)',
            padding: '0 12px', fontFamily: 'inherit', fontSize: 14,
          }}
        />
      </div>
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text)' }}>{descriptionLabel}</label>
          <Counter value={description.length} soft={DESC_SOFT} />
        </div>
        <textarea
          value={description}
          onChange={(e) => onDescriptionChange(e.target.value)}
          rows={3}
          style={{
            width: '100%', borderRadius: 10, border: '1px solid var(--color-border)', padding: 10,
            fontFamily: 'inherit', fontSize: 13, resize: 'vertical',
          }}
        />
      </div>
      {/* Preview fidelity: mocks a Google SERP — must not follow admin theme */}
      <div
        style={{
          borderRadius: 10, border: '1px solid #E8E0D8', background: '#F8F6F3', padding: 12,
        }}
      >
        <div style={{ fontSize: 11, color: '#9C8E7E', marginBottom: 6 }}>Search preview</div>
        <div style={{ fontSize: 18, color: '#1a0dab', fontFamily: 'Arial, sans-serif', lineHeight: 1.3 }}>
          {displayTitle.length > TITLE_SOFT ? `${displayTitle.slice(0, TITLE_SOFT - 1)}…` : displayTitle}
        </div>
        <div style={{ fontSize: 13, color: '#006621', fontFamily: 'Arial, sans-serif', marginTop: 2 }}>
          bakeandgrill.mv
        </div>
        <div style={{ fontSize: 13, color: '#545454', fontFamily: 'Arial, sans-serif', marginTop: 4, lineHeight: 1.4 }}>
          {displayDesc.length > DESC_SOFT ? `${displayDesc.slice(0, DESC_SOFT - 1)}…` : displayDesc}
        </div>
      </div>
    </div>
  );
}
