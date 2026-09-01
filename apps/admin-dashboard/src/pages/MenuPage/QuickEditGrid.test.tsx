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
      initialItems={items}
      categories={[{ id: 1, name: 'Snacks', is_active: true }, { id: 2, name: 'Grill', is_active: true }]}
      menuGroups={[{ id: 1, name: 'Evening', slug: 'evening', sort_order: 0, is_active: true }]}
      categoryId={null}
      search=""
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
    expect(bulkUpdateItems).toHaveBeenCalledWith([{ id: 1, fields: { base_price: 12 } }], []);
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
    ], []);
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
      body: {
        row_errors: { 0: { base_price: ['The base price field must be at least 0.'] } },
        variant_row_errors: {},
      },
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

describe('QuickEditGrid sizes', () => {
  const sized = item({
    id: 3,
    name: 'Beetle leaf',
    base_price: 20,
    variants: [
      { id: 30, name: 'Full', price: 20, is_active: true, sort_order: 0, consumption_factor: 1 },
      { id: 31, name: 'Half', price: 12, is_active: true, sort_order: 1, consumption_factor: 0.5 },
    ],
  });

  it('folds sizes away until the row is expanded', () => {
    renderGrid({ initialItems: [sized] });

    expect(screen.queryByLabelText('Price for Beetle leaf — Full')).toBeNull();

    fireEvent.click(screen.getByLabelText('Show sizes for Beetle leaf'));

    expect(screen.getByLabelText('Price for Beetle leaf — Full')).toHaveValue(20);
    expect(screen.getByLabelText('Price for Beetle leaf — Half')).toHaveValue(12);
  });

  it('sends a size price in its own list, not the item list', () => {
    renderGrid({ initialItems: [sized] });
    fireEvent.click(screen.getByLabelText('Show sizes for Beetle leaf'));

    fireEvent.change(screen.getByLabelText('Price for Beetle leaf — Half'), { target: { value: '14' } });
    fireEvent.click(screen.getByRole('button', { name: /^Save/ }));

    expect(bulkUpdateItems).toHaveBeenCalledWith([], [{ id: 31, fields: { price: 14 } }]);
  });

  it('edits the consumption factor per size', () => {
    renderGrid({ initialItems: [sized] });
    fireEvent.click(screen.getByLabelText('Show sizes for Beetle leaf'));

    fireEvent.change(screen.getByLabelText('Uses for Beetle leaf — Half'), { target: { value: '0.25' } });
    fireEvent.click(screen.getByRole('button', { name: /^Save/ }));

    expect(bulkUpdateItems).toHaveBeenCalledWith([], [{ id: 31, fields: { consumption_factor: 0.25 } }]);
  });

  it('carries a bulk price rise down to the sizes', () => {
    // The base price is not what a customer pays for a Full or a Half, so a
    // repricing that stopped at the item row would miss the real number.
    renderGrid({ initialItems: [sized] });
    fireEvent.click(screen.getByLabelText('Select Beetle leaf'));
    fireEvent.click(screen.getByRole('button', { name: /Preview price change/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Stage 1 change/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Save/ }));

    expect(bulkUpdateItems).toHaveBeenCalledWith(
      [{ id: 3, fields: { base_price: 22 } }],
      [
        { id: 30, fields: { price: 22 } },
        { id: 31, fields: { price: 13.2 } },
      ],
    );
  });

  it('highlights a rejected size and keeps it pending', async () => {
    bulkUpdateItems.mockRejectedValue(Object.assign(new Error('No changes were saved — 1 of 1 rows need fixing.'), {
      body: { row_errors: {}, variant_row_errors: { 0: { price: ['The price field must be at least 0.'] } } },
    }));
    renderGrid({ initialItems: [sized] });
    fireEvent.click(screen.getByLabelText('Show sizes for Beetle leaf'));

    fireEvent.change(screen.getByLabelText('Price for Beetle leaf — Half'), { target: { value: '14' } });
    fireEvent.click(screen.getByRole('button', { name: /^Save/ }));

    await waitFor(() =>
      expect(screen.getByText('The price field must be at least 0.')).toBeInTheDocument(),
    );
    expect(screen.getByTestId('quick-edit-dirty')).toHaveTextContent('1 unsaved change');
  });
});

describe('QuickEditGrid CSV', () => {
  it('offers an export of everything loaded', () => {
    renderGrid();

    expect(screen.getByTestId('csv-export')).toHaveTextContent('Export CSV (2 items)');
  });

  it('stages an imported file as pending cells rather than saving it', async () => {
    renderGrid();
    const csv = [
      'id,type,item_id,name,name_dv,category,category_id,price,cost,sku,gst,track_stock,stock,consumption_factor,available,active,sort',
      '1,item,,Bajiya,,Snacks,1,13.50,,,standard_8,no,,,yes,yes,0',
    ].join('\r\n');
    const file = new File([csv], 'menu.csv', { type: 'text/csv' });

    fireEvent.change(screen.getByTestId('csv-file'), { target: { files: [file] } });

    await waitFor(() =>
      expect(screen.getByTestId('csv-notice')).toHaveTextContent('1 row from the file differ'),
    );
    expect(screen.getByLabelText('Price for Bajiya')).toHaveValue(13.5);
    expect(bulkUpdateItems).not.toHaveBeenCalled();
  });

  it('says so when the file names rows that are not on screen', async () => {
    renderGrid();
    const csv = [
      'id,type,name,price',
      '9999,item,Ghost dish,50.00',
    ].join('\r\n');

    fireEvent.change(screen.getByTestId('csv-file'), {
      target: { files: [new File([csv], 'menu.csv', { type: 'text/csv' })] },
    });

    await waitFor(() =>
      expect(screen.getByTestId('csv-notice')).toHaveTextContent('importing never creates items'),
    );
    expect(screen.getByTestId('quick-edit-dirty')).toHaveTextContent('No unsaved changes');
  });
});
