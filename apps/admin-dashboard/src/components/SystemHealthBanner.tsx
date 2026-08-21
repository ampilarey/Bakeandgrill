import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { getSystemHealth, type SystemHealth, type SystemHealthComponent } from '../api';

/**
 * Says out loud when a background part of the system has stopped.
 *
 * On 2026-08-21 the scheduler and the queue worker were both found dead on
 * production, and had been for an unknown length of time. Nothing was broken
 * in a way anyone could see: the site served pages, the admin panel worked,
 * and the failure surfaced only because someone happened to be reading cron
 * logs for an unrelated reason.
 *
 * The health checks already existed and already reported it. The problem was
 * presentation — `checkScheduler()` fed a grey tile on the Dashboard that
 * looked exactly like "Environment: production" next to it, on a page nobody
 * opens daily. This puts it on every page, in a colour that means something.
 *
 * Deliberately not dismissible. These five conditions are all "money or data
 * is quietly not happening", and a banner you can wave away is a banner that
 * gets waved away.
 *
 * Polls directly rather than through react-query: this mounts inside AppShell,
 * which is rendered in tests without a QueryClientProvider, and a banner has
 * no business dictating what infrastructure its host must provide.
 */

const POLL_MS = 120_000;

/** What each broken component actually means for the business. */
const CONSEQUENCE: Record<string, string> = {
  scheduler:
    'Scheduled tasks have stopped. Loyalty expiry, stale-order cancellation, '
    + 'reorder alerts and scheduled SMS are not running.',
  queue:
    'The background job worker has stopped. Loyalty points, inventory sync, '
    + 'outgoing webhooks and campaign SMS are queuing up unprocessed.',
  database: 'The database is not reachable.',
  redis: 'Redis is not reachable. Sessions, cache and the job queue depend on it.',
  storage: 'Public file storage is not writable. Image and font uploads will fail.',
};

type Probe = { key: string; probe: SystemHealthComponent };

/** The components reporting trouble, in the order they appear above. */
export function brokenComponents(health: SystemHealth | null): Probe[] {
  if (!health) return [];

  const candidates: Array<[string, unknown]> = [
    ['scheduler', health.scheduler],
    ['queue', health.queue],
    ['database', health.database],
    ['redis', health.redis],
    ['storage', health.storage],
  ];

  return candidates.flatMap(([key, value]) => {
    // `database` can still be a bare string on older payloads — a string
    // carries no ok flag, so treat it as healthy rather than crying wolf.
    if (!value || typeof value !== 'object' || !('ok' in value)) return [];
    const probe = value as SystemHealthComponent;
    return probe.ok ? [] : [{ key, probe }];
  });
}

/** "2 hours ago" — vague is fine, the point is that it is not "just now". */
export function sinceLabel(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;

  const minutes = Math.floor((Date.now() - then) / 60000);
  if (minutes < 1) return 'less than a minute ago';
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;

  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

export function SystemHealthBanner() {
  const [health, setHealth] = useState<SystemHealth | null>(null);

  useEffect(() => {
    let cancelled = false;

    const read = async () => {
      try {
        const next = await getSystemHealth();
        if (!cancelled) setHealth(next);
      } catch {
        // Staff without permission to read health, and a momentary blip, are
        // both reasons to stay quiet — neither is a reason to put a red bar
        // across everyone's screen.
        if (!cancelled) setHealth(null);
      }
    };

    void read();
    const timer = setInterval(() => void read(), POLL_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  const broken = brokenComponents(health);
  if (broken.length === 0) return null;

  return (
    <div
      role="alert"
      data-testid="system-health-banner"
      style={{
        background: 'var(--color-danger-bg)',
        borderBottom: '1px solid var(--color-danger)',
        color: 'var(--color-danger-strong)',
        padding: '10px 16px',
        display: 'flex',
        gap: 10,
        alignItems: 'flex-start',
        fontSize: 13,
        lineHeight: 1.5,
      }}
    >
      <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: 1 }} aria-hidden />
      <div>
        {broken.map(({ key, probe }) => {
          const since = sinceLabel(probe.last_run_at);
          return (
            <p key={key} style={{ margin: 0 }}>
              <strong style={{ textTransform: 'capitalize' }}>{key} stopped.</strong>{' '}
              {CONSEQUENCE[key] ?? 'This component is not healthy.'}
              {since ? ` Last seen ${since}.` : ''}
            </p>
          );
        })}
        <p style={{ margin: '4px 0 0', opacity: 0.85 }}>
          This does not fix itself — someone needs to look at the server.
        </p>
      </div>
    </div>
  );
}

export default SystemHealthBanner;
