import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ComplaintBoxPage from '../pages/ComplaintBoxPage';

/*
 * Owner, 2026-09-19: "there should be an easy way to see and manage the
 * complains ... when the complains is taken to action, there should be option
 * to send sms to customer if there is mobile number".
 */

vi.mock('../hooks/usePageTitle', () => ({ usePageTitle: () => {} }));
vi.mock('../hooks/usePermissions', () => ({
  useCurrentUserPermissions: () => ({ can: () => true, loading: false, user: null }),
}));
vi.mock('../hooks/useIsMobile', () => ({ useIsMobile: () => false }));
vi.mock('../components/ui', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}));

const fetchComplaintBox = vi.fn();
const getComplaintBoxEntry = vi.fn();
const updateComplaintBoxStatus = vi.fn();
const messageComplaintBoxCustomer = vi.fn();
vi.mock('../api', () => ({
  fetchComplaintBox: (...a: unknown[]) => fetchComplaintBox(...a),
  getComplaintBoxEntry: (...a: unknown[]) => getComplaintBoxEntry(...a),
  updateComplaintBoxStatus: (...a: unknown[]) => updateComplaintBoxStatus(...a),
  messageComplaintBoxCustomer: (...a: unknown[]) => messageComplaintBoxCustomer(...a),
}));

const withNumber = {
  id: 7, reference_number: 'CB-7', categories: ['staff_behaviour'], about_staff: 'The tall cashier',
  comment: 'Rude when I asked for a bag.', phone: '+9607654321', is_anonymous: false, order_ref: null,
  visited_on: null, source: 'web', status: 'new', owner_alert_status: 'sent', internal_note: null,
  last_message: null, last_message_at: null, taken_up_at: null, resolved_at: null,
  created_at: new Date().toISOString(),
  events: [{ id: 1, type: 'status', from_status: null, to_status: 'new', message: null, sms_status: null, created_at: new Date().toISOString() }],
};
const anonymous = {
  ...withNumber, id: 8, reference_number: 'CB-8', categories: ['cleanliness'], about_staff: null,
  comment: 'Tables sticky.', phone: null, is_anonymous: true,
};

const listing = {
  entries: { data: [withNumber, anonymous], total: 2, last_page: 1, current_page: 1 },
  meta: { open_count: 2, new_count: 2, staff_open_count: 1, this_week_count: 2 },
  categories: [
    { value: 'staff_behaviour', label: 'Staff behaviour' },
    { value: 'cleanliness', label: 'Cleanliness' },
  ],
};

describe('ComplaintBoxPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchComplaintBox.mockResolvedValue(listing);
    getComplaintBoxEntry.mockImplementation(async (id: number) => ({ entry: id === 7 ? withNumber : anonymous }));
    updateComplaintBoxStatus.mockImplementation(async (_id: number, body: { status: string }) => ({ entry: { ...withNumber, status: body.status } }));
    messageComplaintBoxCustomer.mockResolvedValue({ event: {}, entry: withNumber });
  });

  const open = () => render(<MemoryRouter><ComplaintBoxPage /></MemoryRouter>);

  it('lists complaints with what they are about, who, and whether they can be answered', async () => {
    open();
    await screen.findByText('CB-7');

    const table = screen.getByRole('table');
    expect(within(table).getByText('The tall cashier')).toBeInTheDocument();
    expect(within(table).getByText('Staff behaviour')).toBeInTheDocument();
    expect(within(table).getByText('+9607654321')).toBeInTheDocument();
    expect(within(table).getAllByText('Anonymous')).toHaveLength(1);
    // Stat cards.
    expect(screen.getByText('About staff (open)')).toBeInTheDocument();
    expect(fetchComplaintBox).toHaveBeenCalledWith({ page: 1, status: 'open', category: undefined, search: undefined });

    fireEvent.change(screen.getByLabelText('About'), { target: { value: 'staff' } });
    await waitFor(() => expect(fetchComplaintBox).toHaveBeenLastCalledWith({ page: 1, status: 'open', category: 'staff', search: undefined }));
  });

  it('takes a complaint up with a message to the customer', async () => {
    open();
    fireEvent.click((await screen.findAllByRole('button', { name: 'Open' }))[0]);
    const dialog = await screen.findByRole('dialog');

    expect(within(dialog).getByTestId('complaint-box-contact')).toHaveTextContent('+9607654321');
    // Status defaults to the next sensible step for a new complaint.
    expect(within(dialog).getByLabelText('New status')).toHaveValue('in_progress');

    fireEvent.click(within(dialog).getByRole('button', { name: 'Taken up' }));
    const box = within(dialog).getByLabelText('Message to the customer');
    expect(box).toHaveValue('We have read your complaint and are looking into it now. We will get back to you today.');
    fireEvent.change(within(dialog).getByLabelText('Note for staff'), { target: { value: 'Ahmed on shift' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save and send SMS' }));

    await waitFor(() => expect(updateComplaintBoxStatus).toHaveBeenCalledWith(7, {
      status: 'in_progress',
      internal_note: 'Ahmed on shift',
      message: 'We have read your complaint and are looking into it now. We will get back to you today.',
    }));
  });

  it('cannot message an anonymous complaint, but can still take it up', async () => {
    open();
    fireEvent.click((await screen.findAllByRole('button', { name: 'Open' }))[1]);
    const dialog = await screen.findByRole('dialog');

    expect(within(dialog).getByTestId('complaint-box-contact')).toHaveTextContent(/no reply can be sent/);
    expect(within(dialog).getByLabelText('Message to the customer')).toBeDisabled();
    expect(within(dialog).queryByRole('button', { name: 'Send SMS only' })).toBeNull();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(updateComplaintBoxStatus).toHaveBeenCalledWith(8, { status: 'in_progress', internal_note: undefined, message: undefined }));
  });
});
