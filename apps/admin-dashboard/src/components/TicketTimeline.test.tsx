import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TicketTimeline, minutesWord } from './TicketTimeline';

/* Owner, 2026-11-07: "Will the site record time for each ticket and can admin view that?" */
describe('TicketTimeline', () => {
  it('words minutes the way a person says them', () => {
    expect(minutesWord(0.4)).toBe('under a minute');
    expect(minutesWord(8.2)).toBe('8 min');
    expect(minutesWord(60)).toBe('1 h');
    expect(minutesWord(65)).toBe('1 h 5 min');
  });

  it('lists each step with the gap since the one before and the whole time', () => {
    render(<TicketTimeline timeline={{
      open: false, total_minutes: 21,
      steps: [
        { key: 'start', label: 'Rung up', at: '2026-11-07T12:00:00+05:00', minutes_from_previous: null, minutes_from_start: 0 },
        { key: 'fired', label: 'Sent to kitchen', at: '2026-11-07T12:02:00+05:00', minutes_from_previous: 2, minutes_from_start: 2 },
        { key: 'ready', label: 'Ready', at: '2026-11-07T12:12:00+05:00', minutes_from_previous: 10, minutes_from_start: 12 },
        { key: 'completed', label: 'Completed', at: '2026-11-07T12:21:00+05:00', minutes_from_previous: 9, minutes_from_start: 21 },
      ],
    }} />);
    const box = screen.getByTestId('ticket-timeline');
    expect(within(box).getByTestId('ticket-timeline-total')).toHaveTextContent('Took 21 min');
    expect(box).toHaveTextContent(/Sent to kitchen\s*\+2 min/);
    expect(box).toHaveTextContent(/Ready\s*\+10 min/);
    expect(box).toHaveTextContent(/12:21/);
  });

  it('says how long an open ticket has been open, and draws nothing without a timeline', () => {
    const { rerender } = render(<TicketTimeline timeline={{
      open: true, total_minutes: null,
      steps: [
        { key: 'start', label: 'Rung up', at: '2026-11-07T12:00:00+05:00', minutes_from_previous: null, minutes_from_start: 0 },
        { key: 'fired', label: 'Sent to kitchen', at: '2026-11-07T12:25:00+05:00', minutes_from_previous: 25, minutes_from_start: 25 },
      ],
    }} />);
    expect(screen.getByTestId('ticket-timeline-total')).toHaveTextContent('Open 25 min so far');
    rerender(<TicketTimeline timeline={undefined} />);
    expect(screen.queryByTestId('ticket-timeline')).toBeNull();
  });
});
