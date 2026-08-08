import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ModeEntryCards } from './ModeEntryCards';
import * as api from '../../api';
import type { OnlineOrderingStatus } from '../../api';

const navigateMock = vi.fn();
const setModeMock = vi.fn();
const textStore: Record<string, string> = {};

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

vi.mock('../../context/OrderModeContext', () => ({
  useOrderMode: () => ({
    mode: 'pickup',
    setMode: setModeMock,
    modeConfirmed: true,
    channel: 'online_pickup',
  }),
}));

vi.mock('../../context/LanguageContext', () => ({
  useLanguage: () => ({
    t: (key: string) => {
      const map: Record<string, string> = {
        'mode.delivery': 'Delivery',
        'mode.pickup': 'Pickup',
        'mode.eat_here': 'Eat here',
        'home.mode_region': 'Choose order mode',
        'home.mode_unavailable': 'Unavailable right now',
        'home.mode_delivery_hint': 'Delivered to your door in 30–45 min',
        'home.mode_pickup_hint': 'Pick up at our shop',
        'sheet.close': 'Close',
      };
      return map[key] ?? key;
    },
  }),
}));

vi.mock('../../context/SiteSettingsContext', () => ({
  useSiteSettingsContext: () => ({
    settings: {},
    text: (key: string, fallback: string) => {
      const v = textStore[key];
      if (v == null || String(v).trim() === '') return fallback;
      return String(v);
    },
  }),
}));

vi.mock('../../api', async () => {
  const actual = await vi.importActual<typeof import('../../api')>('../../api');
  return {
    ...actual,
    fetchOnlineOrderingStatus: vi.fn(),
  };
});

vi.mock('../ui/Sheet', () => ({
  Sheet: ({
    open,
    onClose,
    title,
    children,
  }: {
    open: boolean;
    onClose: () => void;
    title?: string;
    children: React.ReactNode;
  }) => {
    if (!open) return null;
    return (
      <div role="dialog" aria-label={title ?? 'sheet'} data-testid="mode-info-sheet">
        <h2>{title}</h2>
        {children}
        <button type="button" onClick={onClose}>backdrop-close</button>
      </div>
    );
  },
}));

const fetchGate = api.fetchOnlineOrderingStatus as unknown as ReturnType<typeof vi.fn>;

function closedGate(overrides: Partial<OnlineOrderingStatus> = {}): OnlineOrderingStatus {
  return {
    open: false,
    message: 'Closed',
    reason: 'schedule',
    master_switch: true,
    override_active: false,
    override_until: null,
    schedule_active: true,
    current_close: null,
    next_open_window: '2099-08-09T10:00:00+05:00',
    delivery_available: false,
    next_delivery_window: '2099-08-09T10:00:00+05:00',
    dine_in_preorder: { enabled: true, open: false },
    modes: {
      pickup: { enabled: true, open: false },
      delivery: { enabled: true, open: false },
      dine_in: { enabled: true, open: false },
    },
    ...overrides,
  };
}

function openGate(): OnlineOrderingStatus {
  return {
    open: true,
    message: 'Open',
    reason: null,
    master_switch: true,
    override_active: false,
    override_until: null,
    schedule_active: true,
    current_close: '2099-08-09T22:00:00+05:00',
    next_open_window: null,
    delivery_available: true,
    next_delivery_window: null,
    dine_in_preorder: { enabled: true, open: true },
    modes: {
      pickup: { enabled: true, open: true },
      delivery: { enabled: true, open: true },
      dine_in: { enabled: true, open: true },
    },
  };
}

function renderCards() {
  return render(
    <MemoryRouter>
      <ModeEntryCards />
    </MemoryRouter>,
  );
}

describe('ModeEntryCards informative closed states', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.keys(textStore).forEach((k) => { delete textStore[k]; });
    fetchGate.mockResolvedValue(closedGate());
  });

  it('lets an unavailable mode card open its information view', async () => {
    const user = userEvent.setup();
    renderCards();
    const card = await screen.findByTestId('mode-entry-delivery');
    expect(card).not.toBeDisabled();
    expect(card.getAttribute('aria-disabled')).toBeNull();
    expect(card.getAttribute('data-available')).toBe('false');

    await user.click(card);
    const sheet = await screen.findByTestId('mode-info-sheet');
    expect(within(sheet).getByTestId('mode-info-delivery')).toBeTruthy();
    expect(within(sheet).getByTestId('mode-info-status').textContent).toMatch(/Closed until|Unavailable/i);
    expect(navigateMock).not.toHaveBeenCalled();
    expect(setModeMock).not.toHaveBeenCalled();
  });

  it('states the mode current status in the information view', async () => {
    const user = userEvent.setup();
    renderCards();
    await user.click(await screen.findByTestId('mode-entry-pickup'));
    const status = await screen.findByTestId('mode-info-status');
    expect(status.textContent).toMatch(/Closed until \d{1,2}:\d{2} (AM|PM)/);
  });

  it('does not offer a checkout path from an unavailable info view', async () => {
    const user = userEvent.setup();
    renderCards();
    await user.click(await screen.findByTestId('mode-entry-dine_in'));
    const sheet = await screen.findByTestId('mode-info-sheet');
    expect(within(sheet).queryByRole('link')).toBeNull();
    expect(within(sheet).queryByRole('button', { name: /start|checkout|menu|order now/i })).toBeNull();
    await user.click(within(sheet).getByRole('button', { name: /^Close$/i }));
    expect(navigateMock).not.toHaveBeenCalled();
    expect(setModeMock).not.toHaveBeenCalled();
  });

  it('keeps available and unavailable cards visually distinguishable without an image chip', async () => {
    fetchGate.mockResolvedValue(closedGate({
      open: true,
      reason: null,
      delivery_available: true,
      modes: {
        pickup: { enabled: true, open: true },
        delivery: { enabled: true, open: true },
        dine_in: { enabled: true, open: false },
      },
      dine_in_preorder: { enabled: true, open: false },
      next_open_window: '2099-08-09T10:00:00+05:00',
    }));
    renderCards();
    const closed = await screen.findByTestId('mode-entry-dine_in');
    await waitFor(() => {
      expect(screen.getByTestId('mode-entry-delivery').getAttribute('data-available')).toBe('true');
      expect(closed.getAttribute('data-available')).toBe('false');
    });
    // Closed status once in the card body — never as an overlay chip on the photo.
    expect(screen.queryByTestId('mode-status-chip-dine_in')).toBeNull();
    expect(screen.queryByTestId('mode-status-chip-delivery')).toBeNull();
    expect(closed.textContent).toMatch(/Closed until \d{1,2}:\d{2} (AM|PM)/);
    expect(closed.textContent).toMatch(/Learn more/i);
    const photo = closed.querySelector('[aria-hidden]') as HTMLElement | null;
    expect(photo?.style.filter).toContain('grayscale');
  });

  it('keeps cards keyboard-focusable and operable when unavailable', async () => {
    const user = userEvent.setup();
    renderCards();
    const card = await screen.findByTestId('mode-entry-delivery');
    card.focus();
    expect(document.activeElement).toBe(card);
    await user.keyboard('{Enter}');
    expect(await screen.findByTestId('mode-info-delivery')).toBeTruthy();
  });

  it('goes straight to ordering when a mode is available', async () => {
    fetchGate.mockResolvedValue(openGate());
    const user = userEvent.setup();
    renderCards();
    const card = await screen.findByTestId('mode-entry-delivery');
    await waitFor(() => expect(card.getAttribute('data-available')).toBe('true'));
    await user.click(card);
    expect(setModeMock).toHaveBeenCalledWith('delivery');
    expect(navigateMock).toHaveBeenCalledWith('/menu');
    expect(screen.queryByTestId('mode-info-sheet')).toBeNull();
  });

  it('uses owner wording overrides in the info view', async () => {
    textStore.order_mode_delivery_info = 'Custom delivery story from the owner.';
    textStore.order_mode_status_unavailable_opens = 'Back at {time}';
    const user = userEvent.setup();
    renderCards();
    await user.click(await screen.findByTestId('mode-entry-delivery'));
    expect((await screen.findByTestId('mode-info-body')).textContent).toBe(
      'Custom delivery story from the owner.',
    );
    expect((await screen.findByTestId('mode-info-status')).textContent).toMatch(/Back at \d{1,2}:\d{2} (AM|PM)/);
  });

  it('falls back cleanly when wording settings are empty', async () => {
    const user = userEvent.setup();
    renderCards();
    await user.click(await screen.findByTestId('mode-entry-dine_in'));
    const body = await screen.findByTestId('mode-info-body');
    expect(body.textContent).toMatch(/table is held/i);
  });

  it('does not invent a reopen time when the owner switched the mode off', async () => {
    fetchGate.mockResolvedValue(closedGate({
      modes: {
        pickup: { enabled: true, open: false },
        delivery: { enabled: false, open: false },
        dine_in: { enabled: true, open: false },
      },
      next_delivery_window: '2099-08-09T10:00:00+05:00',
    }));
    const user = userEvent.setup();
    renderCards();
    await user.click(await screen.findByTestId('mode-entry-delivery'));
    const status = await screen.findByTestId('mode-info-status');
    expect(status.textContent).toBe('Unavailable right now');
    expect(status.textContent).not.toMatch(/10:00/);
  });
});
