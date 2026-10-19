import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ClockMachinePanel from '../pages/ClockMachinePanel';
import * as api from '../api';

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    getClockMachine: vi.fn(),
    updateClockDevice: vi.fn().mockResolvedValue({ ok: true }),
    setClockUserNo: vi.fn().mockResolvedValue({ ok: true, clock_user_no: '12' }),
    removeClockDevice: vi.fn().mockResolvedValue({ ok: true }),
  };
});

const state = {
  devices: [{ id: 3, serial: 'CM3M214160023', name: null, allowed: false, allowed_at: null, last_seen_at: '2026-10-19T08:00:00+05:00', punches_today: 0, enrolled: 2 }],
  staff: [{ id: 7, name: 'Mariyam', clock_user_no: null, name_on_clock: null }],
  unmatched: [{ no: '12', punches: 3, last_at: '2026-10-19T09:00:00+05:00', name: 'Mariyam' }],
  recent: [],
  push_url: 'http://bakeandgrill.mv',
};

describe('ClockMachinePanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getClockMachine).mockResolvedValue(state);
  });

  it('shows a waiting clock, the setup address, and lets the owner allow it', async () => {
    render(<ClockMachinePanel canEdit />);
    expect(await screen.findByText('Waiting')).toBeTruthy();
    expect(screen.getByText(/Serial CM3M214160023/)).toBeTruthy();
    expect(screen.getAllByText('bakeandgrill.mv').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('switch', { name: 'Allow this clock' }));
    await waitFor(() => expect(api.updateClockDevice).toHaveBeenCalledWith(3, { allowed: true }));
  });

  it('gives a number nobody has to a staff member', async () => {
    render(<ClockMachinePanel canEdit />);
    const pick = await screen.findByLabelText('Give number 12 to');
    expect(screen.getByText(/Mariyam on the clock/)).toBeTruthy();
    fireEvent.change(pick, { target: { value: '7' } });
    await waitFor(() => expect(api.setClockUserNo).toHaveBeenCalledWith(7, '12'));
  });

  it('is read-only without staff.update', async () => {
    render(<ClockMachinePanel canEdit={false} />);
    await screen.findByText('Waiting');
    expect((screen.getByRole('switch') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByLabelText('Give number 12 to')).toBeNull();
  });
});
