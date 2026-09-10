import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { RecordCard, RecordCardList } from '../components/RecordCard';
import PrintJobsPage from '../pages/PrintJobsPage';

/*
 * Layout audit, 2026-09-10 (L-01). Orders, Print Jobs, Customers and Supplier
 * Intelligence rendered seven to nine columns and nothing else, while four
 * other list pages already switched to cards at the same width. Same product,
 * two behaviours, depending on which page you opened.
 */

vi.mock('../hooks/usePageTitle', () => ({ usePageTitle: () => {} }));
vi.mock('../hooks/usePermissions', () => ({
  useCurrentUserPermissions: () => ({ can: () => true, loading: false, user: null }),
}));
vi.mock('../api', () => ({
  fetchPrintJobs: vi.fn().mockResolvedValue({
    data: [{
      id: 7, order_id: 3, order_number: '1042', type: 'receipt', printer_name: 'Front',
      status: 'failed', copies: 1, error_message: 'offline', retry_count: 2,
      created_at: '2026-09-09T10:00:00Z', printed_at: null,
    }],
    meta: { current_page: 1, last_page: 1, total: 1 },
  }),
  retryPrintJob: vi.fn(),
}));

/** Pretend the viewport is a phone, the way useIsMobile reads it. */
function setViewport(mobile: boolean) {
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: mobile && q.includes('max-width: 767px'),
    media: q,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    onchange: null,
    dispatchEvent: () => false,
  }));
}

describe('RecordCard, the shared phone row', () => {
  it('drops a field that has nothing in it rather than printing a gap', () => {
    render(
      <RecordCard
        testId="c1"
        title="Ghee"
        fields={[
          { label: 'Total', value: 'MVR 60.00' },
          null,
          false,
          { label: 'Stock', value: '0 ml' },
        ]}
      />,
    );

    const card = screen.getByTestId('c1');
    expect(within(card).getByText('Total')).toBeInTheDocument();
    expect(within(card).getByText('Stock')).toBeInTheDocument();
    // Two labels, not four slots with two blanks.
    expect(within(card).getAllByText(/^(Total|Stock)$/)).toHaveLength(2);
  });

  it('leaves out the subtitle, badge and actions when there are none', () => {
    render(<RecordCard testId="c2" title="Plain" />);

    const card = screen.getByTestId('c2');
    expect(card.textContent).toBe('Plain');
  });

  it('is only clickable when something happens on click', () => {
    const { rerender } = render(<RecordCard testId="c3" title="Inert" />);
    expect(screen.getByTestId('c3')).not.toHaveStyle({ cursor: 'pointer' });

    rerender(<RecordCard testId="c3" title="Live" onClick={() => {}} />);
    expect(screen.getByTestId('c3')).toHaveStyle({ cursor: 'pointer' });
  });

  it('keeps a long name from pushing the badge off the card', () => {
    render(
      <RecordCardList testId="list">
        <RecordCard testId="c4" title={'Aminath '.repeat(12)} badge={<span>paid</span>} />
      </RecordCardList>,
    );

    // The name column has to be allowed to shrink; without minWidth:0 a long
    // unbroken run of text blows the flex row out sideways.
    const title = screen.getByTestId('c4').querySelector('div > div') as HTMLElement;
    expect(title).toHaveStyle({ minWidth: '0px' });
  });
});

describe('The four pages that had no phone layout', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.unstubAllGlobals());

  /*
   * A narrow render reaches for cards and paints no nine-column table; a wide
   * one still gets the table. Both directions, because a card list that also
   * renders the table has fixed nothing.
   */
  it('Print Jobs shows cards on a phone', async () => {
    setViewport(true);
    render(<MemoryRouter><PrintJobsPage /></MemoryRouter>);

    expect(await screen.findByTestId('print-job-cards')).toBeInTheDocument();
    expect(await screen.findByTestId('print-job-card-7')).toHaveTextContent('offline');
    expect(document.querySelector('table')).toBeNull();
  });

  it('Print Jobs still shows the table on the desk', async () => {
    setViewport(false);
    render(<MemoryRouter><PrintJobsPage /></MemoryRouter>);

    expect(await screen.findByText('Printer')).toBeInTheDocument();
    expect(document.querySelector('table')).not.toBeNull();
    expect(screen.queryByTestId('print-job-cards')).toBeNull();
  });
});
