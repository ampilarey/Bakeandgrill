import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AddGiftCardToWallet } from './AddGiftCardToWallet';
import { addGiftCardToWallet } from '../api';

vi.mock('../context/LanguageContext', () => ({ useLanguage: () => ({ t: (key: string) => key, lang: 'en' }) }));
vi.mock('../api', () => ({ addGiftCardToWallet: vi.fn() }));

/* Feature 12: a gift card's balance into the wallet. */
describe('AddGiftCardToWallet', () => {
  it('adds the card and refreshes the wallet', async () => {
    vi.mocked(addGiftCardToWallet).mockResolvedValue({ added_laar: 15000, balance_laar: 15000, message: 'ok' });
    const onAdded = vi.fn();
    render(<AddGiftCardToWallet onAdded={onAdded} />);
    fireEvent.change(screen.getByTestId('wallet-gift-code'), { target: { value: 'abcd-efgh-jklm' } });
    fireEvent.click(screen.getByTestId('wallet-gift-add'));
    await waitFor(() => expect(addGiftCardToWallet).toHaveBeenCalledWith('ABCD-EFGH-JKLM'));
    expect(await screen.findByRole('status')).toHaveTextContent('wallet.gift_added');
    expect(onAdded).toHaveBeenCalled();
  });
});
