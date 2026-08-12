import { ChevronRight } from 'lucide-react';
import { CONTENT_TASK_CLUSTERS, type ContentTask, type ContentTaskId } from './taskLandingConfig';
import { isWebsitePageGroup } from './websitePageTasks';

export type ContentTaskLandingProps = {
  /** Section names that currently have blocks (hide empty destinations). */
  availableGroups: Set<string>;
  /** Dirty section names for unpublished-edit dots. */
  dirtyGroups?: Set<string>;
  onSelectTask: (task: ContentTask) => void;
};

/** Always show these owner destinations even if the registry snapshot is empty. */
const ALWAYS_VISIBLE_GROUPS = new Set([
  'Homepage',
  'Hero',
  'Branding',
  'Announcements',
  'Footer',
  'Menu',
  'Status banners',
  'Order App',
  'SEO',
  'Legal',
  'About',
  'General',
]);

/**
 * Customer Surface Map landing — primary owner entry (mobile + desktop home).
 */
export function ContentTaskLanding({
  availableGroups,
  dirtyGroups = new Set(),
  onSelectTask,
}: ContentTaskLandingProps) {
  return (
    <div className="hub-task-landing" data-testid="content-task-landing">
      <p className="hub-task-landing-intro">
        Edit what customers see. Each card shows where content appears — Website, Order App phone, or desktop.
      </p>
      {CONTENT_TASK_CLUSTERS.map((cluster) => {
        const tasks = cluster.tasks.filter((task) => {
          if (task.group == null) return true;
          if (ALWAYS_VISIBLE_GROUPS.has(task.group) || isWebsitePageGroup(task.group)) {
            return true;
          }
          return availableGroups.has(task.group);
        });
        if (tasks.length === 0) return null;
        return (
          <section key={cluster.id} className="hub-task-cluster" data-testid={`task-cluster-${cluster.id}`}>
            <h2 className="hub-task-cluster-label">{cluster.label}</h2>
            <div className="hub-task-grid">
              {tasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  dirty={Boolean(task.group && dirtyGroups.has(task.group))}
                  onSelect={() => onSelectTask(task)}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function TaskCard({
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
