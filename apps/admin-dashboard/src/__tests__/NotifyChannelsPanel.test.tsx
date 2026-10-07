import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { NotifyChannelsPanel, reachNote } from '../components/NotifyChannelsPanel';
import * as api from '../api';
import type { NotifyPerson } from '../api';

vi.mock('../api', async () => {
  const actual = await vi.importActual<typeof import('../api')>('../api');
  return {
    ...actual,
    getNotifyChannels: vi.fn(),
    updateNotifyRoles: vi.fn(),
    updateNotifyPerson: vi.fn(),
  };
});

const owner: NotifyPerson = { id: 1, name: 'Ahmed', role: 'owner', role_label: 'Owner', phone: '+9607820288', email: 'a@example.com', telegram_linked: true, own_channels: null, channels: ['sms', 'email', 'telegram'] };
const manager: NotifyPerson = { id: 2, name: 'Ariya', role: 'manager', role_label: 'Manager', phone: null, email: 'ariya@example.com', telegram_linked: false, own_channels: null, channels: ['sms', 'email', 'telegram'] };
const ghost: NotifyPerson = { id: 3, name: 'Nobody', role: 'staff', role_label: 'Staff', phone: null, email: null, telegram_linked: false, own_channels: null, channels: ['sms', 'email', 'telegram'] };

describe('Who gets alerts, and how', () => {
  beforeEach(() => {
    vi.mocked(api.getNotifyChannels).mockResolvedValue({
      channels: ['sms', 'email', 'telegram'],
      roles: [
        { key: 'owner', label: 'Owner', channels: ['sms', 'email', 'telegram'] },
        { key: 'manager', label: 'Manager', channels: ['sms', 'email', 'telegram'] },
        { key: 'staff', label: 'Staff', channels: ['sms', 'email', 'telegram'] },
      ],
      people: [owner, manager, ghost],
    });
    vi.mocked(api.updateNotifyRoles).mockResolvedValue({ roles: { owner: ['sms', 'email', 'telegram'], manager: ['email', 'telegram'], staff: ['sms', 'email', 'telegram'] } });
    vi.mocked(api.updateNotifyPerson).mockImplementation(async (id, channels) => ({
      person: { ...owner, id, own_channels: channels, channels: channels ?? owner.channels },
    }));
  });

  it('turns SMS off for a role', async () => {
    render(<NotifyChannelsPanel canManage emailToStaffOn onError={() => undefined} />);
    const row = await screen.findByTestId('nc-role-manager');
    fireEvent.click(within(row).getByRole('button', { name: /SMS/ }));
    await waitFor(() => expect(api.updateNotifyRoles).toHaveBeenCalledWith({ manager: ['email', 'telegram'] }));
  });

  it('gives a person their own channels, then puts them back on their role', async () => {
    render(<NotifyChannelsPanel canManage emailToStaffOn onError={() => undefined} />);
    const row = await screen.findByTestId('nc-person-1');
    fireEvent.change(within(row).getByRole('combobox'), { target: { value: 'own' } });
    await waitFor(() => expect(api.updateNotifyPerson).toHaveBeenCalledWith(1, ['sms', 'email', 'telegram']));
    fireEvent.click(await within(screen.getByTestId('nc-person-1')).findByRole('button', { name: /SMS/ }));
    await waitFor(() => expect(api.updateNotifyPerson).toHaveBeenLastCalledWith(1, ['email', 'telegram']));
    fireEvent.change(within(screen.getByTestId('nc-person-1')).getByRole('combobox'), { target: { value: 'role' } });
    await waitFor(() => expect(api.updateNotifyPerson).toHaveBeenLastCalledWith(1, null));
  });

  it('says who can be reached and who cannot', async () => {
    render(<NotifyChannelsPanel canManage emailToStaffOn={false} onError={() => undefined} />);
    expect(await within(await screen.findByTestId('nc-person-2')).findByText('Gets Email. (no phone, Telegram not linked)')).toBeInTheDocument();
    expect(within(screen.getByTestId('nc-person-3')).getByText(/Gets no alerts/)).toBeInTheDocument();
    expect(screen.getByText(/1 person gets no alerts at all/)).toBeInTheDocument();
    expect(screen.getByTestId('nc-email-off')).toBeInTheDocument();
  });

  it('read-only without the permission', async () => {
    render(<NotifyChannelsPanel canManage={false} emailToStaffOn onError={() => undefined} />);
    const row = await screen.findByTestId('nc-role-owner');
    expect(within(row).getByRole('button', { name: /SMS/ })).toBeDisabled();
  });

  it('the SMS is the safety net when nothing else reaches them', () => {
    expect(reachNote({ ...owner, telegram_linked: false, email: null }, ['telegram', 'email'])).toEqual({ tone: 'warn', text: 'None of these can reach them, so the SMS goes instead.' });
  });
});
