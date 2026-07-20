import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CateringPage } from '../pages/CateringPage';
import * as cateringApi from '../api/catering';

vi.mock('../hooks/usePageTitle', () => ({ usePageTitle: () => {} }));

describe('CateringPage pipeline', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(cateringApi, 'fetchCateringRequests').mockResolvedValue({
      data: [
        {
          id: 7,
          company: null,
          occasion: 'event',
          contact_name: 'Aisha',
          phone: '7777001',
          email: null,
          event_date: '2026-08-01',
          headcount: 20,
          notes: null,
          interested_items: [],
          interested_item_names: [],
          lines_count: 2,
          custom_lines_count: 1,
          staff_notes: null,
          quoted_amount: null,
          pos_order_id: null,
          handled_by: 3,
          handled_by_name: 'Event Lead',
          contacted_at: null,
          quoted_at: null,
          confirmed_at: null,
          status: 'draft',
          source: 'event_order',
          created_at: '2026-07-20T10:00:00Z',
          reference: 'EV-20260720-ABCD',
          has_live_quote: false,
        },
      ],
      meta: { current_page: 1, last_page: 1, total: 1 },
    });
  });

  it('searches by name/phone and filters assigned to me', async () => {
    render(
      <MemoryRouter>
        <CateringPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText(/EV-20260720-ABCD/)).toBeTruthy();
    });

    fireEvent.change(screen.getByTestId('pipeline-search'), { target: { value: '7777001' } });
    fireEvent.click(screen.getByText('Search'));

    await waitFor(() => {
      expect(cateringApi.fetchCateringRequests).toHaveBeenCalledWith(
        expect.objectContaining({ q: '7777001', assigned_to_me: false }),
      );
    });

    fireEvent.click(screen.getByTestId('assigned-to-me'));

    await waitFor(() => {
      expect(cateringApi.fetchCateringRequests).toHaveBeenCalledWith(
        expect.objectContaining({ assigned_to_me: true }),
      );
    });

    expect(screen.getByTestId('catering-row-7').getAttribute('href')).toBe('/catering/7');
  });
});
