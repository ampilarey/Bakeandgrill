import { useMemo } from 'react';
import type { ContentApp, ContentBlock, ContentScope } from '../../api/content';
import { SectionRail, type SectionRailItem } from './SectionRail';
import { blocksForContentView, isGroupDirty } from './websitePageTasks';

export type HubSectionListProps = {
  app: ContentApp;
  orderedSectionNames: string[];
  contentBlocks: ContentBlock[];
  draftKeys: string[];
  parseDraftKey: (composite: string) => { scope: ContentScope; key: string } | null;
  active: string | null;
  onSelect: (name: string) => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
};

/** Build left-rail section rows (count + dirty) for Content Hub. */
export function buildHubRailSections(
  orderedSectionNames: string[],
  contentBlocks: ContentBlock[],
  draftKeys: string[],
  parseDraftKey: (composite: string) => { scope: ContentScope; key: string } | null,
  app: ContentApp,
): SectionRailItem[] {
  return orderedSectionNames.map((name) => {
    const viewBlocks = blocksForContentView(name, contentBlocks, app);
    return {
      name,
      count: viewBlocks.length,
      dirty: isGroupDirty(name, contentBlocks, draftKeys, parseDraftKey, app),
    };
  });
}

/**
 * Left rail / group selection for Content Hub desktop.
 * Owns rail section row derivation; selection state stays in ContentHubPage.
 */
export function HubSectionList({
  app,
  orderedSectionNames,
  contentBlocks,
  draftKeys,
  parseDraftKey,
  active,
  onSelect,
  collapsed,
  onToggleCollapsed,
}: HubSectionListProps) {
  const sections = useMemo(
    () => buildHubRailSections(orderedSectionNames, contentBlocks, draftKeys, parseDraftKey, app),
    [app, orderedSectionNames, contentBlocks, draftKeys, parseDraftKey],
  );

  return (
    <SectionRail
      variant="rail"
      sections={sections}
      active={active}
      onSelect={onSelect}
      collapsed={collapsed}
      onToggleCollapsed={onToggleCollapsed}
    />
  );
}
