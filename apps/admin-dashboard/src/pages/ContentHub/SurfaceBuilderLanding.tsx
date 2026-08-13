import { useState } from 'react';
import { ChevronRight, Home, Image, LayoutGrid } from 'lucide-react';
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
import { ContentIntegrityPanel } from './ContentIntegrityPanel';
import {
  landingHeroTask,
  landingTasksInBand,
  type ContentTask,
  type ContentTaskId,
} from './taskLandingConfig';

export type LandingPageRow = {
  name: string;
  dirty: boolean;
  count?: number;
};

export type SurfaceBuilderLandingProps = {
  /** When set, only show this app's surfaces and relevant brand/page tasks. */
  appFilter?: SurfaceApp;
  /** Preferred device for Home primary CTA and default surface tab. */
  preferredDevice?: SurfaceDevice;
  /**
   * Desktop admin workspace layout (multi-column panels).
   * Mobile keeps the stacked Stage 7 list — do not enable below 768.
   */
  desktopLayout?: boolean;
  /** Stage 4 page rows (excludes Home / Everywhere). */
  pageRows?: LandingPageRow[];
  onSelectPage?: (sectionName: string) => void;
  /** Optional count labels keyed by surface id (e.g. "2 components" or "2 components · 1 hidden"). */
  surfaceCounts?: Record<string, number | string>;
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
 * Content Hub landing — Stage 7 hybrid IA.
 * Mobile: stacked Start here → Pages → Layout → Site-wide.
 * Desktop (`desktopLayout`): workspace with hero spotlight + side-by-side panels.
 */
export function SurfaceBuilderLanding({
  appFilter,
  preferredDevice = 'mobile',
  desktopLayout = false,
  pageRows = [],
  onSelectPage,
  surfaceCounts = {},
  dirtyGroups = new Set(),
  onSelectSurface,
  onSelectTask,
}: SurfaceBuilderLandingProps) {
  const apps = appFilter
    ? SURFACE_APPS.filter((a) => a.id === appFilter)
    : SURFACE_APPS;
  const primaryApp: SurfaceApp = appFilter ?? 'website';
  const [deviceTab, setDeviceTab] = useState<SurfaceDevice>(preferredDevice);

  const heroTask = landingHeroTask();
  const pageTasks = appFilter
    ? landingTasksInBand('page', primaryApp)
    : dedupeTasks([
      ...landingTasksInBand('page', 'website'),
      ...landingTasksInBand('page', 'order_app'),
    ]);
  const sitewideTasks = appFilter
    ? landingTasksInBand('sitewide', primaryApp)
    : dedupeTasks([
      ...landingTasksInBand('sitewide', 'website'),
      ...landingTasksInBand('sitewide', 'order_app'),
    ]);
  const toolTasks = landingTasksInBand('tools', primaryApp);

  const appTitle = appFilter === 'order_app'
    ? 'Order App'
    : appFilter === 'website'
      ? 'Website'
      : 'Content';

  const intro = appFilter === 'order_app'
    ? 'Edit what customers see in the Order App. Start with the hero, then pages and layout.'
    : appFilter === 'website'
      ? 'Edit what customers see on the Website. Start with the hero, then pages and layout.'
      : 'Edit Website and Order App content. Start with the hero, then pages and layout.';

  const homeSurfaceId = surfaceId(primaryApp, preferredDevice, 'home');
  const homeCount = surfaceCounts[homeSurfaceId];
  const homeCountText = typeof homeCount === 'number'
    ? `${homeCount} component${homeCount === 1 ? '' : 's'}`
    : homeCount;

  const openHome = () => {
    const surface: SurfaceRecord = {
      id: homeSurfaceId,
      app: primaryApp,
      device: preferredDevice,
      slot: 'home',
      label: `${appLabel(primaryApp)} · ${deviceLabel(preferredDevice)} · Home`,
      description: '',
    };
    onSelectSurface(surface);
  };

  const showTaskPages = pageRows.length === 0;

  const pagesBody = (
    <div className="hub-landing-list" data-testid="hub-landing-page-list">
      {pageRows.length > 0
        ? pageRows.map((row) => (
          <button
            key={row.name}
            type="button"
            className="hub-landing-row"
            data-testid={`hub-landing-page-${row.name.replace(/\s+/g, '-').toLowerCase()}`}
            onClick={() => onSelectPage?.(row.name)}
          >
            <span className="hub-landing-row-title">
              {row.name}
              {row.dirty ? (
                <span className="hub-section-dirty-dot" title="Unpublished edits" />
              ) : null}
            </span>
            <span className="hub-landing-row-meta">
              {typeof row.count === 'number' ? `${row.count} fields` : null}
            </span>
            <ChevronRight size={16} className="hub-task-card-chevron" aria-hidden />
          </button>
        ))
        : null}
      {showTaskPages
        ? pageTasks.map((task) => (
          <BrandPageCard
            key={task.id}
            task={task}
            dirty={Boolean(task.group && dirtyGroups.has(task.group))}
            onSelect={() => onSelectTask(task)}
            row
          />
        ))
        : null}
    </div>
  );

  const surfacesBody = (
    <>
      <div className="hub-landing-surfaces-head">
        <h2 className="hub-task-cluster-label">Layout by device</h2>
        <div className="hub-landing-device-tabs" role="tablist" aria-label="Device">
          {SURFACE_DEVICES.map((device) => (
            <button
              key={device.id}
              type="button"
              role="tab"
              aria-selected={deviceTab === device.id}
              className={`hub-landing-device-tab${deviceTab === device.id ? ' hub-landing-device-tab--active' : ''}`}
              data-testid={`hub-landing-device-tab-${device.id}`}
              onClick={() => setDeviceTab(device.id)}
            >
              {device.label}
            </button>
          ))}
        </div>
      </div>

      {apps.map((app) => {
        const slots = slotsFor(app.id, deviceTab);
        return (
          <div key={app.id} className="hub-surface-app" data-testid={`surface-app-${app.id}`}>
            {!appFilter ? (
              <h3 className="hub-surface-app-label">{app.label}</h3>
            ) : null}
            <div
              className="hub-surface-device"
              data-testid={`surface-device-${app.id}-${deviceTab}`}
            >
              {SURFACE_DEVICES.filter((d) => d.id !== deviceTab).map((d) => (
                <span
                  key={d.id}
                  data-testid={`surface-device-${app.id}-${d.id}`}
                  hidden
                  aria-hidden
                />
              ))}
              <div className="hub-surface-devices hub-landing-slot-list">
                <div className="hub-landing-slot-list hub-surface-slots">
                  {slots.map((slot) => {
                    const id = surfaceId(app.id, deviceTab, slot);
                    const count = surfaceCounts[id];
                    const countText = typeof count === 'number'
                      ? `${count} component${count === 1 ? '' : 's'}`
                      : count;
                    const surface: SurfaceRecord = {
                      id,
                      app: app.id,
                      device: deviceTab,
                      slot,
                      label: `${app.label} · ${deviceLabel(deviceTab)} · ${slotLabel(slot)}`,
                      description: '',
                    };
                    return (
                      <button
                        key={id}
                        type="button"
                        className="hub-landing-row hub-surface-card"
                        data-testid={`surface-card-${id}`}
                        onClick={() => onSelectSurface(surface)}
                      >
                        <span className="hub-landing-row-icon" aria-hidden>
                          <LayoutGrid size={16} />
                        </span>
                        <span className="hub-landing-row-title">{slotLabel(slot)}</span>
                        <span className="hub-landing-row-meta" data-testid={`surface-count-${id}`}>
                          {countText !== undefined ? countText : `${appLabel(app.id)} · ${deviceLabel(deviceTab)}`}
                        </span>
                        <ChevronRight size={16} className="hub-task-card-chevron" aria-hidden />
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </>
  );

  return (
    <div
      className={`hub-task-landing hub-surface-landing hub-landing-v7${desktopLayout ? ' hub-landing-v7--desktop' : ''}`}
      data-testid="surface-builder-landing"
      data-layout={desktopLayout ? 'desktop' : 'mobile'}
    >
      <header className="hub-landing-desk-header">
        {desktopLayout ? (
          <div className="hub-landing-desk-masthead">
            <h2 className="hub-landing-desk-title">{appTitle} content</h2>
            <p className="hub-task-landing-intro">{intro}</p>
          </div>
        ) : (
          <p className="hub-task-landing-intro">{intro}</p>
        )}
      </header>

      {/* 1. Primary — Hero + Home */}
      <section className="hub-landing-primary" data-testid="hub-landing-primary">
        {!desktopLayout ? (
          <h2 className="hub-task-cluster-label">Start here</h2>
        ) : (
          <h2 className="hub-task-cluster-label">Start here</h2>
        )}
        <div className="hub-landing-primary-actions">
          <button
            type="button"
            className="hub-landing-primary-btn hub-landing-primary-btn--hero"
            data-testid="task-card-hero"
            onClick={() => onSelectTask(heroTask)}
          >
            <span className="hub-landing-primary-icon" aria-hidden>
              <Image size={22} />
            </span>
            <span className="hub-landing-primary-body">
              <span className="hub-landing-primary-kicker">Most common</span>
              <span className="hub-landing-primary-title">
                Edit hero
                {dirtyGroups.has('Home') ? (
                  <span className="hub-section-dirty-dot" title="Unpublished edits" data-testid="task-dirty-hero" />
                ) : null}
              </span>
              <span className="hub-landing-primary-desc">
                Slideshow photos and titles
              </span>
            </span>
            <ChevronRight size={20} className="hub-task-card-chevron" aria-hidden />
          </button>

          <button
            type="button"
            className="hub-landing-primary-btn"
            data-testid="hub-landing-home-cta"
            onClick={openHome}
          >
            <span className="hub-landing-primary-icon" aria-hidden>
              <Home size={22} />
            </span>
            <span className="hub-landing-primary-body">
              <span className="hub-landing-primary-kicker">Home layout</span>
              <span className="hub-landing-primary-title">
                Edit Home
                {dirtyGroups.has('Home') ? (
                  <span className="hub-section-dirty-dot" title="Unpublished edits" data-testid="hub-landing-home-dirty" />
                ) : null}
              </span>
              <span className="hub-landing-primary-desc">
                {appLabel(primaryApp)}
                {' · '}
                {deviceLabel(preferredDevice)}
                {homeCountText ? ` · ${homeCountText}` : ''}
              </span>
            </span>
            <ChevronRight size={20} className="hub-task-card-chevron" aria-hidden />
          </button>
        </div>
      </section>

      {/* 2+3. Pages + Layout — stacked on mobile, side-by-side on desktop */}
      <div className="hub-landing-desk-split" data-testid="hub-landing-desk-split">
        <section className="hub-task-cluster hub-landing-pages hub-landing-panel" data-testid="hub-landing-pages">
          <h2 className="hub-task-cluster-label">Pages</h2>
          {pagesBody}
        </section>

        <section className="hub-landing-surfaces hub-landing-panel" data-testid="surface-tree">
          {surfacesBody}
        </section>
      </div>

      <ContentIntegrityPanel appFilter={appFilter} />

      {/* 4. Site-wide + tools */}
      <section className="hub-task-cluster hub-landing-panel hub-landing-panel--sitewide" data-testid="task-cluster-brand_pages">
        <h2 className="hub-task-cluster-label">Site-wide</h2>
        <div className={`hub-landing-list hub-landing-sitewide-grid${desktopLayout ? '' : ' hub-task-grid'}`}>
          {sitewideTasks.map((task) => (
            <BrandPageCard
              key={task.id}
              task={task}
              dirty={Boolean(task.group && dirtyGroups.has(task.group))}
              onSelect={() => onSelectTask(task)}
              row={desktopLayout}
            />
          ))}
        </div>
      </section>

      {toolTasks.length > 0 ? (
        <section className="hub-task-cluster hub-landing-panel hub-landing-panel--tools" data-testid="hub-landing-tools">
          <h2 className="hub-task-cluster-label">Tools</h2>
          <div className="hub-landing-list hub-landing-tools-row">
            {toolTasks.map((task) => (
              <BrandPageCard
                key={task.id}
                task={task}
                dirty={false}
                onSelect={() => onSelectTask(task)}
                row
              />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function dedupeTasks(tasks: ContentTask[]): ContentTask[] {
  const seen = new Set<ContentTaskId>();
  const out: ContentTask[] = [];
  for (const t of tasks) {
    if (seen.has(t.id)) continue;
    seen.add(t.id);
    out.push(t);
  }
  return out;
}

function BrandPageCard({
  task,
  dirty,
  onSelect,
  row = false,
}: {
  task: ContentTask;
  dirty: boolean;
  onSelect: () => void;
  row?: boolean;
}) {
  const Icon = task.icon;
  return (
    <button
      type="button"
      className={row ? 'hub-landing-row' : 'hub-task-card'}
      data-testid={`task-card-${task.id as ContentTaskId}`}
      onClick={onSelect}
    >
      <span className={row ? 'hub-landing-row-icon' : 'hub-task-card-icon'} aria-hidden>
        <Icon size={row ? 16 : 20} />
      </span>
      {row ? (
        <>
          <span className="hub-landing-row-title">
            {task.title}
            {dirty ? (
              <span className="hub-section-dirty-dot" title="Unpublished edits" data-testid={`task-dirty-${task.id}`} />
            ) : null}
          </span>
          <span className="hub-landing-row-meta">{task.description}</span>
          <ChevronRight size={16} className="hub-task-card-chevron" aria-hidden />
        </>
      ) : (
        <>
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
        </>
      )}
    </button>
  );
}
