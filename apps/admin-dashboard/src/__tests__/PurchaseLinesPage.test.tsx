import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import PurchaseLinesPage, { boughtAs } from '../pages/PurchaseLinesPage';

/*
 * Owner, 2026-09-16: "where i can see all the items purchased from a
 * specific store and specific brand?" One table of every line bought; the
 * boxes under Shop and Brand narrow it, and the total follows.
 */

vi.mock('../hooks/usePageTitle', () => ({ usePageTitle: () => {} }));
vi.mock('../hooks/useIsMobile', () => ({ useIsMobile: () => false }));

const getPurchaseLines = vi.fn();
vi.mock('../api', () => ({
  getPurchaseLines: (...a: unknown[]) => getPurchaseLines(...a),
}));

const line = (over: Partial<Parameters<typeof boughtAs>[0]>) => ({
  id: 1, purchase_id: 1, purchase_number: 'PO-1', purchase_date: '2026-09-10', status: 'received',
  supplier_id: 1, supplier: 'Bazaaru', item_id: 1, item: 'Dark soya sauce', unit: 'ml',
  brand: 'Elephant', pack_name: 'Bottle 640 ml', pack_size: 640, pack_quantity: 2,
  quantity: 1280, received_quantity: 1280, unit_cost: 0.0703125, pack_cost: 45, line_total: 90, gst_rate_bp: 0,
  ...over,
});

const LINES = [
  line({ id: 1 }),
  line({ id: 2, purchase_id: 2, purchase_number: 'PO-2', supplier: 'Redwave', brand: 'Lee Kum Kee', pack_name: null, pack_quantity: null, pack_cost: null, quantity: 1000, unit_cost: 0.05, line_total: 50 }),
  line({ id: 3, purchase_id: 3, purchase_number: 'PO-3', item: 'Flour', unit: 'kg', brand: null, pack_name: null, pack_quantity: null, pack_cost: null, quantity: 10, unit_cost: 12, line_total: 120 }),
];

const rows = () => screen.getAllByRole('row').filter((r) => r.closest('tbody')).map((r) => r.querySelector('td:nth-child(4)')?.textContent);

describe('Purchase lines', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    getPurchaseLines.mockResolvedValue({ lines: LINES, window: { from: '2026-06-18', to: '2026-09-16' }, truncated: false });
  });

  it('lists every line with its shop, brand, pack and price, and adds them up', async () => {
    render(<MemoryRouter><PurchaseLinesPage /></MemoryRouter>);
    await screen.findByTestId('purchase-line-1');

    expect(rows()).toEqual(['Dark soya sauce', 'Dark soya sauce', 'Flour']);
    const first = screen.getByTestId('purchase-line-1');
    expect(first).toHaveTextContent('Bazaaru');
    expect(first).toHaveTextContent('Elephant');
    expect(first).toHaveTextContent('2 × Bottle 640 ml');
    expect(first).toHaveTextContent('= 1280 ml');
    expect(first).toHaveTextContent('MVR 45.00');
    expect(first).toHaveTextContent('MVR 90.00');

    const summary = screen.getByTestId('purchase-lines-summary');
    expect(summary).toHaveTextContent('MVR 260.00');
    expect(summary).toHaveTextContent('3');
  });

  it('narrows by shop and by brand from the boxes under the headings, and the total follows', async () => {
    render(<MemoryRouter><PurchaseLinesPage /></MemoryRouter>);
    await screen.findByTestId('purchase-line-1');

    const shop = screen.getByTestId('purchase-lines-filter-shop');
    expect(within(shop).getAllByRole('option').map((o) => o.textContent)).toEqual(['All', 'Bazaaru', 'Redwave']);
    fireEvent.change(shop, { target: { value: 'Bazaaru' } });
    expect(rows()).toEqual(['Dark soya sauce', 'Flour']);
    expect(screen.getByTestId('purchase-lines-summary')).toHaveTextContent('MVR 210.00');

    fireEvent.change(screen.getByTestId('purchase-lines-filter-brand'), { target: { value: 'Elephant' } });
    expect(rows()).toEqual(['Dark soya sauce']);
    expect(screen.getByTestId('purchase-lines-summary')).toHaveTextContent('MVR 90.00');
    expect(screen.getByTestId('purchase-lines-summary')).toHaveTextContent('Total of what is shown');
  });

  it('asks the server for a wider window when told to look back further', async () => {
    render(<MemoryRouter><PurchaseLinesPage /></MemoryRouter>);
    await screen.findByTestId('purchase-line-1');
    expect(getPurchaseLines).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId('purchase-lines-window-0'));
    await screen.findByTestId('purchase-line-1');
    expect(getPurchaseLines).toHaveBeenCalledTimes(2);
    expect(getPurchaseLines.mock.calls[1][0]).toMatchObject({ from: '2000-01-01' });
  });

  it('takes any two dates, and a typed date is its own window rather than a preset', async () => {
    render(<MemoryRouter><PurchaseLinesPage /></MemoryRouter>);
    await screen.findByTestId('purchase-line-1');

    fireEvent.change(screen.getByTestId('purchase-lines-from'), { target: { value: '2026-08-01' } });
    await screen.findByTestId('purchase-line-1');
    fireEvent.change(screen.getByTestId('purchase-lines-to'), { target: { value: '2026-08-31' } });
    await screen.findByTestId('purchase-line-1');

    const last = getPurchaseLines.mock.calls[getPurchaseLines.mock.calls.length - 1][0];
    expect(last).toEqual({ from: '2026-08-01', to: '2026-08-31' });
    // No preset lights up for a hand-picked window.
    for (const d of [30, 90, 365, 0]) {
      expect(screen.getByTestId(`purchase-lines-window-${d}`)).toHaveAttribute('aria-pressed', 'false');
    }
    fireEvent.click(screen.getByTestId('purchase-lines-window-30'));
    expect(screen.getByTestId('purchase-lines-window-30')).toHaveAttribute('aria-pressed', 'true');
  });

  it('says what a line was bought as', () => {
    expect(boughtAs(LINES[0])).toBe('2 × Bottle 640 ml');
    expect(boughtAs(LINES[1])).toBe('1000 ml');
  });
});
