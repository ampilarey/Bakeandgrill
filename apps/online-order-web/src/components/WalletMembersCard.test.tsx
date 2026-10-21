import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { WalletMembersCard } from './WalletMembersCard';
import { addWalletMember, getWalletMembers, leaveSharedWallet, removeWalletMember } from '../api';

vi.mock('../context/LanguageContext', () => ({ useLanguage: () => ({ t: (key: string) => key, lang: 'en' }) }));
vi.mock('../api', () => ({ getWalletMembers: vi.fn(), addWalletMember: vi.fn(), removeWalletMember: vi.fn(), leaveSharedWallet: vi.fn() }));

/* The family wallet (phase 4, owner 2026-10-21). */
const sister = { id: 7, name: 'Mariyam Ibrahim', phone: '•••0322' };

describe('WalletMembersCard', () => {
  beforeEach(() => {
    vi.mocked(getWalletMembers).mockReset();
    vi.mocked(addWalletMember).mockReset();
    vi.mocked(removeWalletMember).mockReset();
    vi.mocked(leaveSharedWallet).mockReset();
  });

  it('shares the wallet by phone and takes someone off again', async () => {
    vi.mocked(getWalletMembers).mockResolvedValue({ members: [], max: 4, shares_wallet_of: null });
    vi.mocked(addWalletMember).mockResolvedValue({ members: [sister], max: 4, shares_wallet_of: null, message: 'Your wallet is now shared with Mariyam Ibrahim.' });
    vi.mocked(removeWalletMember).mockResolvedValue({ members: [], max: 4, shares_wallet_of: null });
    const onChanged = vi.fn();

    render(<WalletMembersCard onChanged={onChanged} />);
    const add = await screen.findByTestId('wallet-family-add');
    expect(add).toBeDisabled();
    fireEvent.change(screen.getByTestId('wallet-family-phone'), { target: { value: '7700322' } });
    expect(add).toBeEnabled();
    fireEvent.click(add);
    await waitFor(() => expect(addWalletMember).toHaveBeenCalledWith('7700322'));
    expect(await screen.findByTestId('wallet-family-list')).toHaveTextContent('Mariyam Ibrahim');
    expect(screen.getByTestId('wallet-family-notice')).toHaveTextContent('Your wallet is now shared with Mariyam Ibrahim.');
    expect(onChanged).toHaveBeenCalledTimes(1);
    expect((screen.getByTestId('wallet-family-phone') as HTMLInputElement).value).toBe('');

    fireEvent.click(screen.getByTestId('wallet-family-remove-7'));
    await waitFor(() => expect(removeWalletMember).toHaveBeenCalledWith(7));
    await waitFor(() => expect(screen.queryByTestId('wallet-family-list')).toBeNull());
  });

  it('says when the wallet is shared with as many as it can be, and shows the refusal', async () => {
    const four = [1, 2, 3, 4].map((id) => ({ id, name: `Member ${id}`, phone: `•••000${id}` }));
    vi.mocked(getWalletMembers).mockResolvedValue({ members: four, max: 4, shares_wallet_of: null });
    render(<WalletMembersCard />);
    expect(await screen.findByTestId('wallet-family-full')).toHaveTextContent('wallet.family_full');
    expect(screen.queryByTestId('wallet-family-add')).toBeNull();

    vi.mocked(getWalletMembers).mockResolvedValue({ members: [], max: 4, shares_wallet_of: null });
    vi.mocked(addWalletMember).mockRejectedValue(new Error('That number does not have a Bake & Grill account yet.'));
    render(<WalletMembersCard />);
    const adds = await screen.findAllByTestId('wallet-family-add');
    const phones = screen.getAllByTestId('wallet-family-phone');
    fireEvent.change(phones[phones.length - 1], { target: { value: '7700999' } });
    fireEvent.click(adds[adds.length - 1]);
    expect(await screen.findByTestId('wallet-family-error')).toHaveTextContent('That number does not have a Bake & Grill account yet.');
  });

  it('tells a member whose wallet they pay from and lets them leave', async () => {
    vi.mocked(getWalletMembers).mockResolvedValue({ members: [], max: 4, shares_wallet_of: { name: 'Aisha', balance_mvr: 70, active: true } });
    vi.mocked(leaveSharedWallet).mockResolvedValue({ members: [], max: 4, shares_wallet_of: null });
    render(<WalletMembersCard />);
    expect(await screen.findByTestId('wallet-family-member-hint')).toHaveTextContent('wallet.family_member_hint');
    expect(screen.queryByTestId('wallet-family-add')).toBeNull();
    fireEvent.click(screen.getByTestId('wallet-family-leave'));
    await waitFor(() => expect(leaveSharedWallet).toHaveBeenCalledTimes(1));
    expect(await screen.findByTestId('wallet-family-add')).toBeInTheDocument();
  });
});
