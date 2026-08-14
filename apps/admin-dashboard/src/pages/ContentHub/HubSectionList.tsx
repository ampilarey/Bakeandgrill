import { useMemo } from 'react';
import type { ContentApp, ContentBlock, ContentScope } from '../../api/content';
import { SectionRail, type SectionRailHeroPin, type SectionRailItem } from './SectionRail';
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
  hideOverview?: boolean;
  /** Website desktop only — ★ Hero pin above the Pages cluster. */
  heroPin?: SectionRailHeroPin;
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
  hideOverview = false,
  heroPin,
}: HubSectionListProps) {
  const sections = useMemo(
    () => buildHubRailSections(orderedSectionNames, contentBlocks, draftKeys, parseDraftKey, app),
    [app, orderedSectionNames, contentBlocks, draftKeys, parseDraftKey],
  );

  return (
    <SectionRail
      variant="rail"
      app={app}
      sections={sections}
      active={active}
      onSelect={onSelect}
      collapsed={collapsed}
      onToggleCollapsed={onToggleCollapsed}
      hideOverview={hideOverview}
      heroPin={heroPin}
    />
  );
}
