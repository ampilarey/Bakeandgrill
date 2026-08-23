import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import OrderBoardsCard from '../pages/OrderBoardsCard';
import * as operations from '../api/operations';

/**
 * The board key is shown exactly once — the server keeps only a hash. So the
 * reveal is the single moment it is readable, and the tests worth having are
 * about that moment and about revoking.
 */
describe('OrderBoardsCard', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(operations, 'fetchOrderBoards').mockResolvedValue({
      boards: [
        {
          id: 4,
          name: 'board-Kitchen',
          last_used_at: '2026-08-23T09:00:00Z',
          expires_at: '2027-08-23T09:00:00Z',
          created_at: '2026-08-23T08:00:00Z',
        },
        {
          id: 5,
          name: 'board-Cash register',
          last_used_at: null,
          expires_at: '2027-08-23T09:00:00Z',
          created_at: '2026-08-23T08:30:00Z',
        },
      ],
    });
  });

  it('lists each screen by where it is, not by its token name', async () => {
    // The server prefixes every board token with board-. Leaking that into
    // the table would make every row read "board-Kitchen".
    render(<OrderBoardsCard canManage />);

    expect(await screen.findByText('Kitchen')).toBeInTheDocument();
    expect(screen.getByText('Cash register')).toBeInTheDocument();
    expect(screen.queryByText(/board-Kitchen/)).not.toBeInTheDocument();
  });

  it('says which screens have never been paired', async () => {
    // A board that has never called in is usually a key somebody copied and
    // never pasted — worth spotting before an online order is missed.
    render(<OrderBoardsCard canManage />);

    expect(await screen.findByText('Never paired')).toBeInTheDocument();
  });

  it('shows the key once, with a warning that it will not come back', async () => {
    const create = vi.spyOn(operations, 'createOrderBoard').mockResolvedValue({
      id: 6,
      name: 'board-Counter',
      expires_at: '2027-08-23T09:00:00Z',
      token: '6|plaintextkeyshownonlyonce',
    });

    render(<OrderBoardsCard canManage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Issue a key' }));
    fireEvent.change(screen.getByPlaceholderText(/Kitchen/), { target: { value: 'Counter' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create board key' }));

    await waitFor(() => expect(screen.getByText('6|plaintextkeyshownonlyonce')).toBeInTheDocument());
    expect(screen.getByText(/not shown again/i)).toBeInTheDocument();
    expect(create).toHaveBeenCalledWith('Counter');
  });

  it('refuses to create a board with no name', async () => {
    const create = vi.spyOn(operations, 'createOrderBoard');

    render(<OrderBoardsCard canManage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Issue a key' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create board key' }));

    // Otherwise every row reads "board-" and revoking the right screen
    // becomes guesswork.
    expect(await screen.findByText(/Give the screen a name/)).toBeInTheDocument();
    expect(create).not.toHaveBeenCalled();
  });

  describe('pairing a screen', () => {
    it('leads with pairing rather than with issuing a key', async () => {
      // A television cannot have a 50-character key typed into it. If "Issue a
      // key" were the primary action, every TV setup would start down the one
      // path that cannot work on a TV.
      render(<OrderBoardsCard canManage />);

      const pair = await screen.findByRole('button', { name: 'Pair a screen' });
      const issue = screen.getByRole('button', { name: 'Issue a key' });
      expect(pair.compareDocumentPosition(issue) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('sends the code the screen is showing, with a name', async () => {
      const claim = vi.spyOn(operations, 'claimOrderBoard')
        .mockResolvedValue({ message: 'ok', id: 9, name: 'board-Kitchen' });

      render(<OrderBoardsCard canManage />);
      fireEvent.click(await screen.findByRole('button', { name: 'Pair a screen' }));
      fireEvent.change(screen.getByPlaceholderText('K7PM29'), { target: { value: 'K7PM29' } });
      fireEvent.change(screen.getByPlaceholderText(/Kitchen, Cash register/), { target: { value: 'Kitchen' } });
      fireEvent.click(screen.getByRole('button', { name: 'Pair this screen' }));

      await waitFor(() => expect(claim).toHaveBeenCalledWith('K7PM29', 'Kitchen'));
    });

    it('accepts the code however the phone mangled it', async () => {
      // Read off a television and typed on a phone, which lowercases by habit
      // and adds a space in the middle of a six-character run.
      const claim = vi.spyOn(operations, 'claimOrderBoard')
        .mockResolvedValue({ message: 'ok', id: 9, name: 'board-Kitchen' });

      render(<OrderBoardsCard canManage />);
      fireEvent.click(await screen.findByRole('button', { name: 'Pair a screen' }));
      fireEvent.change(screen.getByPlaceholderText('K7PM29'), { target: { value: ' k7p m29 ' } });
      fireEvent.change(screen.getByPlaceholderText(/Kitchen, Cash register/), { target: { value: 'Kitchen' } });
      fireEvent.click(screen.getByRole('button', { name: 'Pair this screen' }));

      await waitFor(() => expect(claim).toHaveBeenCalledWith('K7PM29', 'Kitchen'));
    });

    it('never displays a key on the pairing path', async () => {
      // The screen collects its own. A key rendered here would be a secret on
      // an owner's phone for no reason at all.
      vi.spyOn(operations, 'claimOrderBoard')
        .mockResolvedValue({ message: 'ok', id: 9, name: 'board-Kitchen' });

      render(<OrderBoardsCard canManage />);
      fireEvent.click(await screen.findByRole('button', { name: 'Pair a screen' }));
      fireEvent.change(screen.getByPlaceholderText('K7PM29'), { target: { value: 'K7PM29' } });
      fireEvent.change(screen.getByPlaceholderText(/Kitchen, Cash register/), { target: { value: 'Kitchen' } });
      fireEvent.click(screen.getByRole('button', { name: 'Pair this screen' }));

      expect(await screen.findByText(/Kitchen is paired/)).toBeInTheDocument();
      expect(screen.queryByText(/not shown again/i)).not.toBeInTheDocument();
      expect(document.body.textContent).not.toMatch(/\d+\|[A-Za-z0-9]{20,}/);
    });

    it('checks the code length before calling the server', async () => {
      const claim = vi.spyOn(operations, 'claimOrderBoard');

      render(<OrderBoardsCard canManage />);
      fireEvent.click(await screen.findByRole('button', { name: 'Pair a screen' }));
      fireEvent.change(screen.getByPlaceholderText('K7PM29'), { target: { value: 'K7P' } });
      fireEvent.change(screen.getByPlaceholderText(/Kitchen, Cash register/), { target: { value: 'Kitchen' } });
      fireEvent.click(screen.getByRole('button', { name: 'Pair this screen' }));

      // Matched narrowly: the card's own instructions also mention six
      // characters, so a loose pattern would pass without the error showing.
      expect(await screen.findByText(/on the screen is 6 characters/)).toBeInTheDocument();
      expect(claim).not.toHaveBeenCalled();
    });

    it('surfaces an expired or unknown code instead of failing quietly', async () => {
      // Codes die after 15 minutes. Somebody typing a stale one needs to be
      // told to look at the screen again, not left staring at a spinner.
      vi.spyOn(operations, 'claimOrderBoard')
        .mockRejectedValue(new Error('No screen is showing that code.'));

      render(<OrderBoardsCard canManage />);
      fireEvent.click(await screen.findByRole('button', { name: 'Pair a screen' }));
      fireEvent.change(screen.getByPlaceholderText('K7PM29'), { target: { value: 'ZZZZZZ' } });
      fireEvent.change(screen.getByPlaceholderText(/Kitchen, Cash register/), { target: { value: 'Kitchen' } });
      fireEvent.click(screen.getByRole('button', { name: 'Pair this screen' }));

      expect(await screen.findByText(/No screen is showing that code/)).toBeInTheDocument();
    });
  });

  it('warns that revoking blanks that screen, and drops the row', async () => {
    const revoke = vi.spyOn(operations, 'revokeOrderBoard').mockResolvedValue({ message: 'Board revoked.' });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(<OrderBoardsCard canManage />);
    await screen.findByText('Kitchen');
    fireEvent.click(screen.getAllByRole('button', { name: 'Revoke' })[0]);

    await waitFor(() => expect(revoke).toHaveBeenCalledWith(4));
    expect(confirm.mock.calls[0][0]).toMatch(/stops showing orders/);
    await waitFor(() => expect(screen.queryByText('Kitchen')).not.toBeInTheDocument());
    expect(screen.getByText('Cash register')).toBeInTheDocument();
  });

  it('leaves the screen alone when the confirmation is dismissed', async () => {
    const revoke = vi.spyOn(operations, 'revokeOrderBoard');
    vi.spyOn(window, 'confirm').mockReturnValue(false);

    render(<OrderBoardsCard canManage />);
    await screen.findByText('Kitchen');
    fireEvent.click(screen.getAllByRole('button', { name: 'Revoke' })[0]);

    expect(revoke).not.toHaveBeenCalled();
    expect(screen.getByText('Kitchen')).toBeInTheDocument();
  });

  it('hides every control from staff who cannot approve devices', async () => {
    render(<OrderBoardsCard canManage={false} />);

    await screen.findByText('Kitchen');
    expect(screen.queryByRole('button', { name: 'Pair a screen' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Issue a key' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Revoke' })).not.toBeInTheDocument();
  });
});
