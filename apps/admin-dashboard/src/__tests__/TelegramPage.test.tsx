import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { TelegramPage } from '../pages/TelegramPage';
import { ToastProvider } from '../components/ui';
import { renderWithRouter } from './testUtils';
import * as api from '../api/telegram';

/*
 * Admin → Telegram (owner, 2026-10-06: "Build owner bot now"). The page
 * lists bots and people and makes one-time links. Its alert switches moved
 * to System → Notifications (2026-10-10); the Alerts card points there.
 */

vi.mock('../api/telegram', async () => {
  const actual = await vi.importActual<typeof import('../api/telegram')>('../api/telegram');
  return {
    ...actual,
    fetchTelegram: vi.fn(),
    makeTelegramLink: vi.fn(),
    updateTelegramSettings: vi.fn(),
    addTelegramBot: vi.fn(),
    updateTelegramGroup: vi.fn(),
    testTelegramGroup: vi.fn(),
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
  settings: { alerts_enabled: true, day_report: true },
  webhook_base: 'https://bakeandgrill.mv',
};

const renderPage = () => renderWithRouter(<ToastProvider><TelegramPage /></ToastProvider>);

describe('TelegramPage', () => {
  beforeEach(() => {
    vi.mocked(api.fetchTelegram).mockResolvedValue(overview);
    vi.mocked(api.makeTelegramLink).mockResolvedValue({ url: 'https://t.me/BakeGrillStaffBot?start=abc123', expires_at: '2026-10-06T11:00:00Z', minutes: 60, bot_username: 'BakeGrillStaffBot' });
    vi.mocked(api.updateTelegramSettings).mockResolvedValue({ settings: { alerts_enabled: true, day_report: true } });
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

  it('points the alert settings at Notifications', async () => {
    renderPage();
    const card = await screen.findByTestId('telegram-alerts-moved');
    expect(card).toHaveTextContent('Telegram alerts are on.');
    expect(screen.getByRole('link', { name: "each alert's Telegram switch" })).toHaveAttribute('href', '/notifications/messages?group=staff');
    expect(screen.getByRole('link', { name: /day report, cancelled orders, cash taken out/ })).toHaveAttribute('href', '/notifications/messages?group=telegram');
    expect(screen.getByRole('link', { name: 'Telegram on or off' })).toHaveAttribute('href', '/notifications/rules');
    expect(screen.getByRole('link', { name: /who gets them by Telegram/ })).toHaveAttribute('href', '/notifications/people');
    expect(screen.queryByLabelText('Cash alert from amount')).toBeNull();
  });

  it('shows how to add a group when there is none', async () => {
    renderPage();
    const steps = await screen.findByTestId('tg-groups-empty');
    expect(steps).toHaveTextContent('/feed@BakeGrillStaffBot');
  });

  it('lists a shop group, pauses it and sends a test', async () => {
    vi.mocked(api.fetchTelegram).mockResolvedValue({
      ...overview,
      groups: [{
        id: 4, title: 'Bake & Grill kitchen', bot: { id: 1, name: 'Staff bot', username: 'BakeGrillStaffBot' }, feeds: ['online_orders'],
        is_enabled: true, added_by: 'Ahmed', last_posted_at: null, last_error: null, created_at: '2026-10-07T10:00:00Z',
      }],
    });
    vi.mocked(api.updateTelegramGroup).mockResolvedValue({ group: {} as api.TelegramGroup });
    vi.mocked(api.testTelegramGroup).mockResolvedValue({ ok: true });
    renderPage();
    const card = await screen.findByTestId('tg-group-4');
    expect(card).toHaveTextContent('Bake & Grill kitchen');
    expect(card).toHaveTextContent('added by Ahmed');

    fireEvent.click(screen.getByRole('button', { name: /Send a test/ }));
    await waitFor(() => expect(api.testTelegramGroup).toHaveBeenCalledWith(4));
    // Bot switch, group switch.
    fireEvent.click(screen.getAllByRole('switch')[1]);
    await waitFor(() => expect(api.updateTelegramGroup).toHaveBeenCalledWith(4, { is_enabled: false }));

    // Follow the buying list too.
    fireEvent.click(screen.getByRole('checkbox', { name: 'Buying list' }));
    await waitFor(() => expect(api.updateTelegramGroup).toHaveBeenCalledWith(4, { feeds: ['online_orders', 'buying_list'] }));
  });
});
