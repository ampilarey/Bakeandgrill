import { ChevronRight, LayoutGrid } from 'lucide-react';
import {
  appLabel,
  deviceLabel,
  slotsFor,
  slotLabel,
  surfaceId,
  type SurfaceApp,
  type SurfaceDevice,
  type SurfaceRecord,
} from './surfaceCatalog';
import { BRAND_PAGE_TASKS, type ContentTask, type ContentTaskId } from './taskLandingConfig';

export type SurfaceBuilderLandingProps = {
  /** Optional component counts keyed by surface id (e.g. website.mobile.header). */
  surfaceCounts?: Record<string, number>;
  /** Dirty section names for unpublished-edit dots on brand/page cards. */
  dirtyGroups?: Set<string>;
  onSelectSurface: (surface: SurfaceRecord) => void;
  onSelectTask: (task: ContentTask) => void;
};

const SURFACE_APPS: Array<{ id: SurfaceApp; label: string }> = [
  { id: 'website', label: 'Website' },
  { id: 'order_app', label: 'Order App' },
];

const SURFACE_DEVICES: Array<{ id: SurfaceDevice; label: string }> = [
  { id: 'desktop', label: 'Desktop' },
  { id: 'mobile', label: 'Mobile' },
];

/**
 * Customer Surface Builder — primary Content & Branding landing.
 * Tree: Website / Order App → Desktop / Mobile → surface slot cards.
 */
export function SurfaceBuilderLanding({
  surfaceCounts = {},
  dirtyGroups = new Set(),
  onSelectSurface,
  onSelectTask,
}: SurfaceBuilderLandingProps) {
  return (
    <div className="hub-task-landing hub-surface-landing" data-testid="surface-builder-landing">
      <p className="hub-task-landing-intro">
        Build what customers see on each surface — Website and Order App, desktop and mobile.
        Pick a surface to add or edit components.
      </p>

      <section className="hub-surface-tree" data-testid="surface-tree">
        {SURFACE_APPS.map((app) => (
          <div key={app.id} className="hub-surface-app" data-testid={`surface-app-${app.id}`}>
            <h2 className="hub-surface-app-label">{app.label}</h2>
            <div className="hub-surface-devices">
              {SURFACE_DEVICES.map((device) => {
                const slots = slotsFor(app.id, device.id);
                return (
                  <div
                    key={device.id}
                    className="hub-surface-device"
                    data-testid={`surface-device-${app.id}-${device.id}`}
                  >
                    <h3 className="hub-surface-device-label">{device.label}</h3>
                    <div className="hub-surface-slots">
                      {slots.map((slot) => {
                        const id = surfaceId(app.id, device.id, slot);
                        const count = surfaceCounts[id];
                        const surface: SurfaceRecord = {
                          id,
                          app: app.id,
                          device: device.id,
                          slot,
                          label: `${app.label} · ${device.label} · ${slotLabel(slot)}`,
                          description: '',
                        };
                        return (
                          <button
                            key={id}
                            type="button"
                            className="hub-task-card hub-surface-card"
                            data-testid={`surface-card-${id}`}
                            onClick={() => onSelectSurface(surface)}
                          >
                            <span className="hub-task-card-icon" aria-hidden>
                              <LayoutGrid size={18} />
                            </span>
                            <span className="hub-task-card-body">
                              <span className="hub-task-card-title">{slotLabel(slot)}</span>
                              <span className="hub-task-card-desc">
                                {appLabel(app.id)}
                                {' · '}
                                {deviceLabel(device.id)}
                              </span>
                              {count !== undefined ? (
                                <span className="hub-task-card-meta" data-testid={`surface-count-${id}`}>
                                  <span className="hub-placement-chip">
                                    {count}
                                    {' '}
                                    component
                                    {count === 1 ? '' : 's'}
                                  </span>
                                </span>
                              ) : null}
                            </span>
                            <ChevronRight size={18} className="hub-task-card-chevron" aria-hidden />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </section>

      <section className="hub-task-cluster" data-testid="task-cluster-brand_pages">
        <h2 className="hub-task-cluster-label">Brand &amp; pages</h2>
        <div className="hub-task-grid">
          {BRAND_PAGE_TASKS.map((task) => (
            <BrandPageCard
              key={task.id}
              task={task}
              dirty={Boolean(task.group && dirtyGroups.has(task.group))}
              onSelect={() => onSelectTask(task)}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

function BrandPageCard({
  task,
  dirty,
  onSelect,
}: {
  task: ContentTask;
  dirty: boolean;
  onSelect: () => void;
}) {
  const Icon = task.icon;
  return (
    <button
      type="button"
      className="hub-task-card"
      data-testid={`task-card-${task.id as ContentTaskId}`}
      onClick={onSelect}
    >
      <span className="hub-task-card-icon" aria-hidden>
        <Icon size={20} />
      </span>
      <span className="hub-task-card-body">
        <span className="hub-task-card-title">
          {task.title}
          {dirty ? (
            <span className="hub-section-dirty-dot" title="Unpublished edits" data-testid={`task-dirty-${task.id}`} />
          ) : null}
        </span>
        <span className="hub-task-card-desc">{task.description}</span>
        {(task.placements?.length || task.statusHint) ? (
          <span className="hub-task-card-meta" data-testid={`task-placements-${task.id}`}>
            {task.statusHint ? (
              <span className="hub-placement-chip hub-placement-chip--status">{task.statusHint}</span>
            ) : null}
            {(task.placements ?? []).map((p) => (
              <span key={p} className="hub-placement-chip">{p}</span>
            ))}
          </span>
        ) : null}
      </span>
      <ChevronRight size={18} className="hub-task-card-chevron" aria-hidden />
    </button>
  );
}
