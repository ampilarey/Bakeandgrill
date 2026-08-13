import type { Dispatch, ReactNode, RefObject, SetStateAction } from 'react';
import { Eye, MoreHorizontal, Save } from 'lucide-react';
import type { ContentApp, ContentBlock, ContentLocale, ContentScope } from '../../api/content';
import { Btn } from '../../components/SharedUI';
import { ContentEditorSheet } from '../../components/ContentEditorSheet';
import {
  HubFocusedBlockBody,
  HubSectionContent,
  type HubSectionContentProps,
  type UploadContextRef,
} from './HubSectionContent';
import type { DraftMap } from './hubDraftUtils';

export type HubEditorSheetsProps = {
  isMobile: boolean;
  loading: boolean;
  mobileEditorOpen: boolean;
  activeGroup: string | null;
  activeEditorTitle: string;
  onCloseSection: () => void;
  draftStatusNode: ReactNode;
  locale: ContentLocale;
  setLocale: Dispatch<SetStateAction<ContentLocale>>;
  onOpenPreview: () => void;
  moreMenuOpen: boolean;
  setMoreMenuOpen: Dispatch<SetStateAction<boolean>>;
  effectiveDirtyCount: number;
  dirtyCount: number;
  saving: boolean;
  autosaveFailed: boolean;
  publishFailed: boolean;
  hubLabel: string;
  onPublish: () => void;
  schedulePublishPanel: ReactNode;
  sectionContentProps: Omit<HubSectionContentProps, 'sectionName' | 'withBack'>;
  searchOverlayOpen: boolean;
  setSearchOverlayOpen: Dispatch<SetStateAction<boolean>>;
  searchToggleRef: RefObject<HTMLButtonElement | null>;
  searchField: ReactNode;
  mobileBlockEditorKey: string | null;
  setMobileBlockEditorKey: Dispatch<SetStateAction<string | null>>;
  contentBlocks: ContentBlock[];
  hubApp: ContentApp;
  drafts: DraftMap;
  blockScopeTab: Record<string, ContentScope>;
  setBlockScopeTab: Dispatch<SetStateAction<Record<string, ContentScope>>>;
  setDraft: (scope: ContentScope, key: string, value: string) => void;
  makeTriggerUpload: (
    block: ContentBlock,
    scope: ContentScope,
  ) => (legacyKey: string, onDone: (url: string) => void) => void;
  onUpload: (block: ContentBlock, scope: ContentScope, file: File) => Promise<void>;
  uploadCtx: UploadContextRef;
  setMediaOpen: Dispatch<SetStateAction<boolean>>;
};

/**
 * Mobile/desktop sheet plumbing for Content Hub:
 * section editor sheet, search overlay, focused block editor sheet.
 */
export function HubEditorSheets({
  isMobile,
  loading,
  mobileEditorOpen,
  activeGroup,
  activeEditorTitle,
  onCloseSection,
  draftStatusNode,
  locale,
  setLocale,
  onOpenPreview,
  moreMenuOpen,
  setMoreMenuOpen,
  effectiveDirtyCount,
  dirtyCount,
  saving,
  autosaveFailed,
  publishFailed,
  hubLabel,
  onPublish,
  schedulePublishPanel,
  sectionContentProps,
  searchOverlayOpen,
  setSearchOverlayOpen,
  searchToggleRef,
  searchField,
  mobileBlockEditorKey,
  setMobileBlockEditorKey,
  contentBlocks,
  hubApp,
  drafts,
  blockScopeTab,
  setBlockScopeTab,
  setDraft,
  makeTriggerUpload,
  onUpload,
  uploadCtx,
  setMediaOpen,
}: HubEditorSheetsProps) {
  const editBlock = mobileBlockEditorKey
    ? contentBlocks.find((b) => b.key === mobileBlockEditorKey)
    : null;
  const isHero = editBlock?.editor === 'hero';

  return (
    <>
      {isMobile ? (
        <>
          <ContentEditorSheet
            open={!loading && mobileEditorOpen && Boolean(activeGroup)}
            title={activeEditorTitle}
            onClose={onCloseSection}
            status={draftStatusNode}
            layer={0}
            testId="content-editor-sheet"
            headerActions={(
              <div className="hub-sheet-header-actions">
                <div className="hub-locale-seg" role="group" aria-label="Language">
                  {(['en', 'dv'] as const).map((loc) => (
                    <button
                      key={loc}
                      type="button"
                      aria-pressed={locale === loc}
                      onClick={() => setLocale(loc)}
                      className={`hub-locale-btn${locale === loc ? ' hub-locale-btn--active' : ''}`}
                    >
                      {loc === 'en' ? 'EN' : 'DV'}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  data-testid="preview-sheet-btn"
                  className="hub-sheet-preview-btn"
                  onClick={onOpenPreview}
                >
                  <Eye size={16} /> Preview
                </button>
                <button
                  type="button"
                  className="hub-more-trigger"
                  data-testid="hub-sheet-more-btn"
                  onClick={() => setMoreMenuOpen(true)}
                  aria-expanded={moreMenuOpen}
                  aria-label="More actions"
                >
                  <MoreHorizontal size={16} />
                </button>
              </div>
            )}
            footer={effectiveDirtyCount > 0 ? (
              <Btn
                onClick={() => void onPublish()}
                disabled={saving}
                style={{ width: '100%' }}
                data-testid="publish-live-btn-sheet"
                className="content-studio-publish-sticky"
              >
                <Save size={16} /> {saving ? `Publishing ${hubLabel}…` : `Publish ${hubLabel}`}
              </Btn>
            ) : undefined}
          >
            {dirtyCount > 0 ? (
              <div style={{ marginBottom: 12 }} data-testid="content-editor-schedule-slot">
                {schedulePublishPanel}
              </div>
            ) : null}
            {activeGroup ? (
              <HubSectionContent
                sectionName={activeGroup}
                withBack={false}
                {...sectionContentProps}
              />
            ) : null}
          </ContentEditorSheet>

          <ContentEditorSheet
            open={searchOverlayOpen}
            title="Search"
            onClose={() => setSearchOverlayOpen(false)}
            layer={4}
            testId="hub-search-overlay"
            returnFocusTo={searchToggleRef.current}
          >
            {searchField}
          </ContentEditorSheet>
        </>
      ) : null}

      {editBlock ? (
        <ContentEditorSheet
          open
          title={`Edit ${editBlock.label}`}
          onClose={() => setMobileBlockEditorKey(null)}
          status={draftStatusNode}
          layer={1}
          testId={isHero ? 'hero-editor-sheet' : `block-editor-sheet-${editBlock.key}`}
          footer={effectiveDirtyCount > 0 ? (
            <Btn
              onClick={() => void onPublish()}
              disabled={saving || autosaveFailed}
              style={{ width: '100%' }}
              data-testid="publish-live-btn-block-sheet"
            >
              <Save size={16} /> {saving ? `Publishing ${hubLabel}…` : publishFailed ? 'Publish failed — Try again' : `Publish ${hubLabel}`}
            </Btn>
          ) : undefined}
        >
          <HubFocusedBlockBody
            block={editBlock}
            hubApp={hubApp}
            drafts={drafts}
            locale={locale}
            contentBlocks={contentBlocks}
            blockScopeTab={blockScopeTab}
            setBlockScopeTab={setBlockScopeTab}
            setDraft={setDraft}
            makeTriggerUpload={makeTriggerUpload}
            onUpload={onUpload}
            uploadCtx={uploadCtx}
            setMediaOpen={setMediaOpen}
            draftStatusNode={draftStatusNode}
            dirtyCount={dirtyCount}
            schedulePublishPanel={schedulePublishPanel}
          />
        </ContentEditorSheet>
      ) : null}
    </>
  );
}
