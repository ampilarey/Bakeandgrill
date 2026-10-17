import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { OrderMessagesPanel } from '../components/OrderMessagesPanel';
import { fetchOrderMessages, orderMessageToComplaint, replyToOrderMessage } from '../api';

vi.mock('../hooks/usePermissions', () => ({ useCurrentUserPermissions: () => ({ can: () => true }) }));
vi.mock('../api', () => ({
  fetchOrderMessages: vi.fn(),
  replyToOrderMessage: vi.fn(),
  orderMessageToComplaint: vi.fn(),
}));

/* Feature 9: staff read and answer a customer's message, or turn it into a complaint. */
describe('OrderMessagesPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchOrderMessages).mockResolvedValue({ messages: [
      { id: 1, from: 'customer', body: 'Running 10 min late', photo_url: null, read: true, created_at: '2026-10-17T10:00:00Z', staff_name: null, complaint_id: null },
    ] });
    vi.mocked(replyToOrderMessage).mockResolvedValue({} as never);
    vi.mocked(orderMessageToComplaint).mockResolvedValue({ complaint_id: 7, reference: 'C-7' });
  });

  it('replies and opens a complaint', async () => {
    render(<MemoryRouter><OrderMessagesPanel orderId={5} /></MemoryRouter>);
    expect(await screen.findByText('Running 10 min late')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Reply to the customer'), { target: { value: ' We will keep it warm ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send reply' }));
    await waitFor(() => expect(replyToOrderMessage).toHaveBeenCalledWith(5, 'We will keep it warm'));
    fireEvent.click(screen.getByRole('button', { name: 'Turn into a complaint' }));
    expect(await screen.findByText('Complaint C-7 opened.')).toBeInTheDocument();
  });
});
