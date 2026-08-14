import { isHeroSlideShowing } from '../../components/content-editors';
import type { ContentBlock, ContentScope } from '../../api/content';
import { valueForScope, type DraftMap } from './hubDraftUtils';
import { fallbackManagedBy } from './opsOwnedContentKeys';

export type BlockSummary = {
  /** Plain-language “what it currently says” — never the raw key. */
  line: string;
  visibility: 'Showing' | 'Hidden' | 'Managed elsewhere';
  /** True when we could only fall back to a weak label (report these). */
  weak: boolean;
};

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Load-bearing summary for Website desktop component rows (Stage B).
 * Prefer human copy over key names. Empty JSON arrays read as empty, not defaults.
 */
export function summarizeBlockValue(
  block: ContentBlock,
  hubApp: ContentScope,
  drafts: DraftMap,
): BlockSummary {
  const resolvedDisplay =
    (hubApp === 'order_app' ? block.resolved_order_app : block.resolved_website) ?? '';
  const managedBy = block.managed_by ?? fallbackManagedBy(block.key, resolvedDisplay);
  if (managedBy) {
    const display = String(managedBy.current_value ?? resolvedDisplay ?? '').trim();
    return {
      line: display || 'Not set yet',
      visibility: 'Managed elsewhere',
      weak: false,
    };
  }

  const scopes = block.apps?.includes(hubApp) ? [hubApp as ContentScope] : (['website'] as ContentScope[]);
  const scope = (scopes.includes(hubApp) ? hubApp : scopes[0]) as ContentScope;
  const raw = valueForScope(block, scope, drafts);
  const trimmed = (raw ?? '').trim();

  if (block.editor === 'hero' || block.key === 'hero_slides') {
    const parsed = parseJson(trimmed || '[]');
    const slides = Array.isArray(parsed) ? parsed as Array<{ title?: string; showing?: boolean }> : [];
    if (slides.length === 0) {
      return { line: 'No slides yet', visibility: 'Hidden', weak: false };
    }
    const showing = slides.filter((s) => isHeroSlideShowing(s));
    const firstTitle = stripHtml(String(showing[0]?.title || slides[0]?.title || ''));
    const countLabel = `${slides.length} slide${slides.length === 1 ? '' : 's'}`;
    return {
      line: firstTitle ? `${firstTitle} · ${countLabel}` : countLabel,
      visibility: showing.length > 0 ? 'Showing' : 'Hidden',
      weak: !firstTitle,
    };
  }

  if (block.editor === 'trust' || block.key === 'trust_items') {
    const parsed = parseJson(trimmed || '[]');
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return { line: 'Empty', visibility: 'Hidden', weak: false };
    }
    const first = parsed[0] as { heading?: string; title?: string; text?: string };
    const firstLabel = String(first?.heading || first?.title || first?.text || '').trim();
    return {
      line: firstLabel
        ? `${firstLabel} · ${parsed.length} item${parsed.length === 1 ? '' : 's'}`
        : `${parsed.length} item${parsed.length === 1 ? '' : 's'}`,
      visibility: 'Showing',
      weak: !firstLabel,
    };
  }

  if (block.editor === 'categories' || block.key === 'homepage_categories') {
    const parsed = parseJson(trimmed || '[]');
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return { line: 'Empty', visibility: 'Hidden', weak: false };
    }
    const first = parsed[0] as { name?: string; label?: string; title?: string };
    const firstLabel = String(first?.name || first?.label || first?.title || '').trim();
    return {
      line: firstLabel
        ? `${firstLabel} · ${parsed.length} categor${parsed.length === 1 ? 'y' : 'ies'}`
        : `${parsed.length} categor${parsed.length === 1 ? 'y' : 'ies'}`,
      visibility: 'Showing',
      weak: !firstLabel,
    };
  }

  if (block.editor === 'proof' || /proof/i.test(block.key)) {
    if (!trimmed || trimmed === '[]' || trimmed === '{}') {
      return { line: 'Empty', visibility: 'Hidden', weak: false };
    }
    const parsed = parseJson(trimmed);
    if (Array.isArray(parsed)) {
      const first = parsed[0] as { label?: string; value?: string; text?: string } | undefined;
      const bit = String(first?.label || first?.value || first?.text || '').trim();
      return {
        line: bit || `${parsed.length} detail${parsed.length === 1 ? '' : 's'}`,
        visibility: parsed.length > 0 ? 'Showing' : 'Hidden',
        weak: !bit,
      };
    }
    if (parsed && typeof parsed === 'object') {
      const obj = parsed as Record<string, unknown>;
      const bit = String(obj.eyebrow || obj.label || obj.title || obj.text || '').trim();
      return { line: bit || block.label, visibility: 'Showing', weak: !bit };
    }
  }

  if (block.type === 'json' || trimmed.startsWith('[') || trimmed.startsWith('{')) {
    if (trimmed === '' || trimmed === '[]' || trimmed === '{}') {
      return { line: 'Empty', visibility: 'Hidden', weak: false };
    }
    const parsed = parseJson(trimmed);
    if (Array.isArray(parsed)) {
      if (parsed.length === 0) {
        return { line: 'Empty', visibility: 'Hidden', weak: false };
      }
      return {
        line: `${parsed.length} item${parsed.length === 1 ? '' : 's'}`,
        visibility: 'Showing',
        weak: false,
      };
    }
    if (parsed && typeof parsed === 'object') {
      return { line: 'Configured', visibility: 'Showing', weak: false };
    }
  }

  if (block.type === 'boolean') {
    const on = trimmed === 'true' || trimmed === '1';
    return { line: on ? 'On' : 'Off', visibility: on ? 'Showing' : 'Hidden', weak: false };
  }

  if (!trimmed) {
    return { line: 'Not set yet', visibility: 'Hidden', weak: false };
  }

  const oneLine = stripHtml(trimmed).replace(/\s+/g, ' ');
  return {
    line: oneLine.length > 72 ? `${oneLine.slice(0, 69)}…` : oneLine,
    visibility: 'Showing',
    weak: false,
  };
}

/** Prefer owner-facing label; never surface the raw key as the row title. */
export function blockDisplayName(block: ContentBlock): string {
  const label = (block.label || '').trim();
  if (label && label !== block.key) return label;
  return label || block.key;
}
