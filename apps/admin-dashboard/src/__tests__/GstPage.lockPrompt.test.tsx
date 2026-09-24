import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ApiRequestError } from '@shared/api';
import GstPage from '../pages/GstPage';
import * as gstApi from '../api/gst';

/*
 * GST audit, 2026-09-26: locking is filing. With open warnings the server
 * asks for a reason; the page shows the warnings and sends the reason.
 */
describe('GstPage lock prompt', () => {
  const summary = {
    period: '2026-08', business_tin: 'T', taxable_activity_no: 'A',
    net_gst_payable_laar: 0, gst_on_standard_sales_laar: 0,
    claimable_input_revenue_laar: 0, claimable_input_capital_laar: 0,
    credit_note_refund_adjustments_laar: 0, standard_rated_sales_ex_gst_laar: 0,
    warnings: [], locked: false, counts: {},
  };
  const settings = {
    gst_registered: true, seller_name: null, seller_address: null, seller_tin: 'T', taxable_activity_no: 'A',
    sector: 'general', default_tax_rate_bp: 800, tax_inclusive: true, taxable_period: 'monthly',
    accounting_basis: 'hybrid', currency: 'MVR', invoice_prefix: 'TI', credit_note_prefix: 'CN',
    invoice_sequence_mode: 'yearly', next_invoice_sequence: 1, next_credit_note_sequence: 1,
    lock_after_export: false, filing_due_day: 28, filing_reminder_days: 3,
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(gstApi, 'getGstSummary').mockResolvedValue(summary as never);
    vi.spyOn(gstApi, 'getGstSettings').mockResolvedValue({ settings } as never);
    vi.spyOn(gstApi, 'getGstReconciliation').mockResolvedValue({ period: '2026-08', warnings: [] });
  });

  it('shows the warnings and locks with a reason', async () => {
    const lock = vi.spyOn(gstApi, 'lockGstPeriod')
      .mockRejectedValueOnce(new ApiRequestError('This period has 1 warning.', 422, {
        needs_reason: true,
        message: 'This period has 1 warning. Fix it, or give a reason to lock anyway.',
        warnings: [{ type: 'unposted_refund', message: 'Refund #7 on order #BG-1 has no GST entry, so its tax is still declared.' }],
      }))
      .mockResolvedValueOnce({ message: 'Period locked.' });

    render(<MemoryRouter><GstPage /></MemoryRouter>);
    fireEvent.click(await screen.findByText('Lock period'));

    expect(await screen.findByTestId('gst-lock-prompt')).toBeTruthy();
    expect(screen.getByText(/Refund #7 on order #BG-1/)).toBeTruthy();

    const anyway = screen.getByText('Lock anyway').closest('button') as HTMLButtonElement;
    expect(anyway.disabled).toBe(true);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Refund posted by hand in the return' } });
    expect(anyway.disabled).toBe(false);
    fireEvent.click(anyway);

    await waitFor(() => expect(lock).toHaveBeenLastCalledWith(expect.any(String), 'Refund posted by hand in the return'));
    await waitFor(() => expect(screen.queryByTestId('gst-lock-prompt')).toBeNull());
  });

  it('saves the filing reminder settings', async () => {
    const update = vi.spyOn(gstApi, 'updateGstSettings').mockResolvedValue({ settings, message: 'ok' } as never);
    render(<MemoryRouter><GstPage /></MemoryRouter>);
    fireEvent.click(await screen.findByText('Settings'));

    fireEvent.change(await screen.findByLabelText('Remind owners, days before'), { target: { value: '5' } });
    fireEvent.change(screen.getByLabelText('Return due on day'), { target: { value: '20' } });
    fireEvent.click(screen.getByText('Save settings'));

    await waitFor(() => expect(update).toHaveBeenCalledWith(expect.objectContaining({ filing_due_day: 20, filing_reminder_days: 5 })));
  });
});
