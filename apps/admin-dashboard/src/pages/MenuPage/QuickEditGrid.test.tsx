import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MenuItem } from '../../api';
import { QuickEditGrid } from './QuickEditGrid';

const bulkUpdateItems = vi.fn();

vi.mock('../../api', async () => {
  const actual = await vi.importActual<typeof import('../../api')>('../../api');
  return {
    ...actual,
    bulkUpdateItems: (...args: unknown[]) => bulkUpdateItems(...args),
  };
});

function item(over: Partial<MenuItem> = {}): MenuItem {
  return {
    id: 1,
    name: 'Bajiya',
    base_price: 10,
    is_available: true,
    is_active: true,
    category_id: 1,
    tax_code: 'standard_8',
    sort_order: 0,
    ...over,
  } as MenuItem;
}

const items = [
  item({ id: 1, name: 'Bajiya', base_price: 10 }),
  item({ id: 2, name: 'Gulha', base_price: 20 }),
];

function renderGrid(over: Partial<Parameters<typeof QuickEditGrid>[0]> = {}) {
  const onSaved = vi.fn();
  render(
    <QuickEditGrid
      items={items}
      categories={[{ id: 1, name: 'Snacks', is_active: true }, { id: 2, name: 'Grill', is_active: true }]}
      menuGroups={[{ id: 1, name: 'Evening', slug: 'evening', sort_order: 0, is_active: true }]}
      loading={false}
      canSeeCost
      onSaved={onSaved}
      onExit={() => {}}
      {...over}
    />,
  );

  return { onSaved };
}

beforeEach(() => {
  bulkUpdateItems.mockReset();
  bulkUpdateItems.mockResolvedValue({ message: '1 item updated.', updated: 1, unchanged: 0, items: [] });
});

describe('QuickEditGrid editing', () => {
  it('sends only the cell that was changed', async () => {
    renderGrid();

    const price = screen.getByLabelText('Price for Bajiya');
    fireEvent.change(price, { target: { value: '12' } });
    fireEvent.click(screen.getByRole('button', { name: /^Save/ }));

    await waitFor(() => expect(bulkUpdateItems).toHaveBeenCalledTimes(1));
    expect(bulkUpdateItems).toHaveBeenCalledWith([{ id: 1, fields: { base_price: 12 } }]);
  });

  it('does not count a cell typed back to its original value', async () => {
    renderGrid();

    const price = screen.getByLabelText('Price for Bajiya');
    fireEvent.change(price, { target: { value: '99' } });
    expect(screen.getByTestId('quick-edit-dirty')).toHaveTextContent('1 unsaved change');

    fireEvent.change(price, { target: { value: '10' } });

    expect(screen.getByTestId('quick-edit-dirty')).toHaveTextContent('No unsaved changes');
    expect(screen.getByRole('button', { name: /^Save/ })).toBeDisabled();
  });

  it('discards pending edits without calling the server', async () => {
    renderGrid();

    fireEvent.change(screen.getByLabelText('Price for Bajiya'), { target: { value: '12' } });
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));

    expect(screen.getByTestId('quick-edit-dirty')).toHaveTextContent('No unsaved changes');
    expect(bulkUpdateItems).not.toHaveBeenCalled();
  });

  it('hides the cost column from anyone without recipes.manage', () => {
    renderGrid({ canSeeCost: false });

    expect(screen.queryByLabelText('Cost for Bajiya')).toBeNull();
    expect(screen.getByLabelText('Price for Bajiya')).toBeInTheDocument();
  });
});

describe('QuickEditGrid bulk apply', () => {
  function selectBoth() {
    fireEvent.click(screen.getByLabelText('Select Bajiya'));
    fireEvent.click(screen.getByLabelText('Select Gulha'));
  }

  it('previews every affected row before anything is staged', async () => {
    renderGrid();
    selectBoth();

    fireEvent.click(screen.getByRole('button', { name: /Preview price change/ }));

    const preview = within(screen.getByTestId('bulk-preview'));
    expect(preview.getByText(/2 of 2 selected items would change/)).toBeInTheDocument();
    // 10 → 11 and 20 → 22 at the default +10%.
    expect(preview.getByText('11.00')).toBeInTheDocument();
    expect(preview.getByText('22.00')).toBeInTheDocument();
    // Still nothing pending until it is staged.
    expect(screen.getByTestId('quick-edit-dirty')).toHaveTextContent('No unsaved changes');
  });

  it('staging fills the cells but still does not save', async () => {
    renderGrid();
    selectBoth();
    fireEvent.click(screen.getByRole('button', { name: /Preview price change/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Stage 2 changes/ }));

    expect(screen.getByLabelText('Price for Bajiya')).toHaveValue(11);
    expect(screen.getByLabelText('Price for Gulha')).toHaveValue(22);
    expect(screen.getByTestId('quick-edit-dirty')).toHaveTextContent('2 unsaved changes');
    expect(bulkUpdateItems).not.toHaveBeenCalled();
  });

  it('cancelling the preview changes nothing', async () => {
    renderGrid();
    selectBoth();
    fireEvent.click(screen.getByRole('button', { name: /Preview price change/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByTestId('bulk-preview')).toBeNull();
    expect(screen.getByLabelText('Price for Bajiya')).toHaveValue(10);
  });

  it('marks a whole selection sold out', async () => {
    renderGrid();
    selectBoth();

    fireEvent.click(screen.getByRole('button', { name: 'Mark sold out' }));
    fireEvent.click(screen.getByRole('button', { name: /^Stage 2 changes/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Save/ }));

    await waitFor(() => expect(bulkUpdateItems).toHaveBeenCalled());
    expect(bulkUpdateItems).toHaveBeenCalledWith([
      { id: 1, fields: { is_available: false } },
      { id: 2, fields: { is_available: false } },
    ]);
  });

  it('says nothing would change when the action is already true of every row', async () => {
    renderGrid();
    selectBoth();

    fireEvent.click(screen.getByRole('button', { name: 'Mark available' }));

    const preview = within(screen.getByTestId('bulk-preview'));
    expect(preview.getByText('Nothing would change')).toBeInTheDocument();
    expect(preview.getByRole('button', { name: /^Stage 0 changes/ })).toBeDisabled();
  });
});

describe('QuickEditGrid failures', () => {
  it('shows the rejected cell and keeps the edits pending', async () => {
    // The server saves all or nothing, so a failure must leave the grid
    // exactly as the user left it rather than half-clearing.
    const failure = Object.assign(new Error('No changes were saved — 1 of 1 rows need fixing.'), {
      body: { row_errors: { 0: { base_price: ['The base price field must be at least 0.'] } } },
    });
    bulkUpdateItems.mockRejectedValue(failure);
    const { onSaved } = renderGrid();

    fireEvent.change(screen.getByLabelText('Price for Bajiya'), { target: { value: '12' } });
    fireEvent.click(screen.getByRole('button', { name: /^Save/ }));

    await waitFor(() =>
      expect(screen.getByTestId('quick-edit-error')).toHaveTextContent('Nothing was saved'),
    );
    expect(screen.getByText('The base price field must be at least 0.')).toBeInTheDocument();
    expect(screen.getByTestId('quick-edit-dirty')).toHaveTextContent('1 unsaved change');
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('clears the pending edits and reports back on success', async () => {
    const { onSaved } = renderGrid();

    fireEvent.change(screen.getByLabelText('Price for Bajiya'), { target: { value: '12' } });
    fireEvent.click(screen.getByRole('button', { name: /^Save/ }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith('1 item updated.'));
    expect(screen.getByTestId('quick-edit-dirty')).toHaveTextContent('No unsaved changes');
  });
});
