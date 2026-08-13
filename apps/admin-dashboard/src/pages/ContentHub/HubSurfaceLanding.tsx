import type { ReactNode } from 'react';
import { SurfaceBuilderLanding, type LandingPageRow } from './SurfaceBuilderLanding';
import type { ContentTask } from './taskLandingConfig';
import type { SurfaceApp, SurfaceDevice, SurfaceRecord } from './surfaceCatalog';

export type HubSurfaceLandingProps = {
  loading: boolean;
  skeleton: ReactNode;
  appFilter: SurfaceApp;
  preferredDevice?: SurfaceDevice;
  /** Desktop workspace composition — leave false on mobile shell. */
  desktopLayout?: boolean;
  pageRows?: LandingPageRow[];
  onSelectPage?: (sectionName: string) => void;
  surfaceCounts: Record<string, number | string>;
  dirtyGroups: Set<string>;
  onSelectSurface: (surface: SurfaceRecord) => void;
  onSelectTask: (task: ContentTask) => void;
};

/**
 * Surface / page overview for Content Hub.
 * Thin host around SurfaceBuilderLanding — keeps loading skeleton wiring out of ContentHubPage.
 */
export function HubSurfaceLanding({
  loading,
  skeleton,
  appFilter,
  preferredDevice,
  desktopLayout = false,
  pageRows,
  onSelectPage,
  surfaceCounts,
  dirtyGroups,
  onSelectSurface,
  onSelectTask,
}: HubSurfaceLandingProps) {
  if (loading) return <>{skeleton}</>;
  return (
    <SurfaceBuilderLanding
      appFilter={appFilter}
      preferredDevice={preferredDevice}
      desktopLayout={desktopLayout}
      pageRows={pageRows}
      onSelectPage={onSelectPage}
      surfaceCounts={surfaceCounts}
      dirtyGroups={dirtyGroups}
      onSelectSurface={onSelectSurface}
      onSelectTask={onSelectTask}
    />
  );
}
