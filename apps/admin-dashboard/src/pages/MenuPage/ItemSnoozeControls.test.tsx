import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ItemSnoozeControls, inferSnoozeUntil } from './ItemSnoozeControls';

describe('inferSnoozeUntil', () => {
  it('maps indefinite (unavailable, no snooze timestamp) to indefinite', () => {
    expect(inferSnoozeUntil(null, false)).toBe('indefinite');
  });

  it('defaults timed / available states to end_of_day for the picker', () => {
    expect(inferSnoozeUntil(null, true)).toBe('end_of_day');
    const future = new Date(Date.now() + 3600_000).toISOString();
    expect(inferSnoozeUntil(future, true)).toBe('end_of_day');
  });
});

describe('ItemSnoozeControls', () => {
  it('shows Indefinite in the duration select when the item is indefinitely unavailable', () => {
    render(
      <ItemSnoozeControls
        canManage
        isAvailable={false}
        snoozedUntil={null}
        onSnooze={vi.fn()}
      />,
    );
    expect(screen.getByText('Unavailable (indefinite)')).toBeInTheDocument();
    expect(screen.getByTestId('item-snooze-until')).toHaveValue('indefinite');
  });

  it('keeps Indefinite selected after Apply snooze returns indefinitely off', async () => {
    const onSnooze = vi.fn().mockResolvedValue({ is_available: false, snoozed_until: null });
    const { rerender } = render(
      <ItemSnoozeControls
        canManage
        isAvailable
        snoozedUntil={null}
        onSnooze={onSnooze}
      />,
    );

    fireEvent.change(screen.getByTestId('item-snooze-until'), { target: { value: 'indefinite' } });
    fireEvent.click(screen.getByRole('button', { name: /Apply snooze/i }));
    await waitFor(() => {
      expect(onSnooze).toHaveBeenCalledWith('indefinite', expect.any(Object));
    });
    await waitFor(() => {
      expect(screen.getByTestId('item-snooze-saved')).toBeInTheDocument();
    });

    rerender(
      <ItemSnoozeControls
        canManage
        isAvailable={false}
        snoozedUntil={null}
        onSnooze={onSnooze}
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId('item-snooze-until')).toHaveValue('indefinite');
    });
    expect(screen.getByText('Unavailable (indefinite)')).toBeInTheDocument();
  });

  it('surfaces API permission errors instead of failing silently', async () => {
    const onSnooze = vi.fn().mockRejectedValue(new Error('You do not have permission to perform this action.'));
    render(
      <ItemSnoozeControls
        canManage
        isAvailable
        snoozedUntil={null}
        onSnooze={onSnooze}
      />,
    );

    fireEvent.change(screen.getByTestId('item-snooze-until'), { target: { value: 'indefinite' } });
    fireEvent.click(screen.getByRole('button', { name: /Apply snooze/i }));
    await waitFor(() => {
      expect(screen.getByText(/do not have permission/i)).toBeInTheDocument();
    });
  });
});
