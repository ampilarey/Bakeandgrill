import type { OrderTimelineData } from '../api';

/*
 * Every recorded step of one ticket, with the minutes between (owner, 2026-11-07: "Will the
 * site record time for each ticket and can admin view that?" → "Both"). Phone first: one
 * column, the step on the left, its clock time and the gap on the right.
 */

/** "under a minute", "8 min", "1 h 5 min". */
export function minutesWord(m: number | null | undefined): string {
  if (m === null || m === undefined) return '';
  if (m < 1) return 'under a minute';
  const whole = Math.round(m);
  if (whole < 60) return `${whole} min`;
  const h = Math.floor(whole / 60);
  const rest = whole % 60;
  return rest === 0 ? `${h} h` : `${h} h ${rest} min`;
}

const clock = (iso: string) => new Date(iso).toLocaleTimeString('en-MV', { timeZone: 'Indian/Maldives', hour: 'numeric', minute: '2-digit' });

export function TicketTimeline({ timeline }: { timeline?: OrderTimelineData | null }) {
  if (!timeline || timeline.steps.length === 0) return null;
  const last = timeline.steps.length - 1;

  return (
    <section data-testid="ticket-timeline" style={{ background: 'var(--color-bg)', borderRadius: 10, padding: '14px 16px', marginBottom: 16 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 6, marginBottom: 10 }}>
        <strong style={{ fontSize: 14 }}>Ticket times</strong>
        <span data-testid="ticket-timeline-total" style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
          {timeline.total_minutes !== null
            ? `Took ${minutesWord(timeline.total_minutes)}`
            : timeline.open ? `Open ${minutesWord(timeline.steps[last].minutes_from_start) || 'just now'} so far` : ''}
        </span>
      </div>
      <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {timeline.steps.map((s, i) => (
          <li key={s.key} style={{ display: 'grid', gridTemplateColumns: '14px minmax(0, 1fr) auto', columnGap: 10, alignItems: 'start' }}>
            <span aria-hidden style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', alignSelf: 'stretch' }}>
              <span style={{ width: 10, height: 10, borderRadius: 999, marginTop: 4, background: i === last ? 'var(--color-primary)' : 'var(--color-border)' }} />
              {i < last && <span style={{ flex: 1, width: 2, background: 'var(--color-border-light)', minHeight: 18 }} />}
            </span>
            <span style={{ fontSize: 14, paddingBottom: i < last ? 12 : 0 }}>
              {s.label}
              {s.minutes_from_previous !== null && (
                <span style={{ display: 'block', fontSize: 12, color: 'var(--color-text-muted)' }}>+{minutesWord(s.minutes_from_previous)}</span>
              )}
            </span>
            <span style={{ fontSize: 13, color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>{clock(s.at)}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
