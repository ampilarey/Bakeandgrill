import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Customer360Drawer } from '../components/Customer360Drawer';
import { MediaPicker } from '../components/MediaPicker';

/**
 * A3 — the five things a dialog owes the person using it.
 *
 * The layout audit (2026-09-03) found ten of eleven overlays implementing some
 * subset: Escape but no scroll lock, a portal but no focus trap, aria-modal
 * and nothing else. `Customer360Drawer` — the full customer record, opened
 * mid-conversation at the counter — had none of them.
 *
 * These pin the two that had the least, so the subsets cannot come back.
 */
vi.mock('../api', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('../api');
  return {
    ...actual,
    fetchCustomerSummary: vi.fn().mockResolvedValue({
      profile: { id: 1, name: 'Aisha', phone: '7778888' },
      badges: [],
      orders: [],
    }),
    fetchMediaAssets: vi.fn().mockResolvedValue({ data: [], meta: { current_page: 1, last_page: 1, per_page: 24, total: 0 } }),
    fetchMediaCollections: vi.fn().mockResolvedValue([]),
  };
});

describe('A3 — dialog chrome on the overlays that had none', () => {
  it('closes the customer drawer on Escape', async () => {
    const onClose = vi.fn();
    render(
      <MemoryRouter>
        <Customer360Drawer customerId={1} onClose={onClose} />
      </MemoryRouter>,
    );

    fireEvent.keyDown(document, { key: 'Escape' });

    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('announces the customer drawer as a dialog', () => {
    render(
      <MemoryRouter>
        <Customer360Drawer customerId={1} onClose={vi.fn()} />
      </MemoryRouter>,
    );

    const dialog = screen.getByRole('dialog', { name: /customer 360/i });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
  });

  it('locks the page behind the customer drawer and releases it on close', () => {
    const { unmount } = render(
      <MemoryRouter>
        <Customer360Drawer customerId={1} onClose={vi.fn()} />
      </MemoryRouter>,
    );

    expect(document.body.style.overflow).toBe('hidden');
    unmount();
    expect(document.body.style.overflow).not.toBe('hidden');
  });

  it('closes the media picker on Escape', async () => {
    const onClose = vi.fn();
    render(<MediaPicker open onClose={onClose} onPick={vi.fn()} />);

    fireEvent.keyDown(document, { key: 'Escape' });

    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('locks the page behind the media picker', () => {
    const { unmount } = render(<MediaPicker open onClose={vi.fn()} onPick={vi.fn()} />);

    expect(document.body.style.overflow).toBe('hidden');
    unmount();
    expect(document.body.style.overflow).not.toBe('hidden');
  });

  it('renders a closed media picker as nothing at all', () => {
    render(<MediaPicker open={false} onClose={vi.fn()} onPick={vi.fn()} />);

    expect(screen.queryByTestId('media-picker-modal')).toBeNull();
    expect(document.body.style.overflow).not.toBe('hidden');
  });
});
