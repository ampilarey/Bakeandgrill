import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { NotifyChannelsPanel, reachNote } from '../components/NotifyChannelsPanel';
import type { NotifyPerson, NotifyRole } from '../api';

const owner: NotifyPerson = { id: 1, name: 'Ahmed', role: 'owner', role_label: 'Owner', phone: '+9607820288', email: 'a@example.com', telegram_linked: true, own_channels: null, channels: ['sms', 'email', 'telegram'] };
const manager: NotifyPerson = { id: 2, name: 'Ariya', role: 'manager', role_label: 'Manager', phone: null, email: 'ariya@example.com', telegram_linked: false, own_channels: null, channels: ['sms', 'email', 'telegram'] };
const ghost: NotifyPerson = { id: 3, name: 'Nobody', role: 'staff', role_label: 'Staff', phone: null, email: null, telegram_linked: false, own_channels: null, channels: ['sms', 'email', 'telegram'] };

const roles: NotifyRole[] = [
  { key: 'owner', label: 'Owner', channels: ['sms', 'email', 'telegram'] },
  { key: 'manager', label: 'Manager', channels: ['sms', 'email', 'telegram'] },
  { key: 'staff', label: 'Staff', channels: ['sms', 'email', 'telegram'] },
];

describe('By role: channels and the alerts that reach each role', () => {
  it('turns SMS off for a role', () => {
    const save = vi.fn();
    render(<MemoryRouter><NotifyChannelsPanel canManage roles={roles} loading={false} busy={false} alertsByRole={{ owner: 40, manager: 31 }} onSaveRole={save} /></MemoryRouter>);
    const row = screen.getByTestId('nc-role-manager');
    fireEvent.click(within(row).getByRole('button', { name: /SMS/ }));
    expect(save).toHaveBeenCalledWith('manager', ['email', 'telegram']);
    expect(within(row).getByRole('link', { name: 'Alerts that reach Manager' })).toHaveAttribute('href', '/notifications/messages?to=role:manager');
    expect(within(row).getByRole('link', { name: 'Alerts that reach Manager' })).toHaveTextContent('31 alerts');
  });

  it('read-only without the permission', () => {
    render(<MemoryRouter><NotifyChannelsPanel canManage={false} roles={roles} loading={false} busy={false} alertsByRole={{}} onSaveRole={() => undefined} /></MemoryRouter>);
    const row = screen.getByTestId('nc-role-owner');
    expect(within(row).getByRole('button', { name: /SMS/ })).toBeDisabled();
  });

  it('says who can be reached and who cannot', () => {
    expect(reachNote(manager, manager.channels)).toEqual({ tone: 'warn', text: 'Gets Email. (no phone, Telegram not linked)' });
    expect(reachNote(ghost, ghost.channels).tone).toBe('danger');
    expect(reachNote(owner, owner.channels)).toEqual({ tone: 'ok', text: 'Gets SMS, Email, Telegram.' });
  });

  it('the SMS is the safety net when nothing else reaches them', () => {
    expect(reachNote({ ...owner, telegram_linked: false, email: null }, ['telegram', 'email'])).toEqual({ tone: 'warn', text: 'None of these can reach them, so the SMS goes instead.' });
  });
});
