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
    fireEvent.click(await screen.findByText('+ Add a board'));
    fireEvent.change(screen.getByPlaceholderText(/Kitchen/), { target: { value: 'Counter' } });
    fireEvent.click(screen.getByText('Create board key'));

    await waitFor(() => expect(screen.getByText('6|plaintextkeyshownonlyonce')).toBeInTheDocument());
    expect(screen.getByText(/not shown again/i)).toBeInTheDocument();
    expect(create).toHaveBeenCalledWith('Counter');
  });

  it('refuses to create a board with no name', async () => {
    const create = vi.spyOn(operations, 'createOrderBoard');

    render(<OrderBoardsCard canManage />);
    fireEvent.click(await screen.findByText('+ Add a board'));
    fireEvent.click(screen.getByText('Create board key'));

    // Otherwise every row reads "board-" and revoking the right screen
    // becomes guesswork.
    expect(await screen.findByText(/Give the screen a name/)).toBeInTheDocument();
    expect(create).not.toHaveBeenCalled();
  });

  it('warns that revoking blanks that screen, and drops the row', async () => {
    const revoke = vi.spyOn(operations, 'revokeOrderBoard').mockResolvedValue({ message: 'Board revoked.' });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(<OrderBoardsCard canManage />);
    await screen.findByText('Kitchen');
    fireEvent.click(screen.getAllByText('Revoke')[0]);

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
    fireEvent.click(screen.getAllByText('Revoke')[0]);

    expect(revoke).not.toHaveBeenCalled();
    expect(screen.getByText('Kitchen')).toBeInTheDocument();
  });

  it('hides every control from staff who cannot approve devices', async () => {
    render(<OrderBoardsCard canManage={false} />);

    await screen.findByText('Kitchen');
    expect(screen.queryByText('+ Add a board')).not.toBeInTheDocument();
    expect(screen.queryByText('Revoke')).not.toBeInTheDocument();
  });
});
