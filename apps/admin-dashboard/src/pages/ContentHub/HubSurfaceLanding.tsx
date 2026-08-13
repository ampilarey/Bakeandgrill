import type { ReactNode } from 'react';
import { SurfaceBuilderLanding } from './SurfaceBuilderLanding';
import type { ContentTask } from './taskLandingConfig';
import type { SurfaceApp, SurfaceRecord } from './surfaceCatalog';

export type HubSurfaceLandingProps = {
  loading: boolean;
  skeleton: ReactNode;
  appFilter: SurfaceApp;
  surfaceCounts: Record<string, number | string>;
  dirtyGroups: Set<string>;
  onSelectSurface: (surface: SurfaceRecord) => void;
  onSelectTask: (task: ContentTask) => void;
};

/**
 * Surface / page card overview for Content Hub.
 * Thin host around SurfaceBuilderLanding — keeps loading skeleton wiring out of ContentHubPage.
 */
export function HubSurfaceLanding({
  loading,
  skeleton,
  appFilter,
  surfaceCounts,
  dirtyGroups,
  onSelectSurface,
  onSelectTask,
}: HubSurfaceLandingProps) {
  if (loading) return <>{skeleton}</>;
  return (
    <SurfaceBuilderLanding
      appFilter={appFilter}
      surfaceCounts={surfaceCounts}
      dirtyGroups={dirtyGroups}
      onSelectSurface={onSelectSurface}
      onSelectTask={onSelectTask}
    />
  );
}
