import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { useLocation } from 'react-router-dom';
import {
  discardContentDrafts,
  exportContent,
  getContentBlocks,
  getContentDrafts,
  getContentRevisions,
  getContentSchedules,
  importContent,
  restoreContentRevision,
  saveContentDrafts,
  scheduleContent,
  updateContent,
  uploadContentImage,
  type ContentBlock,
  type ContentLocale,
  type ContentRevision,
  type ContentScheduleRow,
  type ContentScope,
  type ContentScopeMismatch,
} from '../../api/content';
import {
  discardPageBlockDraft,
  fetchAdminPageBlocks,
  publishPageBlocks,
} from '../../api/pageBlocks';
import { ApiRequestError } from '@shared/api';
import { type HomeLayoutEditorHandle, type LayoutDraftSignal } from './HomeLayoutEditor';
import type { UploadContextRef } from './hubBlockEditors';
import { orderSectionNames } from './hubLayoutConfig';
import { visibleContentGroups } from './websitePageTasks';
import { isOpsOwnedContentKey } from './opsOwnedContentKeys';
import {
  EMPTY_DRAFTS_BY_LOCALE,
  TRUE_BY_LOCALE,
  FALSE_BY_LOCALE,
  type DraftMap,
  type DraftsByLocale,
  type LocaleMetaMap,
  type HistoryTarget,
  draftKey,
  parseDraftKey,
  collectChanges,
  uploadAppFor,
  labelForScope,
  hubAppLabel,
  isDeprecatedBlock,
  contentAppFromPath,
} from './hubDraftUtils';

export type ContentHubToast = {
  success: (message: string) => void;
  error: (message: string) => void;
};

/** Surface useful API / network errors for Publish without leaking stack traces. */
function formatContentActionError(err: unknown, fallback: string): string {
  if (err instanceof ApiRequestError) {
    if (err.status === 401 || err.status === 403) {
      return err.message || 'You do not have permission to publish this content.';
    }
    if (err.status === 422) {
      return err.message || 'Validation failed — check the highlighted fields and try again.';
    }
    if (err.status >= 500) {
      return err.message || 'Server error — try again in a moment.';
    }
    return err.message || fallback;
  }
  if (err instanceof TypeError) {
    return 'Network error — check your connection and try again. Drafts are still on this device.';
  }
  if (err instanceof Error && err.message.trim()) {
    return err.message;
  }
  return fallback;
}

export function useContentHubController(toast: ContentHubToast) {
  const { success, error } = toast;
  const location = useLocation();
  const hubApp = contentAppFromPath(location.pathname);
  const hubLabel = hubAppLabel(hubApp);

  const [blocks, setBlocks] = useState<ContentBlock[]>([]);
  const [mismatches, setMismatches] = useState<ContentScopeMismatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [locale, setLocale] = useState<ContentLocale>('en');
  const [draftsByLocale, setDraftsByLocale] = useState<DraftsByLocale>(() => ({ ...EMPTY_DRAFTS_BY_LOCALE }));
  const [historyTarget, setHistoryTarget] = useState<HistoryTarget>(null);
  const [revisions, setRevisions] = useState<ContentRevision[]>([]);
  const [schedules, setSchedules] = useState<ContentScheduleRow[]>([]);
  const [scheduleAt, setScheduleAt] = useState('');
  const [lastSavedAtByLocale, setLastSavedAtByLocale] = useState<LocaleMetaMap<string | null>>(() => ({ ...FALSE_BY_LOCALE }));
  const [autosaving, setAutosaving] = useState(false);
  const [autosaveFailed, setAutosaveFailed] = useState(false);
  const [autosaveErrorDetail, setAutosaveErrorDetail] = useState<string | null>(null);
  const [publishFailed, setPublishFailed] = useState(false);
  const [serverDraftSyncedByLocale, setServerDraftSyncedByLocale] = useState<LocaleMetaMap<boolean>>(() => ({ ...TRUE_BY_LOCALE }));
  /** Homepage layout draft — merged into global publish status. */
  const [layoutDraft, setLayoutDraft] = useState(false);
  /** Bumps when layout draft versions change, so readers re-fetch. */
  const [layoutRevision, setLayoutRevision] = useState(0);

  const handleLayoutDraftChange = (signal: LayoutDraftSignal) => {
    setLayoutDraft(signal.hasDraft);
    setLayoutRevision(signal.revision);
  };

  const fileInputRef = useRef<HTMLInputElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const uploadCtx: UploadContextRef = useRef(null);
  const homeLayoutEditorRef = useRef<HomeLayoutEditorHandle | null>(null);
  const draftsByLocaleRef = useRef<DraftsByLocale>({ ...EMPTY_DRAFTS_BY_LOCALE });
  const serverDraftSyncedByLocaleRef = useRef<LocaleMetaMap<boolean>>({ ...TRUE_BY_LOCALE });
  const loadGen = useRef(0);
  const saveGeneration = useRef(0);
  const publishInFlight = useRef(false);
  const autosaveInFlight = useRef(false);

  const drafts = draftsByLocale[locale] ?? {};
  const lastSavedAt = lastSavedAtByLocale[locale] ?? null;
  const serverDraftSynced = serverDraftSyncedByLocale[locale] ?? true;

  const replaceLocaleDrafts = (loc: ContentLocale, nextDrafts: DraftMap) => {
    setDraftsByLocale((prev) => {
      const next = { ...prev, [loc]: nextDrafts };
      draftsByLocaleRef.current = next;
      return next;
    });
  };

  const updateLocaleDrafts = (loc: ContentLocale, updater: (prev: DraftMap) => DraftMap) => {
    setDraftsByLocale((prev) => {
      const nextDrafts = updater(prev[loc] ?? {});
      const next = { ...prev, [loc]: nextDrafts };
      draftsByLocaleRef.current = next;
      return next;
    });
  };

  const setLocaleSynced = (loc: ContentLocale, synced: boolean) => {
    serverDraftSyncedByLocaleRef.current = { ...serverDraftSyncedByLocaleRef.current, [loc]: synced };
    setServerDraftSyncedByLocale((prev) => ({ ...prev, [loc]: synced }));
  };

  const setLocaleLastSavedAt = (loc: ContentLocale, savedAt: string | null) => {
    setLastSavedAtByLocale((prev) => ({ ...prev, [loc]: savedAt }));
  };

  const load = async (loc: ContentLocale = locale) => {
    const gen = ++loadGen.current;
    setLoading(true);
    try {
      const [blockRes, scheduleRes, appDrafts] = await Promise.all([
        getContentBlocks(loc),
        getContentSchedules('pending'),
        getContentDrafts(hubApp, loc).catch((e) => {
          error(e instanceof Error ? e.message : 'Could not load saved drafts for this app');
          return { drafts: {} as Record<string, string>, saved_at: null };
        }),
      ]);
      if (gen !== loadGen.current) return;
      const restored: DraftMap = {};
      for (const [key, value] of Object.entries(appDrafts.drafts || {})) {
        restored[draftKey(hubApp, key)] = value;
      }
      const hadUnsyncedLocal = serverDraftSyncedByLocaleRef.current[loc] === false;
      const nextDrafts = hadUnsyncedLocal
        ? { ...restored, ...(draftsByLocaleRef.current[loc] ?? {}) }
        : restored;
      setBlocks(blockRes.blocks);
      setMismatches(blockRes.mismatches ?? []);
      setSchedules(scheduleRes.schedules);
      replaceLocaleDrafts(loc, nextDrafts);
      setLocaleLastSavedAt(loc, appDrafts.saved_at);
      setLocaleSynced(loc, !hadUnsyncedLocal);
      setAutosaveFailed(false);
      setPublishFailed(false);
    } catch (e) {
      if (gen !== loadGen.current) return;
      error(e instanceof Error ? e.message : 'Failed to load content');
    } finally {
      if (gen === loadGen.current) setLoading(false);
    }
  };

  useEffect(() => {
    void load(locale);
    return () => { loadGen.current += 1; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale, hubApp]);

  // Does this hub have an unpublished layout draft? The Publish bar needs to
  // know: reordering or hiding a section is unpublished work even when no
  // wording changed. Only this hub's app counts — a website draft must not
  // light up Publish on the Order App.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetchAdminPageBlocks(hubApp);
        if (cancelled) return;
        setLayoutDraft(Boolean(res.draft));
      } catch {
        /* best effort — a failed read must not claim there are no drafts */
      }
    })();
    return () => { cancelled = true; };
    // layoutRevision bumps on every draft mutate so the bar refreshes at once.
  }, [hubApp, layoutDraft, layoutRevision]);

  const contentBlocks = useMemo(
    () => blocks.filter((block) => !isDeprecatedBlock(block) && block.apps.includes(hubApp)),
    [blocks, hubApp],
  );

  const orderedSectionNames = useMemo(
    () => orderSectionNames(visibleContentGroups(contentBlocks, hubApp), hubApp),
    [contentBlocks, hubApp],
  );

  const dirtyCount = useMemo(
    () => collectChanges(drafts, locale, hubApp).length,
    [drafts, locale, hubApp],
  );
  const hasUnsaved = dirtyCount > 0 && !serverDraftSynced;
  const effectiveDirtyCount = dirtyCount + (layoutDraft ? 1 : 0);

  const draftKeys = useMemo(() => Object.keys(drafts), [drafts]);

  const setDraft = (scope: ContentScope, key: string, value: string) => {
    if (isOpsOwnedContentKey(key)) return;
    const loc = locale;
    saveGeneration.current += 1;
    updateLocaleDrafts(loc, (prev) => ({ ...prev, [draftKey(scope, key)]: value }));
    setLocaleSynced(loc, false);
    setAutosaveFailed(false);
    setAutosaveErrorDetail(null);
    setPublishFailed(false);
  };

  const persistDrafts = async (loc: ContentLocale = locale): Promise<boolean> => {
    const gen = saveGeneration.current;
    const changes = collectChanges(draftsByLocaleRef.current[loc] ?? {}, loc, hubApp);
    if (changes.length === 0) {
      setAutosaveFailed(false);
      setAutosaveErrorDetail(null);
      setLocaleSynced(loc, true);
      return true;
    }
    autosaveInFlight.current = true;
    setAutosaving(true);
    setAutosaveFailed(false);
    setAutosaveErrorDetail(null);
    try {
      const res = await saveContentDrafts(changes, loc);
      if (gen !== saveGeneration.current) return false;
      if (res == null || typeof res !== 'object') {
        throw new Error('Malformed draft save response from server.');
      }
      if (typeof res.saved_at === 'string') {
        setLocaleLastSavedAt(loc, res.saved_at);
      }
      setLocaleSynced(loc, true);
      setAutosaveFailed(false);
      setAutosaveErrorDetail(null);
      return true;
    } catch (e) {
      if (gen === saveGeneration.current) {
        setAutosaveFailed(true);
        setAutosaveErrorDetail(formatContentActionError(e, 'Draft save failed'));
        setLocaleSynced(loc, false);
      }
      return false;
    } finally {
      autosaveInFlight.current = false;
      const stillHasDrafts = collectChanges(draftsByLocaleRef.current[loc] ?? {}, loc, hubApp).length > 0;
      if (gen === saveGeneration.current || !stillHasDrafts) setAutosaving(false);
    }
  };

  // Autosave — failures stay visible until retry succeeds (never silently ignored).
  useEffect(() => {
    if (dirtyCount === 0 || serverDraftSynced) return;
    const t = window.setTimeout(() => {
      void persistDrafts(locale);
    }, 2500);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drafts, dirtyCount, serverDraftSynced, locale]);

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!hasUnsaved && dirtyCount === 0 && !layoutDraft) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [hasUnsaved, dirtyCount, layoutDraft]);

  /**
   * Publish layout drafts for THIS hub app only. Website and Order App never
   * publish each other's page-block drafts from a single Publish click.
   */
  const publishLayoutDraftsViaApi = async () => {
    const app = hubApp;
    const res = await fetchAdminPageBlocks(app);
    if (res.draft) {
      await publishPageBlocks({ app, version: res.version ?? 0 });
    }
    setLayoutDraft(false);
    await homeLayoutEditorRef.current?.reload?.();
  };

  const discardLayoutDraftsViaApi = async () => {
    const app = hubApp;
    const res = await fetchAdminPageBlocks(app);
    if (res.draft) {
      await discardPageBlockDraft({ app });
    }
    setLayoutDraft(false);
    await homeLayoutEditorRef.current?.reload?.();
  };

  // Unified publish — content keys + layout draft for the current hub app only.
  const publish = async () => {
    if (publishInFlight.current || saving) return;
    const changes = collectChanges(drafts, locale, hubApp);
    if (changes.length === 0 && !layoutDraft) return;

    publishInFlight.current = true;
    setSaving(true);
    setPublishFailed(false);
    try {
      // Finish any in-flight / pending autosave so we don't race the draft store.
      if (autosaveInFlight.current || (changes.length > 0 && !serverDraftSynced)) {
        const saved = await persistDrafts(locale);
        if (!saved && changes.length > 0) {
          throw new Error('Draft not saved — fix the save error, then publish again.');
        }
      }

      let nextBlocks = contentBlocks;
      if (changes.length > 0) {
        const res = await updateContent(changes, locale);
        if (!res || !Array.isArray(res.blocks)) {
          throw new Error('Malformed publish response from server — drafts were not cleared.');
        }
        nextBlocks = res.blocks;
      }
      if (layoutDraft) {
        await publishLayoutDraftsViaApi();
      }

      // Clear local drafts only after the server confirmed every step.
      if (changes.length > 0) {
        setBlocks(nextBlocks);
        saveGeneration.current += 1;
        // Drop only this hub app's draft keys so the other app's local map is untouched if present.
        const remaining: DraftMap = {};
        for (const [composite, value] of Object.entries(draftsByLocaleRef.current[locale] ?? {})) {
          const parsed = parseDraftKey(composite);
          if (parsed && parsed.scope !== hubApp) remaining[composite] = value;
        }
        replaceLocaleDrafts(locale, remaining);
        setLocaleSynced(locale, true);
        setLocaleLastSavedAt(locale, new Date().toISOString());
        setAutosaveFailed(false);
      }
      setPublishFailed(false);
      success(hubApp === 'website' ? 'Website published' : 'Order App published');
    } catch (e) {
      setPublishFailed(true);
      error(formatContentActionError(e, 'Publish failed'));
    } finally {
      publishInFlight.current = false;
      setSaving(false);
    }
  };

  const schedulePublish = async () => {
    const changes = collectChanges(drafts, locale, hubApp);
    if (changes.length === 0 || !scheduleAt) {
      error('Set a future time and make some edits first');
      return;
    }
    if (layoutDraft) {
      const proceed = window.confirm(
        'Homepage layout drafts cannot be scheduled. Content keys will be scheduled; layout stays as an unpublished draft until you Publish or Discard it. Continue?',
      );
      if (!proceed) return;
    }
    setSaving(true);
    try {
      await scheduleContent(new Date(scheduleAt).toISOString(), changes, locale);
      // Server clears matching ContentDraft rows; clear local state to match.
      saveGeneration.current += 1;
      replaceLocaleDrafts(locale, {});
      setLocaleSynced(locale, true);
      setScheduleAt('');
      const { schedules: nextSchedules } = await getContentSchedules('pending');
      setSchedules(nextSchedules);
      success(
        layoutDraft
          ? 'Content scheduled. Homepage layout draft was not included — publish it separately.'
          : 'Publish scheduled',
      );
    } catch (e) {
      error(e instanceof Error ? e.message : 'Schedule failed');
    } finally {
      setSaving(false);
    }
  };

  const onUpload = async (block: ContentBlock, scope: ContentScope, file: File) => {
    try {
      const res = await uploadContentImage(block.key, uploadAppFor(scope), file, undefined, locale);
      setDraft(scope, block.key, res.url);
      success('Image uploaded');
    } catch (e) {
      error(e instanceof Error ? e.message : 'Upload failed');
    }
  };

  const makeTriggerUpload = (block: ContentBlock, scope: ContentScope) =>
    (_legacyKey: string, onDone: (url: string) => void) => {
      uploadCtx.current = { blockKey: block.key, scope, onDone };
      fileInputRef.current?.click();
    };

  const handleEmbedFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const ctx = uploadCtx.current;
    e.target.value = '';
    uploadCtx.current = null;
    if (!file || !ctx) return;
    try {
      const res = await uploadContentImage(ctx.blockKey, uploadAppFor(ctx.scope), file, undefined, locale);
      ctx.onDone(res.url);
      success('Image uploaded');
    } catch (err) {
      error(err instanceof Error ? err.message : 'Upload failed');
    }
  };

  const openHistory = async (block: ContentBlock, scope: ContentScope) => {
    setHistoryTarget({ key: block.key, scope, label: labelForScope(scope) });
    try {
      const { revisions: nextRevisions } = await getContentRevisions(block.key, scope, locale);
      setRevisions(nextRevisions);
    } catch (e) {
      error(e instanceof Error ? e.message : 'Failed to load history');
    }
  };

  const restore = async (id: number) => {
    if (!historyTarget) return;
    if (!window.confirm('Restore this revision? Current value is saved to history first.')) return;
    try {
      const { blocks: nextBlocks } = await restoreContentRevision(historyTarget.key, id);
      setBlocks(nextBlocks);
      const { revisions: nextRevisions } = await getContentRevisions(historyTarget.key, historyTarget.scope, locale);
      setRevisions(nextRevisions);
      success('Revision restored');
    } catch (e) {
      error(e instanceof Error ? e.message : 'Restore failed');
    }
  };

  const doExport = async () => {
    try {
      const bundle = await exportContent(locale, hubApp);
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `content-hub-${hubApp}-${locale}-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      success(`${hubLabel} export downloaded`);
    } catch (e) {
      error(e instanceof Error ? e.message : 'Export failed');
    }
  };

  const doImport = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const bundle = JSON.parse(text) as {
        version?: number;
        exported_at?: string;
        locale?: string;
        entries?: Array<{ key: string; scope: ContentScope; locale: string; value: string }>;
      };
      if (!bundle?.entries) throw new Error('Invalid bundle');
      const forThisApp = bundle.entries.filter((entry) => entry.scope === hubApp);
      const skipped = bundle.entries.length - forThisApp.length;
      if (forThisApp.length === 0) {
        throw new Error(`No ${hubLabel} entries in this file. Import only applies to the app you are editing.`);
      }
      if (skipped > 0) {
        const proceed = window.confirm(
          `This file has ${skipped} entr${skipped === 1 ? 'y' : 'ies'} for the other app. `
          + `Only ${forThisApp.length} ${hubLabel} entr${forThisApp.length === 1 ? 'y' : 'ies'} will be imported. Continue?`,
        );
        if (!proceed) return;
      }
      const { blocks: nextBlocks, applied } = await importContent({
        version: bundle.version ?? 1,
        exported_at: bundle.exported_at ?? new Date().toISOString(),
        locale: bundle.locale ?? locale,
        entries: forThisApp,
      });
      setBlocks(nextBlocks);
      success(`Imported ${applied} ${hubLabel} entries`);
    } catch (err) {
      error(err instanceof Error ? err.message : 'Import failed');
    }
  };

  /**
   * Discard ONE block's draft.
   *
   * Owner, 2026-08-19: "there is no way to discard saved draft in hero." The
   * only discard was all-or-nothing per app, so abandoning one bad hero draft
   * meant throwing away every other unpublished change with it.
   */
  const discardBlockDraft = async (key: string) => {
    if (!drafts[key]) return;
    if (!window.confirm(`Discard the unpublished draft for this block? It goes back to what is published now.`)) return;
    setSaving(true);
    try {
      await discardContentDrafts(locale, hubApp, key);
      saveGeneration.current += 1;
      // Drop just this key locally; the rest of the drafts stand.
      const remaining = { ...drafts };
      delete remaining[key];
      replaceLocaleDrafts(locale, remaining);
      setAutosaveFailed(false);
      setAutosaveErrorDetail(null);
      success('Draft discarded');
    } catch (e) {
      error(e instanceof Error ? e.message : 'Could not discard the draft');
    } finally {
      setSaving(false);
    }
  };

  // Unified discard — current hub app only (never the other app's drafts).
  const discardAllContentDrafts = async () => {
    const hasContentDrafts = dirtyCount > 0;
    if (!hasContentDrafts && !layoutDraft) return;
    const confirmMessage = hasContentDrafts && layoutDraft
      ? `Discard unpublished ${hubLabel} content and layout drafts for this language? The other app is not affected.`
      : layoutDraft
        ? `Discard unpublished ${hubLabel} Home layout drafts?`
        : `Discard unpublished ${hubLabel} content drafts for this language? The other app is not affected.`;
    if (!window.confirm(confirmMessage)) return;
    setSaving(true);
    try {
      if (hasContentDrafts) {
        await discardContentDrafts(locale, hubApp);
      }
      saveGeneration.current += 1;
      replaceLocaleDrafts(locale, {});
      setLocaleSynced(locale, true);
      setAutosaveFailed(false);
      setAutosaveErrorDetail(null);
      setPublishFailed(false);
      if (layoutDraft) {
        await discardLayoutDraftsViaApi();
      }
      success(hubApp === 'website' ? 'Website draft discarded' : 'Order App draft discarded');
    } catch (e) {
      error(e instanceof Error ? e.message : 'Could not discard drafts');
    } finally {
      setSaving(false);
    }
  };

  return {
    hubApp,
    hubLabel,
    blocks,
    mismatches,
    loading,
    saving,
    locale,
    setLocale,
    drafts,
    lastSavedAt,
    hasUnsaved,
    historyTarget,
    setHistoryTarget,
    revisions,
    schedules,
    scheduleAt,
    setScheduleAt,
    layoutDraft,
    layoutRevision,
    handleLayoutDraftChange,
    autosaving,
    autosaveFailed,
    autosaveErrorDetail,
    publishFailed,
    contentBlocks,
    dirtyCount,
    effectiveDirtyCount,
    orderedSectionNames,
    draftKeys,
    discardBlockDraft,
    setDraft,
    persistDrafts,
    publish,
    schedulePublish,
    discardAllContentDrafts,
    onUpload,
    makeTriggerUpload,
    handleEmbedFile,
    openHistory,
    restore,
    doExport,
    doImport,
    fileInputRef,
    importInputRef,
    uploadCtx,
    homeLayoutEditorRef,
    load,
  };
}
