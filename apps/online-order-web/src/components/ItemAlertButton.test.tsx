import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ItemAlertButton, canAskForItemAlert } from './ItemAlertButton';
import { getItemAlerts, setItemAlert } from '../api';

const auth = { isAuthenticated: true, authReady: true };
vi.mock('../context/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('../context/LanguageContext', () => ({ useLanguage: () => ({ t: (key: string) => key, lang: 'en' }) }));
vi.mock('../api', () => ({ getItemAlerts: vi.fn(), setItemAlert: vi.fn() }));

const renderButton = (comingSoon = false) =>
  render(<MemoryRouter><ItemAlertButton itemId={7} comingSoon={comingSoon} /></MemoryRouter>);

/* Feature 8: "Tell me when it's back" on a dish that cannot be ordered now. */
describe('ItemAlertButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.isAuthenticated = true;
    vi.mocked(getItemAlerts).mockResolvedValue({ item_ids: [] });
    vi.mocked(setItemAlert).mockResolvedValue({ waiting: true });
  });

  it('is offered for sold out, snoozed, switched off and coming soon, not for closed hours', () => {
    expect(canAskForItemAlert({ unavailable_reason: 'out_of_stock' })).toBe(true);
    expect(canAskForItemAlert({ unavailable_reason: 'snoozed' })).toBe(true);
    expect(canAskForItemAlert({ unavailable_reason: 'item_unavailable' })).toBe(true);
    expect(canAskForItemAlert({ coming_soon_until: '2026-11-01T10:00:00Z', unavailable_reason: 'item_unavailable' })).toBe(true);
    expect(canAskForItemAlert({ unavailable_reason: 'ordering_closed' })).toBe(false);
    expect(canAskForItemAlert({ unavailable_reason: 'channel_unavailable' })).toBe(false);
  });

  it('asks to be told, then shows it is waiting', async () => {
    renderButton();
    expect(await screen.findByText('itemAlert.back')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('item-alert'));
    await waitFor(() => expect(setItemAlert).toHaveBeenCalledWith(7, true));
    expect(await screen.findByText('itemAlert.waiting_back')).toBeInTheDocument();
  });

  it('shows a dish already asked for as waiting, and a tap stops it', async () => {
    vi.mocked(getItemAlerts).mockResolvedValue({ item_ids: [7] });
    vi.mocked(setItemAlert).mockResolvedValue({ waiting: false });
    renderButton(true);
    expect(await screen.findByText('itemAlert.waiting_launch')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('item-alert'));
    await waitFor(() => expect(setItemAlert).toHaveBeenCalledWith(7, false));
    expect(await screen.findByText('itemAlert.launch')).toBeInTheDocument();
  });

  it('asks a signed-out guest to sign in', () => {
    auth.isAuthenticated = false;
    renderButton();
    expect(screen.getByTestId('item-alert-sign-in')).toHaveAttribute('href', '/account');
    expect(getItemAlerts).not.toHaveBeenCalled();
  });
});
