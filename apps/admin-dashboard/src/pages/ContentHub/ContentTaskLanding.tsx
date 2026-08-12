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

/**
 * Task-based landing for Content & Branding — primary owner entry (mobile + desktop home).
 */
export function ContentTaskLanding({
  availableGroups,
  dirtyGroups = new Set(),
  onSelectTask,
}: ContentTaskLandingProps) {
  return (
    <div className="hub-task-landing" data-testid="content-task-landing">
      <p className="hub-task-landing-intro">
        Choose what you want to change. You do not need to know about scopes, JSON, or technical keys.
      </p>
      {CONTENT_TASK_CLUSTERS.map((cluster) => {
        const tasks = cluster.tasks.filter((task) => {
          if (task.group == null) return true;
          // Always show Homepage / Hero / Branding / Website pages even if registry empty.
          if (
            task.group === 'Homepage'
            || task.group === 'Hero'
            || task.group === 'Branding'
            || isWebsitePageGroup(task.group)
          ) {
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
      </span>
      <ChevronRight size={18} className="hub-task-card-chevron" aria-hidden />
    </button>
  );
}
