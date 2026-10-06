import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { TelegramPage } from '../pages/TelegramPage';
import { ToastProvider } from '../components/ui';
import { renderWithRouter } from './testUtils';
import * as api from '../api/telegram';

/*
 * Admin → Telegram (owner, 2026-10-06: "Build owner bot now"). The page
 * lists bots and people, makes one-time links and holds the two alert
 * switches.
 */

vi.mock('../api/telegram', async () => {
  const actual = await vi.importActual<typeof import('../api/telegram')>('../api/telegram');
  return {
    ...actual,
    fetchTelegram: vi.fn(),
    makeTelegramLink: vi.fn(),
    updateTelegramSettings: vi.fn(),
    addTelegramBot: vi.fn(),
  };
});

const overview: api.TelegramOverview = {
  bots: [{
    id: 1, name: 'Staff bot', username: 'BakeGrillStaffBot', roles: ['owner', 'manager', 'staff', 'kitchen_staff', 'driver'],
    is_enabled: true, linked_count: 1, last_checked_at: '2026-10-06T10:00:00Z', last_error: null, token_hint: '123456789:•••',
  }],
  people: [
    { kind: 'user', id: 1, name: 'Ahmed', phone: '+9607820288', role: 'owner', role_label: 'Owner', links: [{ id: 9, bot_id: 1, telegram_username: 'ahmed', telegram_name: 'Ahmed', linked_at: null, last_seen_at: null, blocked: false }] },
    { kind: 'user', id: 2, name: 'Mariyam', phone: '+9607001001', role: 'staff', role_label: 'Staff', links: [] },
  ],
  roles: [
    { key: 'owner', label: 'Owner' }, { key: 'manager', label: 'Manager' }, { key: 'staff', label: 'Staff (cashier)' },
    { key: 'kitchen_staff', label: 'Kitchen staff' }, { key: 'driver', label: 'Driver' },
  ],
  settings: { alerts_enabled: true, instead_of_sms: false, day_report: true },
  webhook_base: 'https://bakeandgrill.mv',
};

const renderPage = () => renderWithRouter(<ToastProvider><TelegramPage /></ToastProvider>);

describe('TelegramPage', () => {
  beforeEach(() => {
    vi.mocked(api.fetchTelegram).mockResolvedValue(overview);
    vi.mocked(api.makeTelegramLink).mockResolvedValue({ url: 'https://t.me/BakeGrillStaffBot?start=abc123', expires_at: '2026-10-06T11:00:00Z', minutes: 60, bot_username: 'BakeGrillStaffBot' });
    vi.mocked(api.updateTelegramSettings).mockResolvedValue({ settings: { alerts_enabled: true, instead_of_sms: true, day_report: true } });
  });

  it('shows the bot, who is linked and who is not', async () => {
    renderPage();
    expect(await screen.findByText('@BakeGrillStaffBot · 1 linked')).toBeInTheDocument();
    expect(screen.getByText('1 of 2 linked. Each person opens their own link once, on their own phone.')).toBeInTheDocument();
    expect(screen.getByText('@ahmed')).toBeInTheDocument();
    expect(screen.getByText('Not linked')).toBeInTheDocument();
  });

  it('makes a one-time link with a QR for the chosen person', async () => {
    renderPage();
    await screen.findByText('Mariyam');
    fireEvent.click(screen.getByRole('button', { name: /Link/ }));
    expect(await screen.findByText('https://t.me/BakeGrillStaffBot?start=abc123')).toBeInTheDocument();
    expect(api.makeTelegramLink).toHaveBeenCalledWith({ bot_id: 1, user_id: 2 });
    expect(screen.getByText(/Works once, for 60 minutes, and only for Mariyam/)).toBeInTheDocument();
  });

  it('turns on Telegram instead of SMS', async () => {
    renderPage();
    await screen.findByText('Telegram instead of SMS');
    const switches = screen.getAllByRole('switch');
    // Bot on/off, alerts, instead of SMS, day report.
    fireEvent.click(switches[switches.length - 2]);
    await waitFor(() => expect(api.updateTelegramSettings).toHaveBeenCalledWith({ instead_of_sms: true }));
  });
});
