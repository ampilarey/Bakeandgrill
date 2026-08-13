import type { ContentApp, ContentBlock, ContentLocale, ContentScope } from '../../api/content';
import { isOpsOwnedContentKey } from './opsOwnedContentKeys';

export type DraftMap = Record<string, string>;
export type DraftsByLocale = Record<ContentLocale, DraftMap>;
export type LocaleMetaMap<T> = Record<ContentLocale, T>;

export type DraftChange = {
  key: string;
  scope: ContentScope;
  value: string;
  locale: ContentLocale;
};

export type HistoryTarget = {
  key: string;
  scope: ContentScope;
  label: string;
} | null;

export type PreviewState = {
  website: string | null;
  orderApp: string | null;
};

export const ALL_SCOPES: ContentScope[] = ['shared', 'website', 'order_app'];
export const EMPTY_DRAFTS_BY_LOCALE: DraftsByLocale = { en: {}, dv: {} };
export const TRUE_BY_LOCALE: LocaleMetaMap<boolean> = { en: true, dv: true };
export const FALSE_BY_LOCALE: LocaleMetaMap<string | null> = { en: null, dv: null };

export function seoDescriptionKey(titleKey: string): string | null {
  if (titleKey === 'meta_title') return 'meta_description';
  if (titleKey.endsWith('_meta_title')) return titleKey.replace(/_meta_title$/, '_meta_description');
  return null;
}

export function isSeoDescriptionKey(key: string): boolean {
  return key === 'meta_description' || key.endsWith('_meta_description');
}

export function draftKey(scope: ContentScope, key: string): string {
  return `${scope}::${key}`;
}

export function parseDraftKey(composite: string): { scope: ContentScope; key: string } | null {
  const idx = composite.indexOf('::');
  if (idx <= 0) return null;
  const scope = composite.slice(0, idx);
  const key = composite.slice(idx + 2);
  if (!ALL_SCOPES.includes(scope as ContentScope) || key.length === 0) return null;
  return { scope: scope as ContentScope, key };
}

export function collectChanges(drafts: DraftMap, locale: ContentLocale, app?: ContentApp): DraftChange[] {
  return Object.entries(drafts)
    .map(([composite, value]) => {
      const parsed = parseDraftKey(composite);
      if (!parsed) return null;
      if (app && parsed.scope !== app) return null;
      if (isOpsOwnedContentKey(parsed.key)) return null;
      return { key: parsed.key, scope: parsed.scope, value, locale };
    })
    .filter((change): change is DraftChange => Boolean(change));
}

export function isDualAppBlock(block: ContentBlock): boolean {
  return block.apps.includes('website') && block.apps.includes('order_app');
}

export function uploadAppFor(scope: ContentScope): ContentApp {
  return scope === 'order_app' ? 'order_app' : 'website';
}

export function labelForScope(scope: ContentScope): string {
  if (scope === 'order_app') return 'Order App';
  if (scope === 'website') return 'Website';
  return 'Business record';
}

export function hubAppLabel(app: ContentApp): string {
  return app === 'order_app' ? 'Order App' : 'Website';
}

export function baseValueForScope(block: ContentBlock, scope: ContentScope): string {
  if (scope === 'shared') {
    return block.shared ?? block.default ?? '';
  }
  if (scope === 'website') {
    return block.website ?? block.resolved_website ?? block.default ?? '';
  }
  return block.order_app ?? block.resolved_order_app ?? block.default ?? '';
}

export function valueForScope(block: ContentBlock, scope: ContentScope, drafts: DraftMap): string {
  const key = draftKey(scope, block.key);
  if (drafts[key] !== undefined) return drafts[key];
  return baseValueForScope(block, scope);
}

export function editorScopesForBlock(block: ContentBlock, app: ContentApp): ContentScope[] {
  if (isDualAppBlock(block) || block.apps.includes(app)) return [app];
  if (block.apps.includes('order_app')) return ['order_app'];
  if (block.apps.includes('website')) return ['website'];
  return [app];
}

export function preferredScopeTab(scopes: ContentScope[], preferred?: ContentScope): ContentScope {
  if (preferred && scopes.includes(preferred)) return preferred;
  if (scopes.includes('website')) return 'website';
  return scopes[0];
}

export function scopeHasDraft(scope: ContentScope, key: string, drafts: DraftMap): boolean {
  return drafts[draftKey(scope, key)] !== undefined;
}

export function isDeprecatedBlock(block: ContentBlock): boolean {
  return Boolean(block.deprecated) || /^hero_slide_[123]$/.test(block.key);
}

export function contentAppFromPath(pathname: string): ContentApp {
  if (pathname.includes('/content/order-app')) return 'order_app';
  return 'website';
}
