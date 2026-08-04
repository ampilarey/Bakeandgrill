import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import GstPage from '../pages/GstPage';
import * as gstApi from '../api/gst';

describe('GstPage load failure', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders an error state instead of an empty shell when load fails', async () => {
    vi.spyOn(gstApi, 'getGstSummary').mockRejectedValue(new Error('GST API unavailable'));
    vi.spyOn(gstApi, 'getGstSettings').mockRejectedValue(new Error('GST API unavailable'));
    vi.spyOn(gstApi, 'getGstReconciliation').mockRejectedValue(new Error('GST API unavailable'));

    render(
      <MemoryRouter>
        <GstPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('gst-load-error')).toBeTruthy();
    });
    expect(screen.getByText(/Could not load GST data/i)).toBeTruthy();
    expect(screen.getByText(/GST API unavailable/)).toBeTruthy();
    // Must not look like a successful empty dashboard.
    expect(screen.queryByText('Net GST payable')).toBeNull();
    expect(screen.queryByText('Export summary CSV')).toBeNull();
  });
});
