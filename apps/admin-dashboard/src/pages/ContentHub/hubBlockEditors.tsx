import type { Dispatch, MutableRefObject, ReactNode, SetStateAction } from 'react';
import {
  AboutValuesEditor,
  BusinessHoursEditor,
  CategoriesEditor,
  FooterLinksEditor,
  HeroSlidesEditor,
  ProofDetailsEditor,
  RichTextEditor,
  SeoSnippetPreview,
  TrustItemsEditor,
} from '../../components/content-editors';
import { Btn } from '../../components/SharedUI';
import {
  uploadContentImage,
  uploadContentVideo,
  type ContentBlock,
  type ContentLocale,
  type ContentScope,
} from '../../api/content';
import {
  isSeoDescriptionKey,
  scopeHasDraft,
  seoDescriptionKey,
  labelForScope,
  uploadAppFor,
  valueForScope,
  type DraftMap,
} from './hubDraftUtils';

/**
 * The field editors, shared by every Content & Branding layout.
 *
 * Extracted from HubSectionContent so the Website desktop workspace and the
 * Order App / mobile layouts render a text box, a hero carousel or a colour
 * the same way. Pure move — behaviour is unchanged.
 */

/** Upload target for the shared embedded-file `<input>` on the parent page. */
export type UploadContextRef = MutableRefObject<{
  blockKey: string;
  scope: ContentScope;
  onDone: (url: string) => void;
} | null>;

export type SharedEditorDeps = {
  locale: ContentLocale;
  drafts: DraftMap;
  contentBlocks: ContentBlock[];
  setDraft: (scope: ContentScope, key: string, value: string) => void;
  makeTriggerUpload: (block: ContentBlock, scope: ContentScope) => (legacyKey: string, onDone: (url: string) => void) => void;
  onUpload: (block: ContentBlock, scope: ContentScope, file: File) => void | Promise<void>;
  uploadCtx: UploadContextRef;
  setMediaOpen: (open: boolean) => void;
  draftStatusNode: ReactNode;
  /** Discard one block's draft. Absent when the block has none. */
  onDiscardBlockDraft?: (key: string) => void;
};

/** Visual (rich) editors keyed off `block.editor`. */
export function renderVisualEditor(
  deps: SharedEditorDeps,
  block: ContentBlock,
  scope: ContentScope,
  val: string,
  opts?: { mobileMode?: boolean; scheduleSlot?: ReactNode; wideLayout?: boolean },
): ReactNode {
  const onChange = (next: string) => deps.setDraft(scope, block.key, next);
  const triggerUpload = deps.makeTriggerUpload(block, scope);
  const common = { label: block.label, description: block.description || undefined, value: val, onChange };

  switch (block.editor) {
    case 'hero':
      return (
        <HeroSlidesEditor
          {...common}
          triggerUpload={triggerUpload}
          uploadImage={(cropped, original) => uploadContentImage(block.key, uploadAppFor(scope), cropped, original, deps.locale)}
          uploadVideo={(video, poster, posterUrl) => uploadContentVideo(block.key, uploadAppFor(scope), video, poster, deps.locale, posterUrl)}
          mobileMode={Boolean(opts?.mobileMode)}
          wideLayout={Boolean(opts?.wideLayout)}
          draftStatus={deps.draftStatusNode}
          onDiscardDraft={deps.onDiscardBlockDraft ? () => deps.onDiscardBlockDraft?.(block.key) : undefined}
          scheduleSlot={opts?.scheduleSlot}
        />
      );
    case 'categories':
      return <CategoriesEditor {...common} triggerUpload={triggerUpload} />;
    case 'trust':
      return <TrustItemsEditor {...common} />;
    case 'proof':
      return <ProofDetailsEditor {...common} />;
    case 'about_values':
      return <AboutValuesEditor {...common} />;
    case 'footer_links':
      return <FooterLinksEditor {...common} />;
    case 'business_hours':
      return <BusinessHoursEditor {...common} />;
    default:
      return null;
  }
}

/** Plain (text / boolean / image / textarea / json) editors. */
export function renderPlainEditor(
  deps: SharedEditorDeps,
  block: ContentBlock,
  scope: ContentScope,
  val: string,
): ReactNode {
  if (block.rich) {
    return (
      <RichTextEditor
        key={`${scope}-${block.key}-${deps.locale}`}
        label=""
        value={val}
        onChange={(next) => deps.setDraft(scope, block.key, next)}
      />
    );
  }
  if (block.type === 'boolean') {
    return (
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
        <input
          type="checkbox"
          checked={val === 'true' || val === '1'}
          onChange={(e) => deps.setDraft(scope, block.key, e.target.checked ? 'true' : 'false')}
        />
        Enabled
      </label>
    );
  }
  if (block.type === 'font') {
    const safeFontUrl = /^\/storage\/fonts\/[a-f0-9]{64}\.(woff2|woff|ttf|otf)$/.test(val) ? val : '';
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <p
          lang="dv"
          dir="rtl"
          style={{
            margin: 0,
            fontFamily: safeFontUrl ? 'BakeDhivehi, var(--font-dhivehi)' : 'var(--font-dhivehi)',
            fontSize: 22,
            lineHeight: 1.5,
          }}
        >
          ދިވެހި ބަސް
        </p>
        {safeFontUrl ? (
          <style>{`@font-face{font-family:'BakeDhivehi';src:url('${safeFontUrl}');font-display:swap;unicode-range:U+0780-U+07BF;}`}</style>
        ) : null}
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            type="file"
            accept=".ttf,.otf,.woff,.woff2,font/ttf,font/otf,font/woff,font/woff2"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) void deps.onUpload(block, scope, file);
            }}
          />
          <button
            type="button"
            onClick={() => deps.setDraft(scope, block.key, '')}
            style={{
              height: 40,
              padding: '0 12px',
              borderRadius: 10,
              border: '1px solid var(--color-border)',
              background: 'var(--color-surface)',
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Use default
          </button>
          <input
            value={val}
            onChange={(e) => deps.setDraft(scope, block.key, e.target.value)}
            placeholder="Empty = A_Faruma"
            style={{ flex: 1, minWidth: 180, height: 40, borderRadius: 10, border: '1px solid var(--color-border)', padding: '0 10px', fontFamily: 'inherit' }}
          />
        </div>
        <p style={{ margin: 0, fontSize: 12, color: 'var(--color-text-muted)' }}>
          TTF/OTF always work. WOFF/WOFF2 need the server fontTools inspector; a TTF is converted to WOFF2 when that inspector is present.
        </p>
      </div>
    );
  }
  if (block.type === 'image') {
    return (
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        {val ? (
          <img
            src={val}
            alt={block.label}
            style={{
              width: 72,
              height: 72,
              objectFit: 'cover',
              borderRadius: block.key === 'default_item_image' ? '50%' : 10,
            }}
          />
        ) : null}
        <input
          type="file"
          accept="image/*,.heic,.heif"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) void deps.onUpload(block, scope, file);
          }}
        />
        <Btn
          type="button"
          variant="secondary"
          onClick={() => {
            deps.uploadCtx.current = { blockKey: block.key, scope, onDone: (url) => deps.setDraft(scope, block.key, url) };
            deps.setMediaOpen(true);
          }}
        >
          Library
        </Btn>
        <input
          value={val}
          onChange={(e) => deps.setDraft(scope, block.key, e.target.value)}
          placeholder="/storage/…"
          style={{ flex: 1, minWidth: 180, height: 40, borderRadius: 10, border: '1px solid var(--color-border)', padding: '0 10px', fontFamily: 'inherit' }}
        />
      </div>
    );
  }
  if (block.type === 'textarea' || block.type === 'json') {
    return (
      <textarea
        value={val}
        onChange={(e) => deps.setDraft(scope, block.key, e.target.value)}
        rows={block.type === 'json' ? 6 : 4}
        dir={deps.locale === 'dv' ? 'rtl' : 'ltr'}
        style={{
          width: '100%',
          borderRadius: 10,
          border: '1px solid var(--color-border)',
          padding: 10,
          fontFamily: block.type === 'json' ? 'ui-monospace, monospace' : 'inherit',
          fontSize: 13,
        }}
      />
    );
  }
  return (
    <input
      value={val}
      onChange={(e) => deps.setDraft(scope, block.key, e.target.value)}
      dir={deps.locale === 'dv' ? 'rtl' : 'ltr'}
      style={{
        width: '100%',
        height: 44,
        borderRadius: 10,
        border: '1px solid var(--color-border)',
        padding: '0 12px',
        fontFamily: 'inherit',
        fontSize: 14,
      }}
    />
  );
}

/** Resolves a block's editor for one scope — visual, SEO title+description pair, or plain. */
export function renderEditorForScope(
  deps: SharedEditorDeps,
  block: ContentBlock,
  scope: ContentScope,
  opts?: { wideLayout?: boolean; mobileMode?: boolean },
): ReactNode {
  const val = valueForScope(block, scope, deps.drafts);
  const visual = block.editor
    ? renderVisualEditor(deps, block, scope, val, {
      wideLayout: opts?.wideLayout,
      mobileMode: opts?.mobileMode,
    })
    : null;
  const descKey = seoDescriptionKey(block.key);
  const descBlock = descKey ? deps.contentBlocks.find((candidate) => candidate.key === descKey) : undefined;
  const isSeoTitle = Boolean(descKey);

  if (visual) return visual;

  if (isSeoTitle && descBlock) {
    return (
      <SeoSnippetPreview
        title={val}
        description={valueForScope(descBlock, scope, deps.drafts)}
        onTitleChange={(next) => deps.setDraft(scope, block.key, next)}
        onDescriptionChange={(next) => deps.setDraft(scope, descBlock.key, next)}
        titleLabel={block.label}
        descriptionLabel={descBlock.label}
      />
    );
  }

  return renderPlainEditor(deps, block, scope, val);
}

export type ScopeTabsDeps = {
  drafts: DraftMap;
  setBlockScopeTab: Dispatch<SetStateAction<Record<string, ContentScope>>>;
};

export function renderScopeTabs(
  deps: ScopeTabsDeps,
  blockKey: string,
  scopes: ContentScope[],
  activeScope: ContentScope,
  panel: ReactNode,
): ReactNode {
  return (
    <div className="hub-scope-tabs" data-testid={`scope-tabs-${blockKey}`}>
      <div className="hub-scope-tablist" role="tablist" aria-label="App scope">
        {scopes.map((scope) => {
          const selected = scope === activeScope;
          const dirty = scopeHasDraft(scope, blockKey, deps.drafts);
          return (
            <button
              key={scope}
              type="button"
              role="tab"
              aria-selected={selected}
              data-testid={`scope-tab-${blockKey}-${scope}`}
              className={`hub-scope-tab${selected ? ' hub-scope-tab--active' : ''}`}
              onClick={() => deps.setBlockScopeTab((prev) => ({ ...prev, [blockKey]: scope }))}
            >
              {labelForScope(scope)}
              {dirty && !selected ? (
                <span
                  className="hub-scope-tab-dot"
                  data-testid={`scope-tab-dirty-${blockKey}-${scope}`}
                  title="Unpublished edits"
                  aria-hidden="true"
                />
              ) : null}
            </button>
          );
        })}
      </div>
      <div
        role="tabpanel"
        data-testid={`scope-panel-${blockKey}-${activeScope}`}
        className="hub-scope-tabpanel"
      >
        {panel}
      </div>
    </div>
  );
}

/**
 * A block whose SEO description is already rendered inside its title's snippet
 * preview — listing it again would show the same box twice.
 */
export function isRedundantSeoDescription(block: ContentBlock, contentBlocks: ContentBlock[]): boolean {
  if (!isSeoDescriptionKey(block.key)) return false;
  const titleKey = block.key === 'meta_description'
    ? 'meta_title'
    : block.key.replace(/_meta_description$/, '_meta_title');
  return contentBlocks.some((c) => c.key === titleKey);
}
