import { useRef, useState, type ChangeEvent, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { Check, ChevronDown, ChevronRight, History, ImagePlus } from 'lucide-react';
import type { ContentBlock, ContentScope } from '../../api/content';
import { BRAND_KIT_CARDS, type BrandKitCardMeta, type BrandKitPreviewKind } from './brandKitConfig';

export type BrandKitCardsProps = {
  blocksByKey: Map<string, ContentBlock>;
  valueOf: (block: ContentBlock) => string;
  onSetValue: (block: ContentBlock, value: string) => void;
  onUploadFile: (block: ContentBlock, file: File) => void | Promise<void>;
  onOpenLibrary: (block: ContentBlock) => void;
  onOpenHistory: (block: ContentBlock) => void;
  historyPanel: (block: ContentBlock) => ReactNode;
  siteName?: string;
};

function isSet(value: string): boolean {
  return value.trim() !== '';
}

function Preview({
  kind,
  value,
  siteName,
}: {
  kind: BrandKitPreviewKind;
  value: string;
  siteName: string;
}) {
  if (kind === 'header-light' || kind === 'header-dark') {
    const dark = kind === 'header-dark';
    // Preview fidelity: mocks the customer site — must not follow admin theme
    return (
      <div
        data-testid={`preview-${kind}`}
        style={{
          borderRadius: 12,
          border: '1px solid var(--color-border)',
          overflow: 'hidden',
          background: dark ? 'var(--color-text)' : '#FFFDF9',
          padding: '14px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          minHeight: 64,
        }}
      >
        {value ? (
          <img
            src={value}
            alt=""
            style={{ width: 40, height: 40, objectFit: 'contain', borderRadius: 9, background: dark ? '#2a1a0a' : 'var(--color-surface)' }}
          />
        ) : (
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 9,
              background: dark ? '#2a1a0a' : '#F0EBE4',
              border: '1px dashed #C4B5A0',
            }}
          />
        )}
        <div style={{ fontWeight: 800, fontSize: 15, color: dark ? '#f5e6cc' : 'var(--color-text)' }}>{siteName}</div>
        <div style={{ marginLeft: 'auto', fontSize: 11, color: dark ? '#9c8060' : 'var(--color-text-muted)' }}>Menu · Offers</div>
      </div>
    );
  }

  if (kind === 'browser-tab') {
    return (
      <div
        data-testid="preview-browser-tab"
        style={{
          borderRadius: 12,
          border: '1px solid var(--color-border)',
          background: 'var(--color-border)',
          padding: '12px 12px 0',
        }}
      >
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            background: '#FFFDF9',
            borderRadius: '10px 10px 0 0',
            padding: '8px 14px 10px',
            maxWidth: '100%',
            boxShadow: '0 -1px 0 #ddd inset',
          }}
        >
          {value ? (
            <img src={value} alt="" style={{ width: 16, height: 16, objectFit: 'contain', borderRadius: 3 }} />
          ) : (
            <div style={{ width: 16, height: 16, borderRadius: 3, background: 'var(--color-border)' }} />
          )}
          <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {siteName}
          </span>
        </div>
      </div>
    );
  }

  if (kind === 'share-card') {
    return (
      <div
        data-testid="preview-share-card"
        style={{
          borderRadius: 14,
          border: '1px solid var(--color-border)',
          overflow: 'hidden',
          background: 'var(--color-surface)',
          maxWidth: 320,
        }}
      >
        <div
          style={{
            height: 140,
            background: value ? `#F0EBE4 center/cover no-repeat url("${value.replace(/"/g, '')}")` : '#F0EBE4',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--color-text-muted)',
            fontSize: 12,
          }}
        >
          {!value ? 'Preview image' : null}
        </div>
        <div style={{ padding: '10px 12px 12px' }}>
          <div style={{ fontSize: 11, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>bakeandgrill.mv</div>
          <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--color-text)', marginTop: 2 }}>{siteName}</div>
          <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 2 }}>Café & online orders</div>
        </div>
      </div>
    );
  }

  if (kind === 'color') {
    const hex = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value.trim()) ? value.trim() : 'var(--color-primary)';
    return (
      <div data-testid="preview-color" style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <button
          type="button"
          style={{
            border: 'none',
            borderRadius: 12,
            padding: '12px 20px',
            background: hex,
            color: 'var(--color-text)',
            fontWeight: 800,
            fontFamily: 'inherit',
            fontSize: 14,
            boxShadow: `0 6px 16px ${hex}55`,
          }}
        >
          Order Now
        </button>
        <span
          style={{
            width: 44,
            height: 44,
            borderRadius: 999,
            background: hex,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--color-text)',
            fontWeight: 800,
            fontSize: 11,
            boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
          }}
        >
          ●
        </span>
        <span style={{ fontSize: 13, color: 'var(--color-text-secondary)', fontFamily: 'ui-monospace, monospace' }}>{hex}</span>
      </div>
    );
  }

  // menu-circle
  return (
    <div data-testid="preview-menu-circle" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
      <div
        style={{
          width: 88,
          height: 88,
          borderRadius: '50%',
          overflow: 'hidden',
          border: '3px solid #F0EBE4',
          background: 'var(--color-bg)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {value ? (
          <img src={value} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <span style={{ fontSize: 11, color: 'var(--color-text-muted)', textAlign: 'center', padding: 8 }}>No photo</span>
        )}
      </div>
      <div>
        <div style={{ fontWeight: 700, color: 'var(--color-text)' }}>Sample dish</div>
        <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Shown when an item has no picture</div>
      </div>
    </div>
  );
}

function DropZone({
  onFile,
  onLibrary,
  inputRef,
  accept,
}: {
  onFile: (file: File) => void;
  onLibrary: () => void;
  inputRef: RefObject<HTMLInputElement | null>;
  accept: string;
}) {
  const [dragging, setDragging] = useState(false);
  return (
    <div
      data-testid="brand-kit-dropzone"
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const file = e.dataTransfer.files?.[0];
        if (file) onFile(file);
      }}
      onClick={() => inputRef.current?.click()}
      style={{
        border: `2px dashed ${dragging ? 'var(--color-primary)' : 'var(--color-border)'}`,
        background: dragging ? '#FEF3E8' : '#FFFDFC',
        borderRadius: 12,
        padding: '18px 16px',
        textAlign: 'center',
        cursor: 'pointer',
        minHeight: 44,
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        style={{ display: 'none' }}
        onChange={(e: ChangeEvent<HTMLInputElement>) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) onFile(file);
        }}
      />
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontWeight: 700, color: 'var(--color-text)', fontSize: 14 }}>
        <ImagePlus size={18} /> Upload, or choose from library
      </div>
      <div style={{ marginTop: 6, fontSize: 12, color: 'var(--color-text-muted)' }}>
        Drop a file here, or{' '}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onLibrary();
          }}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--color-primary)',
            fontWeight: 700,
            cursor: 'pointer',
            fontFamily: 'inherit',
            fontSize: 12,
            padding: 0,
            textDecoration: 'underline',
          }}
        >
          pick from the Media Library
        </button>
      </div>
    </div>
  );
}

function Card({
  meta,
  block,
  value,
  onSetValue,
  onUploadFile,
  onOpenLibrary,
  onOpenHistory,
  historyPanel,
  siteName,
}: {
  meta: BrandKitCardMeta;
  block: ContentBlock;
  value: string;
  onSetValue: (value: string) => void;
  onUploadFile: (file: File) => void;
  onOpenLibrary: () => void;
  onOpenHistory: () => void;
  historyPanel: ReactNode;
  siteName: string;
}) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const set = isSet(value);
  const isColor = meta.preview === 'color';

  const cardStyle: CSSProperties = {
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: 14,
    padding: 16,
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  };

  return (
    <article data-testid={`brand-kit-card-${meta.key}`} style={cardStyle}>
      <div>
        <div style={{ fontWeight: 800, fontSize: 16, color: 'var(--color-text)' }}>{meta.title}</div>
        <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginTop: 4, lineHeight: 1.45 }}>{meta.where}</div>
      </div>

      <Preview kind={meta.preview} value={value} siteName={siteName} />

      {isColor ? (
        <label style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 44, cursor: 'pointer' }}>
          <input
            type="color"
            value={/^#([0-9a-fA-F]{6})$/.test(value) ? value : 'var(--color-primary)'}
            onChange={(e) => onSetValue(e.target.value.toUpperCase())}
            style={{ width: 48, height: 44, border: '1px solid var(--color-border)', borderRadius: 10, padding: 2, background: 'var(--color-surface)', cursor: 'pointer' }}
            aria-label="Pick brand colour"
          />
          <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--color-text)' }}>Pick a colour</span>
        </label>
      ) : (
        <DropZone
          inputRef={fileRef}
          accept="image/*,.heic,.heif"
          onFile={onUploadFile}
          onLibrary={onOpenLibrary}
        />
      )}

      <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{meta.requirements}</div>

      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 13,
          fontWeight: 700,
          color: set ? '#195C36' : 'var(--color-text-muted)',
        }}
      >
        {set ? (
          <>
            <Check size={14} /> Set
          </>
        ) : (
          'Not set — using the default'
        )}
      </div>

      <div>
        <button
          type="button"
          onClick={() => setAdvancedOpen((o) => !o)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            background: 'none',
            border: 'none',
            padding: 0,
            color: 'var(--color-text-secondary)',
            fontSize: 12,
            fontWeight: 700,
            cursor: 'pointer',
            fontFamily: 'inherit',
            minHeight: 32,
          }}
        >
          {advancedOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          Advanced
        </button>
        {advancedOpen ? (
          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
              {block.key} · {block.type} · en · Website + Order app
            </div>
            <input
              value={value}
              onChange={(e) => onSetValue(e.target.value)}
              placeholder={isColor ? 'var(--color-primary)' : '/storage/…'}
              aria-label={`${meta.title} raw value`}
              style={{
                width: '100%',
                height: 40,
                borderRadius: 10,
                border: '1px solid var(--color-border)',
                padding: '0 10px',
                fontFamily: 'ui-monospace, monospace',
                fontSize: 12,
              }}
            />
            <button
              type="button"
              onClick={onOpenHistory}
              style={{
                alignSelf: 'flex-start',
                height: 36,
                padding: '0 10px',
                borderRadius: 10,
                border: '1px solid var(--color-border)',
                background: 'var(--color-surface)',
                cursor: 'pointer',
                fontFamily: 'inherit',
                fontSize: 12,
              }}
            >
              <History size={12} style={{ verticalAlign: -1 }} /> History
            </button>
            {historyPanel}
          </div>
        ) : null}
      </div>
    </article>
  );
}

export function BrandKitCards({
  blocksByKey,
  valueOf,
  onSetValue,
  onUploadFile,
  onOpenLibrary,
  onOpenHistory,
  historyPanel,
  siteName = 'Bake & Grill',
}: BrandKitCardsProps) {
  const cards = BRAND_KIT_CARDS.filter((meta) => blocksByKey.has(meta.key));

  return (
    <div data-testid="brand-kit" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div
        data-testid="brand-kit-banner"
        style={{
          background: '#FEF3E8',
          border: '1px solid #F0D9B8',
          borderRadius: 12,
          padding: '12px 14px',
          fontSize: 13,
          color: 'var(--color-text-secondary)',
          lineHeight: 1.45,
        }}
      >
        <strong style={{ color: 'var(--color-text)' }}>Branding is always identical on the website and the order app.</strong>
        {' '}
        Change it once — both surfaces update together.
      </div>

      <div
        data-testid="brand-kit-summary"
        className="hub-brand-kit-summary"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))',
          gap: 10,
          background: 'var(--color-bg)',
          border: '1px solid var(--color-border)',
          borderRadius: 12,
          padding: 12,
          position: 'sticky',
          top: 0,
          zIndex: 2,
        }}
      >
        {cards.map((meta) => {
          const block = blocksByKey.get(meta.key)!;
          const value = valueOf(block);
          const set = isSet(value);
          const thumb =
            meta.preview === 'color'
              ? (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value.trim()) ? value.trim() : 'var(--color-primary)')
              : value;
          return (
            <div key={meta.key} style={{ textAlign: 'center', minWidth: 0 }}>
              <div
                style={{
                  width: 48,
                  height: 48,
                  margin: '0 auto 6px',
                  borderRadius: meta.preview === 'menu-circle' ? '50%' : 10,
                  background: meta.preview === 'color' ? thumb : 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                  overflow: 'hidden',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {meta.preview !== 'color' && value ? (
                  <img src={value} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : null}
              </div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text)', lineHeight: 1.2 }}>
                {meta.title.split('—')[0].trim().split(' ').slice(0, 2).join(' ')}
              </div>
              <div style={{ fontSize: 11, color: set ? '#195C36' : 'var(--color-text-muted)', marginTop: 2 }}>
                {set ? '✓' : 'not set'}
              </div>
            </div>
          );
        })}
      </div>

      <div className="hub-brand-kit-grid" data-testid="brand-kit-cards-grid">
        {cards.map((meta) => {
          const block = blocksByKey.get(meta.key)!;
          return (
            <Card
              key={meta.key}
              meta={meta}
              block={block}
              value={valueOf(block)}
              onSetValue={(v) => onSetValue(block, v)}
              onUploadFile={(file) => void onUploadFile(block, file)}
              onOpenLibrary={() => onOpenLibrary(block)}
              onOpenHistory={() => onOpenHistory(block)}
              historyPanel={historyPanel(block)}
              siteName={siteName}
            />
          );
        })}
      </div>
    </div>
  );
}

/** Scope used for always-synced brand writes (shared). */
export function brandKitWriteScope(block: ContentBlock): ContentScope {
  if (block.apps.includes('website') || block.apps.includes('order_app')) {
    return 'shared';
  }
  return 'shared';
}
