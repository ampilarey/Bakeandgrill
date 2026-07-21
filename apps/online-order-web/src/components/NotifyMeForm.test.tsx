import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NotifyMeForm } from './NotifyMeForm';
import { ApiRequestError } from '@shared/api';
import * as serviceStatusApi from '../api/serviceStatus';

vi.mock('../api/serviceStatus', async () => {
  const actual = await vi.importActual<typeof import('../api/serviceStatus')>('../api/serviceStatus');
  return { ...actual, submitNotifyMe: vi.fn() };
});

const mocked = serviceStatusApi.submitNotifyMe as unknown as ReturnType<typeof vi.fn>;

describe('NotifyMeForm', () => {
  beforeEach(() => mocked.mockReset());

  it('rejects submit until consent is checked', async () => {
    const user = userEvent.setup();
    render(<NotifyMeForm serviceKey="online_checkout" />);
    await user.type(screen.getByLabelText(/mobile/i), '7777777');
    await user.click(screen.getByRole('button', { name: /notify me/i }));
    expect(mocked).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(/consent/i);
  });

  it('validates the MV mobile shape', async () => {
    const user = userEvent.setup();
    render(<NotifyMeForm serviceKey="online_checkout" />);
    await user.type(screen.getByLabelText(/mobile/i), 'abc');
    await user.click(screen.getByLabelText(/i agree/i));
    await user.click(screen.getByRole('button', { name: /notify me/i }));
    expect(mocked).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(/maldivian mobile/i);
  });

  it('POSTs and shows a generic success message', async () => {
    mocked.mockResolvedValueOnce({ ok: true, message: 'ok' });
    const user = userEvent.setup();
    render(<NotifyMeForm serviceKey="online_checkout" incidentId={42} />);
    await user.type(screen.getByLabelText(/mobile/i), '7777777');
    await user.click(screen.getByLabelText(/i agree/i));
    await user.click(screen.getByRole('button', { name: /notify me/i }));
    await waitFor(() => expect(mocked).toHaveBeenCalledTimes(1));
    expect(mocked).toHaveBeenCalledWith({
      service_key: 'online_checkout',
      mobile: '7777777',
      incident_id: 42,
    });
    expect(await screen.findByRole('status')).toHaveTextContent(/we.?ll text you/i);
  });

  it('gracefully degrades on 404 (endpoint not yet deployed)', async () => {
    mocked.mockRejectedValueOnce(new ApiRequestError('nope', 404, {}));
    const user = userEvent.setup();
    render(<NotifyMeForm serviceKey="online_checkout" />);
    await user.type(screen.getByLabelText(/mobile/i), '7777777');
    await user.click(screen.getByLabelText(/i agree/i));
    await user.click(screen.getByRole('button', { name: /notify me/i }));
    expect(await screen.findByText(/available yet/i)).toBeInTheDocument();
  });
});
