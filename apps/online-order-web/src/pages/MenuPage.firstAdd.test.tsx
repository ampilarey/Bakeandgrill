import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MenuPage } from './MenuPage';

vi.mock('../api', async () => {
  const actual = await vi.importActual<typeof import('../api')>('../api');
  return {
    ...actual,
    fetchCategories: vi.fn().mockResolvedValue({
      data: [
        { id: 1, name: 'Grill', is_active: true, parent_id: null, sort_order: 0 },
      ],
    }),
    // The catering listing is asked for too; nothing here belongs to it.
    fetchItems: vi.fn().mockImplementation((channel?: string) => Promise.resolve(channel === 'delivery' ? {
      data: [{ id: 11, name: 'Mystery Bun', base_price: 5, category_id: null, is_available: true, has_variants: false, variants: [] }],
      channelUsed: 'delivery', deliveryFallback: false,
    } : channel === 'catering' ? {
      data: [{ id: 20, name: 'Buffet for 20', description: 'Event dish', base_price: 900, category_id: null, is_available: true, has_variants: false, variants: [], is_catering: true }],
      channelUsed: 'catering', deliveryFallback: false,
    } : {
      data: [
        {
          id: 10,
          name: 'House Salad',
          description: 'In a category',
          base_price: 40,
          category_id: 1,
          is_featured: true,
          is_available: true,
          has_variants: false,
          variants: [],
        },
        {
          id: 11,
          name: 'Mystery Bun',
          description: 'No category at all',
          base_price: 5,
          category_id: null,
          is_available: true,
          has_variants: false,
          variants: [],
        },
        {
          id: 12,
          name: 'Orphan Roll',
          description: 'Category retired',
          base_price: 6,
          category_id: 99,
          is_available: true,
          has_variants: false,
          variants: [],
        },
      ],
      channelUsed: 'online_pickup',
      deliveryFallback: false,
    })),
    fetchOnlineOrderingStatus: vi.fn().mockResolvedValue({
      open: true,
      delivery_available: true,
      message: null,
    }),
    fetchOrderingEligibility: vi.fn().mockResolvedValue({
      delivery: { accepting: true, reason: null, message: null },
      active_menu_groups: [],
    }),
    fetchOffers: vi.fn().mockResolvedValue({ offers: [], subtext: null }),
    getMyFavourites: vi.fn().mockResolvedValue([]),
    getWaitTimeEstimate: vi.fn().mockResolvedValue(null),
  };
});

vi.mock('../context/LanguageContext', () => ({
  useLanguage: () => ({ t: (k: string) => k, lang: 'en' }),
}));


const h = vi.hoisted(() => ({
  showToast: vi.fn(),
  addItem: vi.fn(),
  setMode: vi.fn(),
  modeConfirmed: false,
}));

vi.mock('../context/ToastContext', () => ({
  useToast: () => ({ showToast: h.showToast }),
}));

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ isAuthenticated: false, user: null }),
}));

vi.mock('../context/CartContext', () => ({
  useCart: () => ({
    cart: [],
    addItem: h.addItem,
    cartTotal: 0,
    cartCount: 0,
    pruneCartToAllowedItemIds: vi.fn(),
    refreshPricesFromMenu: vi.fn(),
  }),
}));

vi.mock('../context/ShellNavContext', () => ({
  useShellNav: () => ({ openCartSheet: vi.fn() }),
  useShellNavOptional: () => null,
}));

vi.mock('../context/SiteSettingsContext', () => ({
  useSiteSettingsContext: () => ({ text: (_k: string, d: string) => d, settings: {} }),
}));

vi.mock('../context/ServiceStatusContext', () => ({
  useServiceStatusContext: () => ({ get: () => null, isAvailable: () => true }),
}));

vi.mock('../context/OrderModeContext', () => ({
  useOrderMode: () => ({ mode: 'pickup', setMode: h.setMode, modeConfirmed: h.modeConfirmed, channel: 'online_pickup' }),
  modeToChannel: (m: string) => (m === 'delivery' ? 'delivery' : m === 'dine_in' ? 'dine_in' : 'online_pickup'),
}));

vi.mock('../context/OrderDayContext', () => ({
  useOrderDay: () => ({ day: 'today', setDay: vi.fn() }),
}));

// The real sheet sets the mode and hands the choice back; this one only hands it back.
vi.mock('../components/OrderModeSheet', () => ({
  OrderModeSheet: (p: { open: boolean; onClose: () => void; onChosen?: (m: string) => void }) => (p.open ? (
    <div data-testid="mode-sheet">
      <button type="button" onClick={() => p.onChosen?.('pickup')}>pick-pickup</button>
      <button type="button" onClick={() => p.onChosen?.('delivery')}>pick-delivery</button>
      <button type="button" onClick={p.onClose}>dismiss</button>
    </div>
  ) : null),
}));

vi.mock('../hooks/usePageTitle', () => ({ usePageTitle: () => {} }));

vi.mock('../components/menu/ProductCard', () => ({
  ProductCard: ({ item, onSelectItem }: { item: { name: string }; onSelectItem: (i: unknown) => void }) => (
    <button type="button" data-testid="product-card-stub" onClick={() => onSelectItem(item)}>{item.name}</button>
  ),
}));

vi.mock('../components/menu/CategoryRail', () => ({
  CategoryRail: (props: { headSlot?: unknown }) => <div data-testid="category-rail">{props.headSlot as never}</div>,
}));

vi.mock('../components/menu/FilterChipsRow', () => ({ FilterChipsRow: () => null }));
vi.mock('../components/home/OffersRail', () => ({ OffersRail: () => null }));
vi.mock('../components/ItemSheet', () => ({
  ItemSheet: (p: { item: { name: string }; onAddToCart: () => void }) => (
    <button type="button" data-testid="item-sheet-add" onClick={() => p.onAddToCart()}>add {p.item.name}</button>
  ),
}));

function setPhone(on: boolean) {
  window.matchMedia = vi.fn().mockImplementation((q: string) => ({
    matches: on && q.includes('max-width'),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

async function openSalad() {
  render(<MemoryRouter><MenuPage /></MemoryRouter>);
  const card = (await screen.findAllByText('House Salad'))[0];
  fireEvent.click(card);
  fireEvent.click(await screen.findByTestId('item-sheet-add'));
}

/**
 * Owner, 2026-10-07: "If he didn't choose pickup or anything first, when he
 * clicked add to cart button a pop up appears and ask him to select."
 */
describe('MenuPage — the first Add asks how', () => {
  beforeEach(() => {
    localStorage.clear();
    h.showToast.mockClear();
    h.addItem.mockClear();
    h.modeConfirmed = false;
    setPhone(false);
  });

  it('asks first, then adds the dish in the same tap', async () => {
    await openSalad();
    expect(screen.getByTestId('mode-sheet')).toBeInTheDocument();
    expect(h.addItem).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('pick-pickup'));
    await waitFor(() => expect(h.addItem).toHaveBeenCalledTimes(1));
    expect(h.addItem.mock.calls[0][0]).toMatchObject({ name: 'House Salad' });
    expect(screen.queryByTestId('mode-sheet')).toBeNull();
  });

  it('does not add a dish the chosen order type does not sell, and says so', async () => {
    await openSalad();
    fireEvent.click(screen.getByText('pick-delivery'));
    await waitFor(() => expect(h.showToast).toHaveBeenCalledWith(expect.stringContaining('menu.not_for_mode'), 'info'));
    expect(h.addItem).not.toHaveBeenCalled();
  });

  it('still adds the dish when the question is dismissed', async () => {
    await openSalad();
    fireEvent.click(screen.getByText('dismiss'));
    await waitFor(() => expect(h.addItem).toHaveBeenCalledTimes(1));
  });

  it('does not ask once a choice has been made', async () => {
    h.modeConfirmed = true;
    await openSalad();
    expect(screen.queryByTestId('mode-sheet')).toBeNull();
    expect(h.addItem).toHaveBeenCalledTimes(1);
  });
});

/** Owner, 2026-10-07: "Minimize not to a strip. But a small button floats on top." */
describe('MenuPage — the day and order type fold into a button on a phone', () => {
  afterEach(() => setPhone(false));

  it('puts the button at the head of the rail and drops the full bar down from it', async () => {
    setPhone(true);
    h.modeConfirmed = false;
    render(<MemoryRouter><MenuPage /></MemoryRouter>);
    const btn = await screen.findByTestId('rail-order-btn');
    // Nothing chosen yet: it asks.
    expect(btn).toHaveClass('is-unset');
    expect(btn).toHaveTextContent('menu.choose_mode_short');
    // Not pinned on a phone.
    expect(screen.getByTestId('menu-sticky-controls').style.position).toBe('relative');

    fireEvent.click(btn);
    expect(screen.getByTestId('menu-sticky-controls')).toHaveClass('is-dropped');
    fireEvent.click(screen.getByTestId('menu-bar-scrim'));
    await waitFor(() => expect(screen.getByTestId('menu-sticky-controls')).not.toHaveClass('is-dropped'));
  });

  it('keeps the bar pinned on a computer, with no button', async () => {
    setPhone(false);
    render(<MemoryRouter><MenuPage /></MemoryRouter>);
    await screen.findAllByText('House Salad');
    expect(screen.queryByTestId('rail-order-btn')).toBeNull();
    expect(screen.getByTestId('menu-sticky-controls').style.position).toBe('sticky');
  });
});
