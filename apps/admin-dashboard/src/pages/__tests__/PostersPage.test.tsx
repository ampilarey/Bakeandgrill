import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * Posters review, 2026-10-17: the print file is made on the queue, so Download
 * for print waits for it before downloading (it used to ask at once and get
 * "Not ready yet"), says so when it takes long, and the page offers mounting
 * and a poster photo kept sharper than the menu's.
 */
const api = vi.hoisted(() => ({
  fetchPosterCatalog: vi.fn(), fetchPosterLookups: vi.fn(), fetchPrintShops: vi.fn(), previewPoster: vi.fn(),
  createPoster: vi.fn(), updatePoster: vi.fn(), exportPoster: vi.fn(), fetchPosterExport: vi.fn(), downloadPosterZip: vi.fn(),
  uploadPosterPhoto: vi.fn(), sendPosterToShop: vi.fn(),
}));
vi.mock('../../api', () => api);
vi.mock('../../hooks/usePermissions', () => ({ useCurrentUserPermissions: () => ({ can: () => true, user: null, loading: false }) }));
vi.mock('../../hooks/usePageTitle', () => ({ usePageTitle: () => undefined }));

import { PostersPage } from '../PostersPage';

const purpose = { key: 'plain_notice', label: 'Plain notice', group: 'Inside', layout: 'notice', bind: 'none', landscape: false, external: null, slots: { headline: 'Open' }, used: 0 };

describe('PostersPage', () => {
  beforeEach(() => {
    Object.values(api).forEach((f) => f.mockReset());
    api.fetchPosterCatalog.mockResolvedValue({ purposes: [purpose], layouts: ['notice'], moods: ['dark'], sizes: ['A5', 'A4'], places: ['Window'], materials: [{ key: 'foam', label: 'Foam board', white: false }] });
    api.fetchPosterLookups.mockResolvedValue({ items: [], promotions: [], categories: [], tables: [] });
    api.fetchPrintShops.mockResolvedValue({ shops: [], proof_approval: false });
    api.previewPoster.mockResolvedValue({ content: { photo_source: 'crop' }, sheet: { w: 154, h: 216, hex_bg: '#000', pieces: [] }, preflight: [{ id: 'fit', level: 'ok', message: 'Everything fits.' }], imposition: 'One per page' });
    api.createPoster.mockResolvedValue({ id: 9 });
    api.updatePoster.mockResolvedValue({ id: 9 });
    api.downloadPosterZip.mockResolvedValue(new Blob(['zip']));
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
  });
  afterEach(() => vi.useRealTimers());

  async function toStepThree() {
    render(<MemoryRouter><PostersPage /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: /Plain notice/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Check and download' }));
    await waitFor(() => expect(api.previewPoster).toHaveBeenCalled());
  }

  it('waits for a queued file, then downloads it', async () => {
    api.exportPoster.mockResolvedValue({ id: 4, status: 'queued' });
    api.fetchPosterExport.mockResolvedValueOnce({ id: 4, status: 'queued' }).mockResolvedValueOnce({ id: 4, status: 'ready' });
    await toStepThree();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    fireEvent.click(screen.getByRole('button', { name: /Download for print/ }));
    await act(async () => { await vi.advanceTimersByTimeAsync(4500); });
    await waitFor(() => expect(api.downloadPosterZip).toHaveBeenCalledWith(4));
    expect(api.fetchPosterExport).toHaveBeenCalledTimes(2);
    expect(await screen.findByText(/ZIP downloaded/)).toBeInTheDocument();
  });

  it('says a failed file instead of downloading', async () => {
    api.exportPoster.mockResolvedValue({ id: 5, status: 'failed', error: 'Preflight failed. Fix the red checks and try again.' });
    await toStepThree();
    fireEvent.click(screen.getByRole('button', { name: /Download for print/ }));
    expect(await screen.findByText('Preflight failed. Fix the red checks and try again.')).toBeInTheDocument();
    expect(api.downloadPosterZip).not.toHaveBeenCalled();
  });

  it('sends the mounting with the preview and offers a poster photo', async () => {
    await toStepThree();
    expect(await screen.findByText(/Only the dish's small website photo/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Mounting'), { target: { value: 'standoffs' } });
    await waitFor(() => expect(api.previewPoster).toHaveBeenLastCalledWith(expect.objectContaining({ mounting: 'standoffs' })));
    expect(await screen.findAllByTestId('poster-keepout')).toHaveLength(4);

    api.uploadPosterPhoto.mockResolvedValue({ photo_path: 'posters/photos/abc.jpg', width: 4800, height: 3200 });
    const file = new File(['x'], 'big.jpg', { type: 'image/jpeg' });
    fireEvent.change(screen.getByLabelText(/Poster photo/), { target: { files: [file] } });
    await waitFor(() => expect(api.previewPoster).toHaveBeenLastCalledWith(expect.objectContaining({ slots: expect.objectContaining({ photo_path: 'posters/photos/abc.jpg' }) })));
  });
});
