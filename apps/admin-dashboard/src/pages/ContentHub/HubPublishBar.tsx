import { useMemo, type Dispatch, type ReactNode, type RefObject, type SetStateAction } from 'react';
import { Download, Eye, MoreHorizontal, Save, Search, Upload as UploadIcon } from 'lucide-react';
import type { ContentApp, ContentLocale, ContentScheduleRow } from '../../api/content';
import { Btn } from '../../components/SharedUI';
import { DraftPublishStatus } from '../../components/DraftPublishStatus';
import { MobileActionSheet } from '../../components/MobileActionSheet';
import { collectChanges, type DraftMap } from './hubDraftUtils';

/**
 * Content Hub publish chrome: draft/publish status, the schedule-publish
 * panel, the sticky mobile publish bar, and the header's search/locale/
 * preview/publish/more-menu cluster. Autosave/publish state itself stays in
 * ContentHubPage — these components only render from props.
 */

export type HubDraftStatusProps = {
  effectiveDirtyCount: number;
  hubApp: ContentApp;
  autosaving: boolean;
  autosaveFailed: boolean;
  autosaveErrorDetail: string | null;
  hasUnsaved: boolean;
  saving: boolean;
  publishFailed: boolean;
  lastSavedAt: string | null;
  isMobile: boolean;
  onRetrySave: () => void;
  onRetryPublish: () => void;
};

export function HubDraftStatus({
  effectiveDirtyCount,
  hubApp,
  autosaving,
  autosaveFailed,
  autosaveErrorDetail,
  hasUnsaved,
  saving,
  publishFailed,
  lastSavedAt,
  isMobile,
  onRetrySave,
  onRetryPublish,
}: HubDraftStatusProps) {
  return (
    <DraftPublishStatus
      dirtyCount={effectiveDirtyCount}
      app={hubApp}
      autosaving={autosaving}
      saveFailed={autosaveFailed}
      saveErrorDetail={autosaveErrorDetail}
      savePending={hasUnsaved && !autosaveFailed}
      publishing={saving}
      publishFailed={publishFailed}
      lastSavedAt={lastSavedAt}
      compact={isMobile}
      onRetrySave={onRetrySave}
      onRetryPublish={onRetryPublish}
    />
  );
}

export type HubSchedulePublishPanelProps = {
  hubLabel: string;
  drafts: DraftMap;
  locale: ContentLocale;
  hubApp: ContentApp;
  schedules: ContentScheduleRow[];
  layoutDraft: boolean;
  scheduleAt: string;
  setScheduleAt: Dispatch<SetStateAction<string>>;
  saving: boolean;
  dirtyCount: number;
  onSchedulePublish: () => void;
  setMoreMenuOpen: Dispatch<SetStateAction<boolean>>;
};

export function HubSchedulePublishPanel({
  hubLabel,
  drafts,
  locale,
  hubApp,
  schedules,
  layoutDraft,
  scheduleAt,
  setScheduleAt,
  saving,
  dirtyCount,
  onSchedulePublish,
  setMoreMenuOpen,
}: HubSchedulePublishPanelProps) {
  const pendingOverwriteKeys = useMemo(() => {
    const changes = collectChanges(drafts, locale, hubApp);
    if (changes.length === 0 || schedules.length === 0) return [] as ContentScheduleRow[];
    const changeKeys = new Set(changes.map((c) => `${c.key}::${c.scope}::${c.locale ?? locale}`));
    return schedules.filter((s) => changeKeys.has(`${s.key}::${s.scope}::${s.locale}`));
  }, [drafts, locale, schedules, hubApp]);

  return (
    <div className="hub-more-schedule" data-testid="hub-schedule-publish">
      <div className="hub-more-schedule-label">Schedule {hubLabel} publish</div>
      {pendingOverwriteKeys.length > 0 ? (
        <p
          data-testid="hub-schedule-overwrite-warning"
          role="alert"
          style={{
            margin: '0 0 8px',
            fontSize: 12,
            lineHeight: 1.4,
            color: 'var(--color-warning-strong)',
            background: 'var(--color-warning-bg)',
            border: '1px solid var(--color-warning)',
            borderRadius: 8,
            padding: '8px 10px',
          }}
        >
          A pending schedule already exists for{' '}
          {pendingOverwriteKeys.map((s) => s.key).filter((k, i, a) => a.indexOf(k) === i).join(', ')}.
          Scheduling again will overwrite that whole value when the later one publishes.
        </p>
      ) : null}
      {layoutDraft ? (
        <p
          data-testid="hub-schedule-layout-note"
          style={{
            margin: '0 0 8px',
            fontSize: 12,
            lineHeight: 1.4,
            color: 'var(--color-text-secondary)',
          }}
        >
          Homepage layout drafts are not scheduled. Publish or discard them separately.
        </p>
      ) : null}
      <input
        type="datetime-local"
        value={scheduleAt}
        onChange={(e) => setScheduleAt(e.target.value)}
        className="hub-more-schedule-input"
        data-testid="hub-schedule-at"
      />
      <button
        type="button"
        onClick={() => { onSchedulePublish(); setMoreMenuOpen(false); }}
        disabled={saving || dirtyCount === 0 || !scheduleAt}
        className="hub-more-schedule-btn"
        data-testid="hub-schedule-submit"
      >
        Schedule
      </button>
    </div>
  );
}

export type HubStickyPublishBarProps = {
  effectiveDirtyCount: number;
  isMobile: boolean;
  autosaveFailed: boolean;
  saving: boolean;
  publishFailed: boolean;
  hasUnsaved: boolean;
  hubLabel: string;
  onRetrySave: () => void;
  onPublish: () => void;
};

export function HubStickyPublishBar({
  effectiveDirtyCount,
  isMobile,
  autosaveFailed,
  saving,
  publishFailed,
  hasUnsaved,
  hubLabel,
  onRetrySave,
  onPublish,
}: HubStickyPublishBarProps) {
  if (!(effectiveDirtyCount > 0 && isMobile)) return null;
  return (
    <div
      className="content-studio-sticky-bar"
      role="region"
      aria-label={autosaveFailed ? 'Draft not saved' : saving ? `Publishing ${hubLabel}` : 'Draft status'}
    >
      <span className="content-studio-sticky-bar-label" data-testid="sticky-draft-status">
        {saving
          ? `Publishing ${hubLabel}…`
          : publishFailed
            ? 'Publish failed — Try again'
            : autosaveFailed
              ? 'Draft not saved — Retry'
              : hasUnsaved
                ? 'Saving draft…'
                : 'Draft saved'}
      </span>
      {autosaveFailed ? (
        <Btn
          onClick={onRetrySave}
          style={{ flex: '0 0 auto' }}
          data-testid="retry-save-btn-mobile"
          variant="secondary"
        >
          Retry
        </Btn>
      ) : null}
      <Btn
        onClick={onPublish}
        disabled={saving || autosaveFailed}
        style={{ flex: 1 }}
        data-testid="publish-live-btn-mobile"
        className="content-studio-publish-sticky"
      >
        <Save size={16} /> {saving ? `Publishing ${hubLabel}…` : `Publish ${hubLabel}`}
      </Btn>
    </div>
  );
}

export type HubHeaderActionsProps = {
  isMobile: boolean;
  searchOverlayOpen: boolean;
  searchToggleRef: RefObject<HTMLButtonElement | null>;
  onOpenSearchOverlay: () => void;
  searchField: ReactNode;
  locale: ContentLocale;
  setLocale: Dispatch<SetStateAction<ContentLocale>>;
  draftStatusNode: ReactNode;
  isCompactAdmin: boolean;
  previewSheetOpen: boolean;
  setPreviewSheetOpen: Dispatch<SetStateAction<boolean>>;
  desktopPreviewOpen: boolean;
  setDesktopPreviewOpenPersisted: (open: boolean) => void;
  effectiveDirtyCount: number;
  saving: boolean;
  autosaveFailed: boolean;
  layoutDraft: boolean;
  dirtyCount: number;
  hubApp: ContentApp;
  hubLabel: string;
  publishFailed: boolean;
  onPublish: () => void;
  moreMenuOpen: boolean;
  setMoreMenuOpen: Dispatch<SetStateAction<boolean>>;
  moreMenuRef: RefObject<HTMLDivElement | null>;
  moreBtnRef: RefObject<HTMLButtonElement | null>;
  onDiscardDrafts: () => void;
  onExport: () => void;
  onImportClick: () => void;
  schedulePublishPanel: ReactNode;
  onOpenMediaLibrary: () => void;
};

export function HubHeaderActions({
  isMobile,
  searchOverlayOpen,
  searchToggleRef,
  onOpenSearchOverlay,
  searchField,
  locale,
  setLocale,
  draftStatusNode,
  isCompactAdmin,
  previewSheetOpen,
  setPreviewSheetOpen,
  desktopPreviewOpen,
  setDesktopPreviewOpenPersisted,
  effectiveDirtyCount,
  saving,
  autosaveFailed,
  layoutDraft,
  dirtyCount,
  hubApp,
  hubLabel,
  publishFailed,
  onPublish,
  moreMenuOpen,
  setMoreMenuOpen,
  moreMenuRef,
  moreBtnRef,
  onDiscardDrafts,
  onExport,
  onImportClick,
  schedulePublishPanel,
  onOpenMediaLibrary,
}: HubHeaderActionsProps) {
  const moreMenuItems = (
    <>
      {effectiveDirtyCount > 0 ? (
        <button
          type="button"
          role="menuitem"
          className="hub-more-item"
          data-testid="hub-discard-draft"
          onClick={() => {
            setMoreMenuOpen(false);
            onDiscardDrafts();
          }}
        >
          Discard {hubLabel} draft
        </button>
      ) : null}
      <button
        type="button"
        role="menuitem"
        className="hub-more-item"
        onClick={() => { onExport(); setMoreMenuOpen(false); }}
      >
        <Download size={14} /> Export {hubLabel}
      </button>
      <button
        type="button"
        role="menuitem"
        className="hub-more-item"
        onClick={() => { onImportClick(); setMoreMenuOpen(false); }}
      >
        <UploadIcon size={14} /> Import {hubLabel}
      </button>
      {schedulePublishPanel}
      <button
        type="button"
        role="menuitem"
        className="hub-more-item"
        onClick={() => { onOpenMediaLibrary(); setMoreMenuOpen(false); }}
      >
        Media library
      </button>
    </>
  );

  return (
    <div className="hub-header-actions">
      {isMobile ? (
        <button
          ref={searchToggleRef}
          type="button"
          className="hub-search-toggle"
          data-testid="hub-search-toggle"
          aria-label="Search content"
          aria-expanded={searchOverlayOpen}
          onClick={onOpenSearchOverlay}
        >
          <Search size={16} />
        </button>
      ) : (
        searchField
      )}

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

      {draftStatusNode}

      {!isMobile ? (
        <button
          type="button"
          data-testid="preview-toggle"
          aria-pressed={isCompactAdmin ? previewSheetOpen : desktopPreviewOpen}
          className={`hub-preview-toggle${(isCompactAdmin ? previewSheetOpen : desktopPreviewOpen) ? ' hub-preview-toggle--on' : ''}`}
          onClick={() => {
            if (isCompactAdmin) {
              setPreviewSheetOpen((o) => !o);
              return;
            }
            setDesktopPreviewOpenPersisted(!desktopPreviewOpen);
          }}
        >
          <Eye size={14} /> Preview
        </button>
      ) : null}

      {effectiveDirtyCount > 0 ? (
        <Btn
          onClick={onPublish}
          disabled={saving || effectiveDirtyCount === 0 || autosaveFailed}
          className="content-studio-publish-desktop content-studio-publish-desktop--needed"
          data-testid="publish-live-btn"
          title={autosaveFailed
            ? 'Retry draft save before publishing'
            : layoutDraft && dirtyCount === 0
              ? `Publishes unpublished ${hubApp === 'website' ? 'Website' : 'Order App'} Home layout changes`
              : undefined}
        >
          <Save size={16} />
          {saving ? `Publishing ${hubLabel}…` : publishFailed ? 'Publish failed — Try again' : `Publish ${hubLabel}`}
        </Btn>
      ) : null}

      <div className="hub-more-wrap" ref={moreMenuRef}>
        <button
          ref={moreBtnRef}
          type="button"
          className="hub-more-trigger"
          onClick={() => setMoreMenuOpen((o) => !o)}
          aria-expanded={moreMenuOpen}
          aria-label="More actions"
        >
          <MoreHorizontal size={16} />
          <span className="hub-more-trigger-label">More</span>
        </button>
        {moreMenuOpen && !isMobile ? (
          <div className="hub-more-menu" role="menu">
            {moreMenuItems}
          </div>
        ) : null}
      </div>
      {isMobile ? (
        <MobileActionSheet
          open={moreMenuOpen}
          title="More"
          onClose={() => setMoreMenuOpen(false)}
          testId="hub-more-menu-mobile"
          returnFocusTo={moreBtnRef.current}
          layer={5}
        >
          {moreMenuItems}
        </MobileActionSheet>
      ) : null}
    </div>
  );
}

export type HubPublishChromeProps = {
  draftStatus: HubDraftStatusProps;
  schedulePanel: HubSchedulePublishPanelProps;
  stickyBar: HubStickyPublishBarProps;
  headerActions: Omit<HubHeaderActionsProps, 'draftStatusNode' | 'schedulePublishPanel'>;
};

/**
 * Convenience bundle for callers that want every publish-chrome piece from a
 * single props object. ContentHubPage renders the pieces individually (they
 * sit in different parts of the tree), but this stays available if a future
 * host wants the whole cluster in one place.
 */
export function HubPublishChrome({ draftStatus, schedulePanel, stickyBar, headerActions }: HubPublishChromeProps) {
  const draftStatusNode = <HubDraftStatus {...draftStatus} />;
  const schedulePublishPanel = <HubSchedulePublishPanel {...schedulePanel} />;
  return (
    <>
      <HubHeaderActions {...headerActions} draftStatusNode={draftStatusNode} schedulePublishPanel={schedulePublishPanel} />
      <HubStickyPublishBar {...stickyBar} />
    </>
  );
}
