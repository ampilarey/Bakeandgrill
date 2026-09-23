import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as api from '../api';
import { NoticesPanel } from '../pages/signage/NoticesPanel';

vi.mock('../components/ui', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}));

/*
 * Owner's shortlist, 2026-09-23: post a notice from the phone, see it
 * listed, take it down; set how long a sold-out dish keeps its row.
 */

const posted: api.SignageNotice = {
  id: 'n-abc', text: 'Kitchen closes in 20 minutes', text_dv: '', look: 'warning', show: 'both', seconds: 8,
  created_at: '2026-09-23T10:00:00Z', expires_at: new Date(Date.now() + 20 * 60_000).toISOString(),
};

afterEach(() => vi.restoreAllMocks());

describe('NoticesPanel', () => {
  it('posts a notice with its look, placement and duration', async () => {
    const post = vi.spyOn(api, 'postSignageNotice').mockResolvedValue({ data: posted, notices: [posted] });
    const onNotices = vi.fn();
    render(<NoticesPanel notices={[]} settings={{ sold_out_badge_minutes: 20 }} onNotices={onNotices} onSettings={vi.fn()} />);

    fireEvent.change(screen.getByTestId('signage-notice-text'), { target: { value: '  Kitchen closes in 20 minutes ' } });
    fireEvent.click(screen.getByTestId('signage-notice-look-warning'));
    fireEvent.change(screen.getByTestId('signage-notice-show'), { target: { value: 'ticker' } });
    fireEvent.change(screen.getByTestId('signage-notice-minutes'), { target: { value: '15' } });
    fireEvent.click(screen.getByTestId('signage-notice-post'));

    await waitFor(() => expect(post).toHaveBeenCalledWith({ text: 'Kitchen closes in 20 minutes', text_dv: undefined, look: 'warning', show: 'ticker', minutes: 15 }));
    expect(onNotices).toHaveBeenCalledWith([posted]);
    expect((screen.getByTestId('signage-notice-text') as HTMLInputElement).value).toBe('');
  });

  it('"until removed" sends no minutes, and an empty notice is not posted', async () => {
    const post = vi.spyOn(api, 'postSignageNotice').mockResolvedValue({ data: posted, notices: [posted] });
    render(<NoticesPanel notices={[]} settings={undefined} onNotices={vi.fn()} onSettings={vi.fn()} />);

    fireEvent.click(screen.getByTestId('signage-notice-post'));
    expect(post).not.toHaveBeenCalled();

    fireEvent.change(screen.getByTestId('signage-notice-text'), { target: { value: 'Open late tonight' } });
    fireEvent.change(screen.getByTestId('signage-notice-minutes'), { target: { value: '0' } });
    fireEvent.click(screen.getByTestId('signage-notice-post'));
    await waitFor(() => expect(post).toHaveBeenCalledWith(expect.objectContaining({ text: 'Open late tonight', minutes: undefined })));
  });

  it('lists what is on the board and takes one down', async () => {
    const del = vi.spyOn(api, 'deleteSignageNotice').mockResolvedValue({ ok: true, notices: [] });
    const onNotices = vi.fn();
    render(<NoticesPanel notices={[posted]} settings={undefined} onNotices={onNotices} onSettings={vi.fn()} />);

    expect(screen.getByTestId('signage-notice-n-abc')).toHaveTextContent(/Kitchen closes in 20 minutes/);
    expect(screen.getByTestId('signage-notice-n-abc')).toHaveTextContent(/min left/);
    fireEvent.click(screen.getByTestId('signage-notice-remove-n-abc'));
    await waitFor(() => expect(del).toHaveBeenCalledWith('n-abc'));
    expect(onNotices).toHaveBeenCalledWith([]);
  });

  it('saves the sold-out grace', async () => {
    const save = vi.spyOn(api, 'setSignageBoardSettings').mockResolvedValue({ settings: { sold_out_badge_minutes: 45 } });
    const onSettings = vi.fn();
    render(<NoticesPanel notices={[]} settings={{ sold_out_badge_minutes: 20 }} onNotices={vi.fn()} onSettings={onSettings} />);

    expect((screen.getByTestId('signage-sold-out-minutes') as HTMLInputElement).value).toBe('20');
    fireEvent.change(screen.getByTestId('signage-sold-out-minutes'), { target: { value: '45' } });
    fireEvent.click(screen.getByTestId('signage-sold-out-save'));
    await waitFor(() => expect(save).toHaveBeenCalledWith({ sold_out_badge_minutes: 45 }));
    expect(onSettings).toHaveBeenCalledWith({ sold_out_badge_minutes: 45 });
  });
});
