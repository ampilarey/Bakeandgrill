import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const fetchAiStatus = vi.fn();
const draftDhivehi = vi.fn();
vi.mock('../../api/ai', () => ({
  fetchAiStatus: (...a: unknown[]) => fetchAiStatus(...a),
  draftDhivehi: (...a: unknown[]) => draftDhivehi(...a),
}));

import { AiButton, DhivehiDraft } from './AiButton';
import { resetAi } from './useAi';

const status = (on: boolean) => ({ ready: true, enabled: true, features: { dhivehi: on, reply_drafts: on } });

describe('the assistant buttons', () => {
  beforeEach(() => { vi.clearAllMocks(); resetAi(); });

  it('shows nothing while its feature is switched off', async () => {
    fetchAiStatus.mockResolvedValue(status(false));
    render(<AiButton feature="reply_drafts" run={async () => {}} testId="b">Draft reply</AiButton>);
    await waitFor(() => expect(fetchAiStatus).toHaveBeenCalled());
    expect(screen.queryByTestId('b')).toBeNull();
  });

  it('runs the job and says what went wrong under the button', async () => {
    fetchAiStatus.mockResolvedValue(status(true));
    const run = vi.fn().mockRejectedValueOnce(new Error('The assistant is busy just now. Try again in a minute.')).mockResolvedValueOnce(undefined);
    render(<AiButton feature="reply_drafts" run={run} testId="b">Draft reply</AiButton>);
    fireEvent.click(await screen.findByTestId('b'));
    expect(await screen.findByRole('alert')).toHaveTextContent('busy just now');
    fireEvent.click(screen.getByTestId('b'));
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('Draft Dhivehi fills the box from the English and asks before replacing what is there', async () => {
    fetchAiStatus.mockResolvedValue(status(true));
    draftDhivehi.mockResolvedValue({ dv: 'ކުކުޅު މޯމޯ' });
    const onDraft = vi.fn();
    const { rerender } = render(<DhivehiDraft from="Chicken Momo" current="" kind="name" onDraft={onDraft} testId="d" />);
    fireEvent.click(await screen.findByTestId('d'));
    await waitFor(() => expect(onDraft).toHaveBeenCalledWith('ކުކުޅު މޯމޯ'));
    expect(draftDhivehi).toHaveBeenCalledWith('Chicken Momo', 'name');

    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    rerender(<DhivehiDraft from="Chicken Momo" current="މޯމޯ" kind="name" onDraft={onDraft} testId="d" />);
    fireEvent.click(screen.getByTestId('d'));
    await waitFor(() => expect(confirm).toHaveBeenCalled());
    expect(draftDhivehi).toHaveBeenCalledTimes(1);

    // Nothing to work from: the button is there but off.
    rerender(<DhivehiDraft from=" " current="" onDraft={onDraft} testId="d" />);
    expect(screen.getByTestId('d')).toBeDisabled();
  });
});
