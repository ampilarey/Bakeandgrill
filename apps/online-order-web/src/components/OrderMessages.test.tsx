import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { OrderMessages } from './OrderMessages';
import { getOrderMessages, sendOrderMessage } from '../api';

vi.mock('../context/LanguageContext', () => ({ useLanguage: () => ({ t: (key: string) => key, lang: 'en' }) }));
vi.mock('../api', () => ({ getOrderMessages: vi.fn(), sendOrderMessage: vi.fn() }));

/* Feature 9: "Message us" on the order page. */
describe('OrderMessages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getOrderMessages).mockResolvedValue({ can_write: true, messages: [
      { id: 1, from: 'staff', body: 'Your order is nearly ready.', photo_url: null, created_at: '2026-10-17T10:00:00Z' },
    ] });
    vi.mocked(sendOrderMessage).mockResolvedValue({} as never);
  });

  it('shows the thread and sends a message', async () => {
    render(<OrderMessages token="tok123" />);
    expect(await screen.findByText('Your order is nearly ready.')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('order-message-open'));
    fireEvent.change(screen.getByTestId('order-message-text'), { target: { value: 'Running late' } });
    fireEvent.click(screen.getByTestId('order-message-send'));
    await waitFor(() => expect(sendOrderMessage).toHaveBeenCalledWith('tok123', 'Running late', null));
  });

  it('hides itself on a closed order with no messages', async () => {
    vi.mocked(getOrderMessages).mockResolvedValue({ can_write: false, messages: [] });
    const { container } = render(<OrderMessages token="tok123" />);
    await waitFor(() => expect(getOrderMessages).toHaveBeenCalled());
    expect(container.innerHTML).toBe('');
  });
});
