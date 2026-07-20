import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { CateringDetailPage } from '../pages/CateringDetailPage';
import * as cateringApi from '../api/catering';

vi.mock('../hooks/usePageTitle', () => ({ usePageTitle: () => {} }));
vi.mock('../components/ItemSearch', () => ({
  ItemSearch: () => <div data-testid="item-search" />,
}));

const baseRequest = {
  id: 9,
  company: null,
  occasion: 'event' as const,
  contact_name: 'Aisha',
  phone: '7777001',
  email: 'aisha@example.com',
  event_date: '2026-08-10',
  fulfillment_method: 'pickup',
  headcount: 25,
  notes: null,
  dietary_notes: 'No nuts',
  interested_items: [],
  interested_item_names: [],
  lines_count: 2,
  custom_lines_count: 1,
  lines: [
    {
      id: 1,
      item_id: 5,
      name: 'Party Tray',
      quantity: 2,
      unit_price: 100,
      notes: null,
      is_custom: false,
      price_needs_review: false,
    },
    {
      id: 2,
      item_id: null,
      name: 'Extra chutney',
      quantity: 1,
      unit_price: 12,
      notes: null,
      is_custom: true,
      price_needs_review: true,
    },
  ],
  staff_notes: null,
  quoted_amount: 212,
  tax_preview: { subtotal_laar: 21200, tax_laar: 1696, total_laar: 22896, tax_inclusive: false },
  assignees: [
    { id: 3, name: 'Event Lead' },
    { id: 4, name: 'Event Helper' },
  ],
  pos_order_id: null,
  handled_by: null,
  contacted_at: null,
  quoted_at: null,
  confirmed_at: null,
  status: 'draft',
  source: 'event_order',
  created_at: '2026-07-20T10:00:00Z',
  reference: 'EV-20260720-ZZZZ',
  quote_version: 1,
  has_live_quote: false,
};

describe('CateringDetailPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(cateringApi, 'fetchCateringRequest').mockResolvedValue({ request: { ...baseRequest } });
    vi.spyOn(cateringApi, 'updateCateringRequest').mockImplementation(async (_id, payload) => ({
      request: { ...baseRequest, ...payload, handled_by: (payload.handled_by as number | null) ?? null },
    }));
    vi.spyOn(cateringApi, 'replaceCateringLines').mockResolvedValue({ request: { ...baseRequest } });
    vi.spyOn(cateringApi, 'sendCateringQuote').mockResolvedValue({
      request: { ...baseRequest, status: 'awaiting_customer', has_live_quote: true, quote_version: 1 },
    });
    vi.spyOn(cateringApi, 'duplicateCateringRequest').mockResolvedValue({
      request: {
        ...baseRequest,
        id: 99,
        reference: 'EV-20260720-COPY',
        lines: baseRequest.lines.map((l) => ({
          ...l,
          price_needs_review: l.is_custom,
        })),
      },
    });
  });

  it('shows assignee dropdown, review badge, and clears badge on price edit', async () => {
    render(
      <MemoryRouter initialEntries={['/catering/9']}>
        <Routes>
          <Route path="/catering/:id" element={<CateringDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('EV-20260720-ZZZZ')).toBeTruthy();
    });

    expect(screen.getByTestId('assignee-select')).toBeTruthy();
    expect(screen.getByTestId('price-review-badge')).toBeTruthy();

    fireEvent.change(screen.getByTestId('custom-price-input'), { target: { value: '15' } });
    expect(screen.queryByTestId('price-review-badge')).toBeNull();

    fireEvent.change(screen.getByTestId('assignee-select'), { target: { value: '3' } });
    await waitFor(() => {
      expect(cateringApi.updateCateringRequest).toHaveBeenCalledWith(9, { handled_by: 3 });
    });
  });

  it('duplicate button calls API', async () => {
    render(
      <MemoryRouter initialEntries={['/catering/9']}>
        <Routes>
          <Route path="/catering/:id" element={<CateringDetailPage />} />
          <Route path="/catering/:id" element={<CateringDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByText('Duplicate event')).toBeTruthy());
    fireEvent.click(screen.getByText('Duplicate event'));

    await waitFor(() => {
      expect(cateringApi.duplicateCateringRequest).toHaveBeenCalledWith(9);
    });
  });
});
