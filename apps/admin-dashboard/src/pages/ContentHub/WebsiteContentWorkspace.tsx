import { useEffect, useMemo, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import { ArrowLeft, ChevronRight, Eye, EyeOff } from 'lucide-react';
import { Link } from 'react-router-dom';
import { fetchAdminPageBlocks, updatePageBlock } from '../../api/pageBlocks';
import { OpsOwnedSummary } from '../../components/OpsOwnedSummary';
import { RevisionDiff } from '../../components/content-editors';
import type {
  ContentApp,
  ContentBlock,
  ContentLocale,
  ContentRevision,
  ContentScope,
} from '../../api/content';
import {
  isRedundantSeoDescription,
  renderEditorForScope,
  renderScopeTabs,
  type SharedEditorDeps,
  type UploadContextRef,
} from './hubBlockEditors';
import {
  draftKey,
  editorScopesForBlock,
  labelForScope,
  preferredScopeTab,
  seoDescriptionKey,
  valueForScope,
  type DraftMap,
  type HistoryTarget,
} from './hubDraftUtils';
import { blockDisplayName } from './summarizeBlockValue';
import { fallbackManagedBy } from './opsOwnedContentKeys';
import { blocksForContentView } from './websitePageTasks';
import { buildWebsiteHomeSections } from './websiteHomeSections';
import { groupBlocks, WEBSITE_PAGE_GROUPS, type GroupedBlocks } from './websiteFieldGroups';

/**
 * Website Content — desktop.
 *
 * Owner's layout, decided 2026-08-15 after three rejected drafts:
 *   • five page tabs in a row, one per real page of the website;
 *   • Home is its ten sections, not fifty-four loose settings;
 *   • a section opens IN PLACE at full page width, one at a time — no side
 *     panel (that is what starved the hero of room), no pop-up window (you can
 *     click outside one and lose your place);
 *   • Contact, Hours, Legal and Everywhere are one plain form each, because at
 *     13–22 settings nothing beats an ordinary well-spaced form.
 *
 * On a phone the five tabs become a plain list — a row of five does not fit in
 * 390px without sideways scrolling, and a page you have to swipe to find is a
 * page you never open. Everything below that first screen is identical.
 *
 * Order App Content is deliberately untouched and still uses HubSectionContent.
 */

const TAB_ORDER = ['Home', 'Contact page', 'Hours page', 'Legal', 'Everywhere'];

/** One line per page on the phone's first screen. */
const PAGE_BLURB: Record<string, string> = {
  Home: 'The homepage, section by section',
  'Contact page': 'Everything on /contact',
  'Hours page': 'Wording around your opening times',
  Legal: 'Terms, refunds and privacy',
  Everywhere: 'Header, announcement bar, footer, search wording',
};

const TAB_BLURB: Record<string, string> = {
  Home: 'Ten sections, in the order they appear on the page. Click one to open it.',
  'Contact page': 'Everything on /contact, top to bottom.',
  'Hours page': 'Wording only. The real opening times are managed in Online Ordering.',
  Legal: 'Terms, refunds and privacy.',
  Everywhere: 'Header, announcement bar, footer and search wording — on every page.',
};

type DeviceVisibility = {
  /** page_blocks row id — needed to turn the section off from its own row. */
  id: number;
  showing: boolean;
  desktop: boolean;
  mobile: boolean;
};

/**
 * Where each Home section currently shows, read from `page_blocks`, plus the
 * ability to turn one off without leaving the row.
 *
 * Owner, 2026-08-15: "if i want to hide hero banner for a short period of
 * time … now i have to go to section order and visibility tab to do that."
 *
 * Best-effort on read: if the request fails the badges are omitted rather than
 * guessed, because a badge claiming "Desktop + mobile" about a hidden section
 * is worse than no badge at all.
 */
function useHomeSectionVisibility(enabled: boolean, layoutRevision: number) {
  const [byType, setByType] = useState<Record<string, DeviceVisibility> | null>(null);
  const [version, setVersion] = useState(0);
  const [busyType, setBusyType] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void fetchAdminPageBlocks('website', 'home')
      .then((res) => {
        if (cancelled) return;
        const next: Record<string, DeviceVisibility> = {};
        for (const row of res.blocks ?? []) {
          next[row.block_type] = {
            id: row.id,
            showing: row.is_enabled,
            desktop: row.is_enabled && row.settings?.show_desktop !== false,
            mobile: row.is_enabled && row.settings?.show_mobile !== false,
          };
        }
        setByType(next);
        setVersion(res.version ?? 0);
      })
      .catch(() => {
        if (!cancelled) setByType(null);
      });
    return () => { cancelled = true; };
  }, [enabled, layoutRevision]);

  const setShowing = async (blockType: string, showing: boolean): Promise<boolean> => {
    const row = byType?.[blockType];
    if (!row) return false;
    setBusyType(blockType);
    try {
      const res = await updatePageBlock(row.id, {
        app: 'website',
        page: 'home',
        version,
        is_enabled: showing,
      });
      setVersion(res.version ?? version);
      setByType((prev) => (prev
        ? {
          ...prev,
          [blockType]: {
            ...prev[blockType],
            showing,
            desktop: showing && prev[blockType].desktop !== false,
            mobile: showing && prev[blockType].mobile !== false,
          },
        }
        : prev));
      return true;
    } catch {
      return false;
    } finally {
      setBusyType(null);
    }
  };

  return { byType, setShowing, busyType };
}

function visibilityLabel(v: DeviceVisibility | undefined): string | null {
  if (!v) return null;
  if (v.desktop && v.mobile) return 'Desktop + mobile';
  if (v.desktop) return 'Desktop only';
  if (v.mobile) return 'Mobile only';
  return 'Hidden';
}

export type WebsiteContentWorkspaceProps = {
  loading: boolean;
  skeleton: ReactNode;
  /** Section names present for this app, used to hide a tab with nothing in it. */
  sectionNames: string[];
  activeGroup: string | null;
  onSelectGroup: (name: string) => void;
  contentBlocks: ContentBlock[];
  drafts: DraftMap;
  draftKeys: string[];
  locale: ContentLocale;
  hubApp: ContentApp;
  setDraft: (scope: ContentScope, key: string, value: string) => void;
  blockScopeTab: Record<string, ContentScope>;
  setBlockScopeTab: Dispatch<SetStateAction<Record<string, ContentScope>>>;
  makeTriggerUpload: (block: ContentBlock, scope: ContentScope) => (legacyKey: string, onDone: (url: string) => void) => void;
  onUpload: (block: ContentBlock, scope: ContentScope, file: File) => void | Promise<void>;
  uploadCtx: UploadContextRef;
  setMediaOpen: (open: boolean) => void;
  draftStatusNode: ReactNode;
  historyTarget: HistoryTarget;
  setHistoryTarget: (target: HistoryTarget) => void;
  revisions: ContentRevision[];
  restore: (id: number) => void | Promise<void>;
  openHistory: (block: ContentBlock, scope: ContentScope) => void | Promise<void>;
  /** Deep link (search result, task card): open the section holding this key. */
  focusKey?: string | null;
  onFocusHandled?: () => void;
  /** Section open on arrival. The owner's own answer to "which one first" was "usually hero". */
  defaultOpenSectionId?: string | null;
  /** Section order & visibility — the page_blocks editor, kept mounted. */
  layoutEditor?: ReactNode;
  /** Bumps when a layout draft changes, so the device badges refresh. */
  layoutRevision?: number;
  /** Called after a section is shown/hidden from its own row, so the layout
   *  editor reloads and the Publish bar learns there is a draft. */
  onLayoutChanged?: () => void;
  /** Phone: the five pages are a list, and a page opens with a Back arrow. */
  isMobile?: boolean;
  /** Phone: leave the page and return to the list of five. */
  onBack?: () => void;
};

export function WebsiteContentWorkspace({
  loading,
  skeleton,
  sectionNames,
  activeGroup,
  onSelectGroup,
  contentBlocks,
  drafts,
  draftKeys,
  locale,
  hubApp,
  setDraft,
  blockScopeTab,
  setBlockScopeTab,
  makeTriggerUpload,
  onUpload,
  uploadCtx,
  setMediaOpen,
  draftStatusNode,
  historyTarget,
  setHistoryTarget,
  revisions,
  restore,
  openHistory,
  focusKey = null,
  onFocusHandled,
  layoutEditor,
  layoutRevision = 0,
  onLayoutChanged,
  defaultOpenSectionId = null,
  isMobile = false,
  onBack,
}: WebsiteContentWorkspaceProps) {
  const selectedPage = activeGroup && TAB_ORDER.includes(activeGroup) ? activeGroup : null;
  const activeTab = selectedPage ?? 'Home';
  const isHome = activeTab === 'Home';
  /** Phone only: nothing picked yet, so show the list of five pages. */
  const showPageList = isMobile && !selectedPage;

  /** Which section is open on Home. One at a time — opening one closes the last. */
  const [openSectionId, setOpenSectionId] = useState<string | null>(defaultOpenSectionId);
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});
  const pendingScrollRef = useRef<string | null>(null);
  const firstTabRenderRef = useRef(true);

  const editorDeps: SharedEditorDeps = {
    locale,
    drafts,
    contentBlocks,
    setDraft,
    makeTriggerUpload,
    onUpload,
    uploadCtx,
    setMediaOpen,
    draftStatusNode,
  };

  const tabs = useMemo(() => {
    const present = new Set(sectionNames);
    return TAB_ORDER.filter((name) => present.has(name)).map((name) => ({
      name,
      count: blocksForContentView(name, contentBlocks, hubApp).length,
    }));
  }, [sectionNames, contentBlocks, hubApp]);

  const tabBlocks = useMemo(
    () => blocksForContentView(activeTab, contentBlocks, hubApp)
      .filter((b) => !isRedundantSeoDescription(b, contentBlocks)),
    [activeTab, contentBlocks, hubApp],
  );

  const homeSections = useMemo(
    () => (isHome ? buildWebsiteHomeSections(tabBlocks) : []),
    [isHome, tabBlocks],
  );

  const pageGroups = useMemo(
    () => (isHome ? [] : groupBlocks(tabBlocks, WEBSITE_PAGE_GROUPS[activeTab])),
    [isHome, tabBlocks, activeTab],
  );

  const dirtyKeys = useMemo(() => {
    const set = new Set<string>();
    for (const composite of draftKeys) {
      const idx = composite.indexOf('::');
      if (idx > 0) set.add(composite.slice(idx + 2));
    }
    return set;
  }, [draftKeys]);

  const { byType: visibilityByType, setShowing, busyType } = useHomeSectionVisibility(
    isHome && !loading,
    layoutRevision,
  );

  // Switching page tabs starts from a closed list — the tab's own content is
  // the answer to "where am I", not whatever was open on the last page.
  useEffect(() => {
    if (firstTabRenderRef.current) {
      firstTabRenderRef.current = false;
      return;
    }
    setOpenSectionId(null);
  }, [activeTab]);

  // Deep link from search or a task card: open the section that holds the key.
  useEffect(() => {
    if (!focusKey || !isHome || homeSections.length === 0) return;
    const owner = homeSections.find((s) => s.blocks.some((b) => b.key === focusKey));
    if (owner) {
      setOpenSectionId(owner.id);
      pendingScrollRef.current = owner.id;
    }
    onFocusHandled?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusKey, isHome, homeSections.length]);

  // An opened section goes to the top of the view, so you are never reading a
  // section that opened below the fold.
  useEffect(() => {
    const target = pendingScrollRef.current ?? openSectionId;
    pendingScrollRef.current = null;
    if (!target) return;
    const el = sectionRefs.current[target];
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [openSectionId]);

  const toggleSection = (id: string) => {
    setOpenSectionId((prev) => (prev === id ? null : id));
  };

  const renderHistoryPanel = (block: ContentBlock, scope: ContentScope, currentValue: string) => {
    if (!historyTarget || historyTarget.key !== block.key || historyTarget.scope !== scope) return null;
    return (
      <div className="wcw-history" data-testid={`wcw-history-${block.key}`}>
        <div className="wcw-history-title" data-testid="revision-history-heading">
          History · {historyTarget.label} · {locale}
        </div>
        {revisions.length === 0 ? <p className="wcw-history-empty">No revisions yet.</p> : null}
        {revisions.map((revision) => (
          <div key={revision.id} className="wcw-history-row">
            <div className="wcw-history-row-main">
              <div className="wcw-history-when">
                {labelForScope(revision.scope || scope)} · {new Date(revision.created_at).toLocaleString()}
              </div>
              <RevisionDiff before={revision.value || ''} after={currentValue} />
            </div>
            <button type="button" className="wcw-history-restore" onClick={() => void restore(revision.id)}>
              Restore
            </button>
          </div>
        ))}
        <button type="button" className="wcw-history-close" onClick={() => setHistoryTarget(null)}>
          Close
        </button>
      </div>
    );
  };

  const renderField = (block: ContentBlock): ReactNode => {
    const resolved = (hubApp === 'order_app' ? block.resolved_order_app : block.resolved_website) ?? '';
    const managedBy = block.managed_by ?? fallbackManagedBy(block.key, resolved);
    const name = blockDisplayName(block);

    if (managedBy) {
      return (
        <div
          key={block.key}
          className="wcw-field wcw-field--wide wcw-field--managed"
          data-block-key={block.key}
          data-testid={`wcw-field-${block.key}`}
        >
          <div className="wcw-field-label">
            {name}
            {managedBy.owner_path ? (
              <Link className="wcw-field-owner" to={managedBy.owner_path.replace(/^\/admin/, '') || '/'}>
                {managedBy.owner_label || 'Managed elsewhere'}
              </Link>
            ) : null}
          </div>
          <OpsOwnedSummary managedBy={managedBy} testId={`ops-owned-${block.key}`} />
        </div>
      );
    }

    const scopes = editorScopesForBlock(block, hubApp);
    const activeScope = preferredScopeTab(scopes, blockScopeTab[block.key]);
    const value = valueForScope(block, activeScope, drafts);
    // The hero (and any other editor with a wide, multi-column layout) must not
    // be handed the desktop layout on a phone. Owner, 2026-08-15: "contents are
    // on 3 columns in hero which shrinks the content and difficult to see."
    const body = renderEditorForScope(editorDeps, block, activeScope, {
      wideLayout: !isMobile,
      mobileMode: isMobile,
    });
    const editor = scopes.length > 1
      ? renderScopeTabs({ drafts, setBlockScopeTab }, block.key, scopes, activeScope, body)
      : body;

    const wide = Boolean(block.editor)
      || block.rich
      || block.type === 'textarea'
      || block.type === 'json'
      || Boolean(seoDescriptionKey(block.key));
    const dirty = drafts[draftKey(activeScope, block.key)] !== undefined;

    return (
      <div
        key={block.key}
        className={`wcw-field${wide ? ' wcw-field--wide' : ''}${dirty ? ' wcw-field--dirty' : ''}`}
        data-block-key={block.key}
        data-testid={`wcw-field-${block.key}`}
      >
        <div className="wcw-field-label">
          {name}
          {dirty ? <span className="wcw-field-dirty" data-testid={`wcw-dirty-${block.key}`}>Unsaved</span> : null}
          <button
            type="button"
            className="wcw-field-history"
            data-testid={`wcw-history-open-${block.key}`}
            onClick={() => void openHistory(block, activeScope)}
          >
            History
          </button>
        </div>
        {block.description ? <p className="wcw-field-help">{block.description}</p> : null}
        {renderHistoryPanel(block, activeScope, value)}
        {editor}
      </div>
    );
  };

  const renderGroups = (groups: GroupedBlocks): ReactNode => (
    <>
      {groups.map((group, i) => (
        <div key={group.label ?? `group-${i}`} className="wcw-group">
          {group.label ? (
            <h3 className="wcw-group-head" data-testid={`wcw-group-${group.label}`}>{group.label}</h3>
          ) : null}
          <div className="wcw-grid">{group.blocks.map(renderField)}</div>
        </div>
      ))}
    </>
  );

  if (loading) {
    return <div className="wcw" data-testid="website-content-workspace">{skeleton}</div>;
  }

  if (showPageList) {
    return (
      <div className="wcw wcw--mobile" data-testid="website-content-workspace" data-tab="">
        <p className="wcw-blurb" data-testid="wcw-blurb">
          Five pages make up your website. Tap one to edit it.
        </p>
        <div className="wcw-pagelist" data-testid="wcw-pagelist">
          {tabs.map((tab) => (
            <button
              key={tab.name}
              type="button"
              className="wcw-pagelist-row"
              data-testid={`wcw-page-${tab.name}`}
              onClick={() => onSelectGroup(tab.name)}
            >
              <span className="wcw-pagelist-main">
                <span className="wcw-pagelist-name">{tab.name}</span>
                <span className="wcw-pagelist-desc">{PAGE_BLURB[tab.name]}</span>
              </span>
              <span className="wcw-pagelist-count">{tab.count}</span>
              <ChevronRight size={18} className="wcw-pagelist-chev" aria-hidden />
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`wcw${isMobile ? ' wcw--mobile' : ''}`}
      data-testid="website-content-workspace"
      data-tab={activeTab}
    >
      {isMobile ? (
        <div className="wcw-mobile-head">
          <button
            type="button"
            className="wcw-mobile-back"
            data-testid="wcw-mobile-back"
            onClick={() => onBack?.()}
          >
            <ArrowLeft size={18} aria-hidden />
            All pages
          </button>
          <h2 className="wcw-mobile-title">{activeTab}</h2>
        </div>
      ) : (
        <div className="wcw-tabs" role="tablist" aria-label="Website pages">
          {tabs.map((tab) => {
            const selected = tab.name === activeTab;
            return (
              <button
                key={tab.name}
                type="button"
                role="tab"
                aria-selected={selected}
                className={`wcw-tab${selected ? ' wcw-tab--active' : ''}`}
                data-testid={`wcw-tab-${tab.name}`}
                onClick={() => onSelectGroup(tab.name)}
              >
                {tab.name}
                <span className="wcw-tab-count">{tab.count}</span>
              </button>
            );
          })}
        </div>
      )}

      <p className="wcw-blurb" data-testid="wcw-blurb">{TAB_BLURB[activeTab]}</p>

      {isHome ? (
        <div className="wcw-sections" data-testid="wcw-sections">
          {homeSections.map((section) => {
            const open = openSectionId === section.id;
            const dirty = section.blocks.some((b) => dirtyKeys.has(b.key));
            const visibility = section.blockType ? visibilityByType?.[section.blockType] : undefined;
            const where = visibilityLabel(visibility);
            const showing = visibility?.showing ?? null;
            return (
              <section
                key={section.id}
                ref={(el) => { sectionRefs.current[section.id] = el; }}
                className={`wcw-sec${open ? ' wcw-sec--open' : ''}`}
                data-testid={`wcw-section-${section.id}`}
                data-open={open ? 'yes' : 'no'}
              >
                <div className="wcw-sec-head">
                  <button
                    type="button"
                    className="wcw-sec-row"
                    aria-expanded={open}
                    data-testid={`wcw-section-toggle-${section.id}`}
                    onClick={() => toggleSection(section.id)}
                  >
                    <ChevronRight size={18} className="wcw-sec-chev" aria-hidden />
                    <span className="wcw-sec-main">
                      <span className="wcw-sec-name">{section.label}</span>
                      <span className="wcw-sec-desc">{section.description}</span>
                    </span>
                  </button>
                  <div className="wcw-sec-meta">
                    {dirty ? <span className="wcw-sec-dirty" data-testid={`wcw-section-dirty-${section.id}`}>Unsaved</span> : null}
                    <span className="wcw-sec-count">
                      {section.blocks.length} setting{section.blocks.length === 1 ? '' : 's'}
                    </span>
                    {showing !== null && section.blockType ? (
                      <button
                        type="button"
                        className={`wcw-sec-where wcw-sec-where--${showing ? 'on' : 'off'}`}
                        data-testid={`wcw-section-where-${section.id}`}
                        aria-pressed={showing}
                        disabled={busyType === section.blockType}
                        title={showing
                          ? `Hide ${section.label} from the website`
                          : `Show ${section.label} on the website`}
                        onClick={() => {
                          void setShowing(section.blockType as string, !showing)
                            .then((ok) => { if (ok) onLayoutChanged?.(); });
                        }}
                      >
                        {showing
                          ? <Eye size={13} aria-hidden />
                          : <EyeOff size={13} aria-hidden />}
                        {showing ? (where ?? 'Showing') : 'Hidden'}
                      </button>
                    ) : null}
                  </div>
                </div>
                {open ? (
                  <div className="wcw-sec-body" data-testid={`wcw-section-body-${section.id}`}>
                    {renderGroups(section.groups)}
                  </div>
                ) : null}
              </section>
            );
          })}

          {layoutEditor ? (
            <section
              ref={(el) => { sectionRefs.current.layout = el; }}
              className={`wcw-sec${openSectionId === 'layout' ? ' wcw-sec--open' : ''}`}
              data-testid="wcw-section-layout"
              data-open={openSectionId === 'layout' ? 'yes' : 'no'}
            >
              <button
                type="button"
                className="wcw-sec-row"
                aria-expanded={openSectionId === 'layout'}
                data-testid="wcw-section-toggle-layout"
                onClick={() => toggleSection('layout')}
              >
                <ChevronRight size={18} className="wcw-sec-chev" aria-hidden />
                <span className="wcw-sec-main">
                  <span className="wcw-sec-name">Section order &amp; visibility</span>
                  <span className="wcw-sec-desc">Move sections up or down, hide one on desktop or on phones, add your own</span>
                </span>
              </button>
              {/* Kept mounted while collapsed so an unpublished layout draft is
                  still reported to the Publish bar. */}
              <div
                className="wcw-sec-body"
                data-testid="wcw-section-body-layout"
                hidden={openSectionId !== 'layout'}
              >
                {layoutEditor}
              </div>
            </section>
          ) : null}
        </div>
      ) : (
        <div className="wcw-form" data-testid={`wcw-form-${activeTab}`}>
          {renderGroups(pageGroups)}
          {pageGroups.length === 0 ? (
            <p className="wcw-empty" data-testid="wcw-form-empty">Nothing to edit on this page yet.</p>
          ) : null}
        </div>
      )}
    </div>
  );
}

export default WebsiteContentWorkspace;
