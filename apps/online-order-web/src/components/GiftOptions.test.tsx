import { fireEvent, render, screen } from '@testing-library/react';
import { GiftOptions, type GiftDraft } from './GiftOptions';

vi.mock('../context/LanguageContext', () => ({ useLanguage: () => ({ t: (key: string) => key, lang: 'en' }) }));

/* Feature 10: "This is a gift" at checkout. */
describe('GiftOptions', () => {
  it('opens the receiver fields when ticked', () => {
    const onChange = vi.fn();
    const off: GiftDraft = { on: false, name: '', phone: '', message: '' };
    const { rerender } = render(<GiftOptions gift={off} onChange={onChange} delivery />);
    expect(screen.queryByTestId('gift-name')).toBeNull();
    fireEvent.click(screen.getByTestId('gift-toggle'));
    expect(onChange).toHaveBeenCalledWith({ ...off, on: true });

    rerender(<GiftOptions gift={{ ...off, on: true }} onChange={onChange} delivery />);
    fireEvent.change(screen.getByTestId('gift-name'), { target: { value: 'Aisha' } });
    expect(onChange).toHaveBeenLastCalledWith({ ...off, on: true, name: 'Aisha' });
    expect(screen.getByText('giftOrder.hint_delivery')).toBeInTheDocument();
  });
});
