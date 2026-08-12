import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { clusterSections, sectionMeta } from './hubLayoutConfig';

export type SectionRailItem = {
  name: string;
  count: number;
  dirty: boolean;
};

type Props = {
  sections: SectionRailItem[];
  active: string | null;
  onSelect: (name: string) => void;
  /** Desktop sticky rail vs mobile 2-column card grid. */
  variant: 'rail' | 'grid';
  /** Desktop only — icon strip (~56px). Ignored for grid. */
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
};

/**
 * Desktop: 240px sticky cluster rail (collapsible to ~56px icon strip).
 * Mobile: 2-column section cards (replaces horizontal chip strip).
 *
 * Buttons use aria-label={name} so accessible name = section name only
 * (count and dirty dot are aria-hidden to avoid polluting the name).
 */
export function SectionRail({
  sections,
  active,
  onSelect,
  variant,
  collapsed = false,
  onToggleCollapsed,
}: Props) {
  const names = sections.map((s) => s.name);
  const byName = new Map(sections.map((s) => [s.name, s]));
  const clusters = clusterSections(names);

  if (variant === 'grid') {
    return (
      <div data-testid="section-rail-grid" className="hub-section-grid">
        {clusters.map((cluster) => (
          <div key={cluster.cluster} className="hub-section-grid-cluster">
            <div className="hub-section-grid-cluster-label">{cluster.label}</div>
            <div className="hub-section-grid-cards">
              {cluster.sections.map((name) => {
                const item = byName.get(name)!;
                const meta = sectionMeta(name);
                const Icon = meta.icon;
                const pressed = active === name;
                return (
                  <button
                    key={name}
                    type="button"
                    aria-label={name}
                    aria-pressed={pressed}
                    data-testid={`section-card-${name}`}
                    className={`hub-section-card${pressed ? ' hub-section-card--active' : ''}`}
                    onClick={() => onSelect(name)}
                  >
                    <span className="hub-section-card-icon" aria-hidden="true">
                      <Icon size={18} />
                    </span>
                    <span className="hub-section-card-name" aria-hidden="true">{name}</span>
                    <span className="hub-section-card-meta" aria-hidden="true">
                      {item.count} block{item.count === 1 ? '' : 's'}
                      {item.dirty ? (
                        <span
                          className="hub-section-dirty-dot"
                          data-testid={`section-dirty-${name}`}
                          title="Unpublished edits"
                        />
                      ) : null}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <aside
      data-testid="section-rail"
      data-collapsed={collapsed ? 'true' : 'false'}
      className={`hub-section-rail${collapsed ? ' hub-section-rail--collapsed' : ''}`}
    >
      <div className="hub-section-rail-header">
        {!collapsed ? <div className="hub-section-rail-title">Browse</div> : <span />}
        {onToggleCollapsed ? (
          <button
            type="button"
            data-testid="rail-collapse-btn"
            className="hub-section-rail-collapse"
            aria-label={collapsed ? 'Expand sections' : 'Collapse sections'}
            title={collapsed ? 'Expand sections' : 'Collapse sections'}
            aria-pressed={collapsed}
            onClick={onToggleCollapsed}
          >
            {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          </button>
        ) : null}
      </div>
      <button
        type="button"
        data-testid="section-rail-tasks-home"
        className={`hub-section-rail-row${!active ? ' hub-section-rail-row--active' : ''}`}
        aria-label="All tasks"
        aria-pressed={!active}
        onClick={() => onSelect('')}
        style={{ marginBottom: 6 }}
      >
        {!collapsed ? (
          <span className="hub-section-rail-row-name" aria-hidden="true">All tasks</span>
        ) : (
          <span className="hub-section-rail-row-name" aria-hidden="true">∗</span>
        )}
      </button>
      {clusters.map((cluster) => (
        <div key={cluster.cluster} className="hub-section-rail-cluster">
          {!collapsed ? (
            <div className="hub-section-rail-cluster-label">{cluster.label}</div>
          ) : null}
          {cluster.sections.map((name) => {
            const item = byName.get(name)!;
            const meta = sectionMeta(name);
            const Icon = meta.icon;
            const pressed = active === name;
            return (
              <button
                key={name}
                type="button"
                aria-label={name}
                title={name}
                aria-pressed={pressed}
                data-testid={`section-rail-${name}`}
                className={`hub-section-rail-row${pressed ? ' hub-section-rail-row--active' : ''}`}
                onClick={() => onSelect(name)}
              >
                <Icon size={15} className="hub-section-rail-row-icon" aria-hidden="true" />
                {!collapsed ? (
                  <span className="hub-section-rail-row-name" aria-hidden="true">{name}</span>
                ) : null}
                {!collapsed ? (
                  <span className="hub-section-rail-row-count" aria-hidden="true">{item.count}</span>
                ) : null}
                {item.dirty ? (
                  <span
                    className="hub-section-dirty-dot"
                    data-testid={`section-dirty-${name}`}
                    title="Unpublished edits"
                    aria-hidden="true"
                  />
                ) : null}
              </button>
            );
          })}
        </div>
      ))}
    </aside>
  );
}
