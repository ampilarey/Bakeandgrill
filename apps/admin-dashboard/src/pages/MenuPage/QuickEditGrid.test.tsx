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
  const view = render(
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

  return { onSaved, unmount: view.unmount };
}

beforeEach(() => {
  localStorage.clear();
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
    expect(bulkUpdateItems).toHaveBeenCalledWith([{ id: 1, fields: { base_price: 12 } }], [], []);
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

    fireEvent.click(screen.getByRole('button', { name: 'Availability' }));
    fireEvent.click(screen.getByRole('button', { name: 'Mark sold out' }));
    fireEvent.click(screen.getByRole('button', { name: /^Stage 2 changes/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Save/ }));

    await waitFor(() => expect(bulkUpdateItems).toHaveBeenCalled());
    expect(bulkUpdateItems).toHaveBeenCalledWith([
      { id: 1, fields: { is_available: false } },
      { id: 2, fields: { is_available: false } },
    ], [], []);
  });

  it('says nothing would change when the action is already true of every row', async () => {
    renderGrid();
    selectBoth();

    fireEvent.click(screen.getByRole('button', { name: 'Availability' }));
    fireEvent.click(screen.getByRole('button', { name: 'Mark selling today' }));

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
        new_row_errors: {},
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
      { id: 30, name: 'Full', price: 20, is_active: true, is_available: true, sort_order: 0, consumption_factor: 1 },
      { id: 31, name: 'Half', price: 12, is_active: true, is_available: true, sort_order: 1, consumption_factor: 0.5 },
    ],
  });

  it('shows sizes straight away rather than making each be opened', () => {
    // Owner, 2026-09-01: "variant is minimized by default, i have to maximize
    // each variant".
    renderGrid({ initialItems: [sized] });

    expect(screen.getByLabelText('Price for Beetle leaf — Full')).toHaveValue(20);
    expect(screen.getByLabelText('Price for Beetle leaf — Half')).toHaveValue(12);
  });

  it('says what the sizes under a dish add up to', () => {
    // Owner, 2026-09-01: "under selling today, if it has a variant, tick box
    // is there for main name and each variant". Both are real — the dish's is
    // the master — so the dish's cell says what the sizes below it come to.
    renderGrid({ initialItems: [sized] });

    expect(screen.getByTestId('available-summary-3')).toHaveTextContent('2/2 sizes');
    expect(screen.getByTestId('active-summary-3')).toHaveTextContent('2/2 sizes');
  });

  it('counts down as sizes are switched off', () => {
    renderGrid({ initialItems: [sized] });

    fireEvent.click(screen.getByLabelText('Selling today for Beetle leaf — Half'));

    expect(screen.getByTestId('available-summary-3')).toHaveTextContent('1/2 sizes');
  });

  it('calls out a dish left on with every size off', () => {
    // The dish's tick reads as "selling" while nothing under it can be bought.
    const stranded = item({
      id: 4,
      name: 'Water',
      variants: [
        { id: 40, name: 'Large', price: 20, is_active: true, is_available: false, sort_order: 0 },
      ],
    });
    renderGrid({ initialItems: [stranded] });

    expect(screen.getByTestId('available-summary-4')).toHaveTextContent('no sizes selling');
  });

  it('ignores sizes that are off the menu when counting today', () => {
    // A size nobody can order either way should not drag the daily count down.
    const mixed = item({
      id: 5,
      name: 'Tea',
      variants: [
        { id: 50, name: 'Cup', price: 10, is_active: true, is_available: true, sort_order: 0 },
        { id: 51, name: 'Retired', price: 15, is_active: false, is_available: false, sort_order: 1 },
      ],
    });
    renderGrid({ initialItems: [mixed] });

    expect(screen.getByTestId('available-summary-5')).toHaveTextContent('1/1 sizes');
    expect(screen.getByTestId('active-summary-5')).toHaveTextContent('1/2 sizes');
  });

  it('leaves a dish with no sizes alone', () => {
    renderGrid({ initialItems: [item({ id: 6, name: 'Plain' })] });

    expect(screen.queryByTestId('available-summary-6')).toBeNull();
  });

  it('lets one dish be folded away without folding the rest', () => {
    renderGrid({ initialItems: [sized] });

    fireEvent.click(screen.getByLabelText('Hide sizes for Beetle leaf'));
    expect(screen.queryByLabelText('Price for Beetle leaf — Full')).toBeNull();

    fireEvent.click(screen.getByLabelText('Show sizes for Beetle leaf'));
    expect(screen.getByLabelText('Price for Beetle leaf — Full')).toBeInTheDocument();
  });

  it('sends a size price in its own list, not the item list', () => {
    renderGrid({ initialItems: [sized] });

    fireEvent.change(screen.getByLabelText('Price for Beetle leaf — Half'), { target: { value: '14' } });
    fireEvent.click(screen.getByRole('button', { name: /^Save/ }));

    expect(bulkUpdateItems).toHaveBeenCalledWith([], [{ id: 31, fields: { price: 14 } }], []);
  });

  it('marks one size sold out without touching the dish or the other size', () => {
    // Owner, 2026-09-01: availability said "follows item" on a size row —
    // "it should be independent for each variant".
    renderGrid({ initialItems: [sized] });

    fireEvent.click(screen.getByLabelText('Selling today for Beetle leaf — Half'));
    fireEvent.click(screen.getByRole('button', { name: /^Save/ }));

    expect(bulkUpdateItems).toHaveBeenCalledWith([], [{ id: 31, fields: { is_available: false } }], []);
  });

  it('edits the consumption factor per size', () => {
    // "Uses" is an optional column, so turn it on the way a user would.
    localStorage.setItem('menu-quick-edit-columns', JSON.stringify(['name', 'price', 'consumption_factor']));
    renderGrid({ initialItems: [sized] });

    fireEvent.change(screen.getByLabelText('Uses for Beetle leaf — Half'), { target: { value: '0.25' } });
    fireEvent.click(screen.getByRole('button', { name: /^Save/ }));

    expect(bulkUpdateItems).toHaveBeenCalledWith([], [{ id: 31, fields: { consumption_factor: 0.25 } }], []);
  });

  it('reprices the sizes and leaves the dish own dead price alone', () => {
    // A sized dish has no price anybody sees: the menu shows the cheapest
    // size and the till charges the chosen one. Writing base_price would
    // change a number nobody reads.
    renderGrid({ initialItems: [sized] });
    fireEvent.click(screen.getByLabelText('Select Beetle leaf'));
    fireEvent.click(screen.getByRole('button', { name: /Preview price change/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Stage 1 change/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Save/ }));

    expect(bulkUpdateItems).toHaveBeenCalledWith(
      [],
      [
        { id: 30, fields: { price: 22 } },
        { id: 31, fields: { price: 13.2 } },
      ],
      [],
    );
  });

  it('previews the size range rather than a base price', () => {
    renderGrid({ initialItems: [sized] });
    fireEvent.click(screen.getByLabelText('Select Beetle leaf'));
    fireEvent.click(screen.getByRole('button', { name: /Preview price change/ }));

    const preview = within(screen.getByTestId('bulk-preview'));
    expect(preview.getByText('12.00–20.00')).toBeInTheDocument();
    expect(preview.getByText('13.20–22.00')).toBeInTheDocument();
  });

  it('shows the size range read-only on the dish row', () => {
    renderGrid({ initialItems: [sized] });

    expect(screen.getByTestId('price-range-3')).toHaveTextContent('12.00–20.00');
    // No input to type an inert number into.
    expect(screen.queryByLabelText('Price for Beetle leaf')).toBeNull();
  });

  it('highlights a rejected size and keeps it pending', async () => {
    bulkUpdateItems.mockRejectedValue(Object.assign(new Error('No changes were saved — 1 of 1 rows need fixing.'), {
      body: {
        row_errors: {}, new_row_errors: {},
        variant_row_errors: { 0: { price: ['The price field must be at least 0.'] } },
      },
    }));
    renderGrid({ initialItems: [sized] });

    fireEvent.change(screen.getByLabelText('Price for Beetle leaf — Half'), { target: { value: '14' } });
    fireEvent.click(screen.getByRole('button', { name: /^Save/ }));

    await waitFor(() =>
      expect(screen.getByText('The price field must be at least 0.')).toBeInTheDocument(),
    );
    expect(screen.getByTestId('quick-edit-dirty')).toHaveTextContent('1 unsaved change');
  });
});

describe('QuickEditGrid CSV', () => {
  it('offers an export and reports how many rows are on screen', () => {
    renderGrid();

    expect(screen.getByTestId('csv-export')).toHaveTextContent('Export CSV');
    expect(screen.getByTestId('grid-count')).toHaveTextContent('2 items');
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

describe('QuickEditGrid columns, sorting and filtering', () => {
  const menu = [
    item({ id: 1, name: 'Bajiya', base_price: 10, sku: 'BAJ', cost: 4 }),
    item({ id: 2, name: 'Gulha', base_price: 30, sku: 'GUL', cost: 9, is_available: false }),
  ];

  it('hides a column when it is unticked and remembers the choice', () => {
    renderGrid({ initialItems: menu });
    expect(screen.getByLabelText('SKU for Bajiya')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('grid-columns-toggle'));
    fireEvent.click(screen.getByLabelText('Show SKU column'));

    expect(screen.queryByLabelText('SKU for Bajiya')).toBeNull();
    expect(JSON.parse(localStorage.getItem('menu-quick-edit-columns') ?? '[]')).not.toContain('sku');
  });

  it('shows an optional column once it is ticked', () => {
    renderGrid({ initialItems: menu });
    expect(screen.queryByLabelText('Prep min for Bajiya')).toBeNull();

    fireEvent.click(screen.getByTestId('grid-columns-toggle'));
    fireEvent.click(screen.getByLabelText('Show Prep min column'));

    expect(screen.getByLabelText('Prep min for Bajiya')).toBeInTheDocument();
  });

  it('never lets the table be emptied of every column', () => {
    localStorage.setItem('menu-quick-edit-columns', JSON.stringify(['name']));
    renderGrid({ initialItems: menu });

    fireEvent.click(screen.getByTestId('grid-columns-toggle'));
    fireEvent.click(screen.getByLabelText('Show Name column'));

    expect(screen.getByLabelText('Name for Bajiya')).toBeInTheDocument();
  });

  it('sorts by a header through ascending, descending and back', () => {
    renderGrid({ initialItems: menu });
    const order = () => screen.getAllByTestId(/^quick-edit-row-/).map((r) => r.getAttribute('data-testid'));

    fireEvent.click(screen.getByRole('button', { name: 'Sort by Price' }));
    expect(order()).toEqual(['quick-edit-row-1', 'quick-edit-row-2']);

    fireEvent.click(screen.getByRole('button', { name: 'Sort by Price' }));
    expect(order()).toEqual(['quick-edit-row-2', 'quick-edit-row-1']);

    fireEvent.click(screen.getByRole('button', { name: 'Sort by Price' }));
    expect(order()).toEqual(['quick-edit-row-1', 'quick-edit-row-2']);
  });

  it('narrows the table as you search and says how many are shown', () => {
    renderGrid({ initialItems: menu });

    fireEvent.change(screen.getByTestId('grid-search'), { target: { value: 'gulha' } });

    expect(screen.queryByTestId('quick-edit-row-1')).toBeNull();
    expect(screen.getByTestId('quick-edit-row-2')).toBeInTheDocument();
    expect(screen.getByTestId('grid-count')).toHaveTextContent('1 of 2 items');
  });

  it('filters by availability and clears back again', () => {
    renderGrid({ initialItems: menu });

    fireEvent.click(screen.getByTestId('grid-filter-toggle'));
    fireEvent.change(screen.getByLabelText('Filter by availability'), { target: { value: 'sold_out' } });

    expect(screen.queryByTestId('quick-edit-row-1')).toBeNull();
    expect(screen.getByTestId('grid-filter-toggle')).toHaveTextContent('Filters (1)');

    fireEvent.click(screen.getByTestId('grid-clear-filters'));
    expect(screen.getByTestId('quick-edit-row-1')).toBeInTheDocument();
  });

  it('select-all only takes the rows the filter left on screen', () => {
    // A selection that quietly includes hidden rows is how a bulk change
    // reaches items nobody looked at.
    renderGrid({ initialItems: menu });
    fireEvent.change(screen.getByTestId('grid-search'), { target: { value: 'gulha' } });

    fireEvent.click(screen.getByLabelText('Select all rows'));

    expect(screen.getByTestId('quick-edit-selection')).toHaveTextContent('1 selected');
  });
});

describe('QuickEditGrid expand all', () => {
  const sizedMenu = [
    item({
      id: 5, name: 'Beetle leaf', base_price: 20,
      variants: [{ id: 50, name: 'Full', price: 20, is_active: true, sort_order: 0 }],
    }),
    item({
      id: 6, name: 'Tea', base_price: 8,
      variants: [{ id: 60, name: 'Large', price: 10, is_active: true, sort_order: 0 }],
    }),
  ];

  it('closes and reopens every dish at once, and remembers the choice', () => {
    const { unmount } = renderGrid({ initialItems: sizedMenu });
    expect(screen.getByTestId('quick-edit-size-50')).toBeInTheDocument();
    expect(screen.getByTestId('quick-edit-size-60')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('grid-expand-all'));
    expect(screen.queryByTestId('quick-edit-size-50')).toBeNull();

    // The preference survives leaving and coming back.
    unmount();
    renderGrid({ initialItems: sizedMenu });
    expect(screen.queryByTestId('quick-edit-size-50')).toBeNull();

    fireEvent.click(screen.getByTestId('grid-expand-all'));
    expect(screen.getByTestId('quick-edit-size-50')).toBeInTheDocument();
  });

  it('marks a sized dish price as the from price, not the real one', () => {
    renderGrid({ initialItems: sizedMenu });

    expect(screen.getByTestId('quick-edit-row-5')).toHaveTextContent('from');
  });

  it('offers no expander at all on a dish without sizes', () => {
    renderGrid();

    expect(screen.queryByTestId('grid-expand-all')).toBeNull();
    expect(screen.queryByLabelText(/Show sizes for/)).toBeNull();
  });
});

describe('QuickEditGrid extra bulk commands', () => {
  const priced = [
    item({ id: 1, name: 'Bajiya', base_price: 10, cost: 4, effective_cost: 4, sort_order: 7 }),
    item({ id: 2, name: 'Gulha', base_price: 30, cost: 9, effective_cost: 9, sort_order: 9 }),
  ];

  function selectAll() {
    fireEvent.click(screen.getByLabelText('Select all rows'));
  }

  it('prices a selection to a target margin from its cost', () => {
    renderGrid({ initialItems: priced });
    selectAll();

    fireEvent.change(screen.getByLabelText('Target margin'), { target: { value: '50' } });
    fireEvent.click(screen.getByRole('button', { name: /Preview margin pricing/ }));

    const preview = within(screen.getByTestId('bulk-preview'));
    // cost 4 at 50% margin is 8.00; cost 9 is 18.00.
    expect(preview.getByText('8.00')).toBeInTheDocument();
    expect(preview.getByText('18.00')).toBeInTheDocument();
  });

  it('leaves an item with no cost out of margin pricing', () => {
    renderGrid({ initialItems: [item({ id: 1, name: 'Bajiya', base_price: 10 })] });
    selectAll();

    fireEvent.click(screen.getByRole('button', { name: /Preview margin pricing/ }));

    expect(within(screen.getByTestId('bulk-preview')).getByText('Nothing would change')).toBeInTheDocument();
  });

  it('renumbers a selection in the order shown', () => {
    renderGrid({ initialItems: priced });
    selectAll();

    fireEvent.click(screen.getByRole('button', { name: 'Organise' }));
    fireEvent.click(screen.getByRole('button', { name: /Preview renumber/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Stage 2 changes/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Save/ }));

    expect(bulkUpdateItems).toHaveBeenCalledWith([
      { id: 1, fields: { sort_order: 10 } },
      { id: 2, fields: { sort_order: 20 } },
    ], [], []);
  });

  it('sets a kitchen field across the selection', () => {
    renderGrid({ initialItems: priced });
    selectAll();

    fireEvent.click(screen.getByRole('button', { name: 'Kitchen' }));
    fireEvent.change(screen.getByLabelText('Prep time'), { target: { value: '25' } });
    fireEvent.click(screen.getByRole('button', { name: 'Set prep time' }));
    fireEvent.click(screen.getByRole('button', { name: /^Stage 2 changes/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Save/ }));

    expect(bulkUpdateItems).toHaveBeenCalledWith([
      { id: 1, fields: { prep_time_minutes: 25 } },
      { id: 2, fields: { prep_time_minutes: 25 } },
    ], [], []);
  });

  it('hides cost and margin controls from anyone without recipes.manage', () => {
    renderGrid({ initialItems: priced, canSeeCost: false });
    selectAll();

    expect(screen.queryByLabelText('Target margin')).toBeNull();
    expect(screen.queryByLabelText('Cost amount')).toBeNull();
    expect(screen.getByLabelText('Price amount')).toBeInTheDocument();
  });

  it('says a sized dish would not move when sizes are excluded', () => {
    // With the sizes off limits there is genuinely nothing to change on a
    // sized dish, and the preview should say so rather than offer a stage.
    const sized = item({
      id: 7, name: 'Beetle leaf', base_price: 20,
      variants: [{ id: 70, name: 'Full', price: 20, is_active: true, sort_order: 0 }],
    });
    renderGrid({ initialItems: [sized] });
    selectAll();

    fireEvent.click(screen.getByLabelText('Apply price changes to sizes too'));
    fireEvent.click(screen.getByRole('button', { name: /Preview price change/ }));

    const preview = within(screen.getByTestId('bulk-preview'));
    expect(preview.getByText('Nothing would change')).toBeInTheDocument();
    expect(preview.getByText('sizes left alone')).toBeInTheDocument();
  });

  it('still reprices a plain dish with no sizes', () => {
    renderGrid({ initialItems: priced });
    selectAll();

    fireEvent.click(screen.getByRole('button', { name: /Preview price change/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Stage 2 changes/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Save/ }));

    expect(bulkUpdateItems).toHaveBeenCalledWith([
      { id: 1, fields: { base_price: 11 } },
      { id: 2, fields: { base_price: 33 } },
    ], [], []);
  });
});

describe('QuickEditGrid header filters', () => {
  const priced = [
    item({ id: 1, name: 'Bajiya', base_price: 3 }),
    item({ id: 2, name: 'Gulha', base_price: 3 }),
    item({ id: 3, name: 'Kulhi', base_price: 7 }),
  ];

  function openPriceFilter() {
    fireEvent.click(screen.getByRole('button', { name: 'Filter by Price' }));
  }

  it('lists the distinct values with counts', () => {
    // Owner, 2026-09-01: "when i click price and select all the items for 3
    // rufiyaa".
    renderGrid({ initialItems: priced });
    openPriceFilter();

    const menu = within(screen.getByTestId('column-filter-menu'));
    expect(menu.getByLabelText('Price 3.00')).toBeInTheDocument();
    expect(menu.getByLabelText('Price 7.00')).toBeInTheDocument();
  });

  it('keeps only the rows carrying a ticked value', () => {
    renderGrid({ initialItems: priced });
    openPriceFilter();

    // Untick 7.00, leaving the two rows priced at 3.
    fireEvent.click(within(screen.getByTestId('column-filter-menu')).getByLabelText('Price 7.00'));

    expect(screen.getByTestId('quick-edit-row-1')).toBeInTheDocument();
    expect(screen.getByTestId('quick-edit-row-2')).toBeInTheDocument();
    expect(screen.queryByTestId('quick-edit-row-3')).toBeNull();
    expect(screen.getByTestId('grid-count')).toHaveTextContent('2 of 3 items');
  });

  it('narrows to one value with Only these', () => {
    renderGrid({ initialItems: priced });
    openPriceFilter();

    const menu = within(screen.getByTestId('column-filter-menu'));
    fireEvent.change(menu.getByLabelText('Find a value in Price'), { target: { value: '7' } });
    fireEvent.click(menu.getByRole('button', { name: 'Only these' }));

    expect(screen.getByTestId('quick-edit-row-3')).toBeInTheDocument();
    expect(screen.queryByTestId('quick-edit-row-1')).toBeNull();
  });

  it('clears back to every row', () => {
    renderGrid({ initialItems: priced });
    openPriceFilter();
    const menu = () => within(screen.getByTestId('column-filter-menu'));

    fireEvent.click(menu().getByLabelText('Price 7.00'));
    expect(screen.queryByTestId('quick-edit-row-3')).toBeNull();

    fireEvent.click(menu().getByRole('button', { name: 'Clear' }));
    expect(screen.getByTestId('quick-edit-row-3')).toBeInTheDocument();
  });

  it('counts a column pick towards the filter badge', () => {
    renderGrid({ initialItems: priced });
    openPriceFilter();
    fireEvent.click(within(screen.getByTestId('column-filter-menu')).getByLabelText('Price 7.00'));

    expect(screen.getByTestId('grid-filter-toggle')).toHaveTextContent('Filters (1)');
  });
});

describe('QuickEditGrid new item row', () => {
  it('adds nothing until a row is asked for', () => {
    // Owner, 2026-09-01: "there is no new item add row in the sheet".
    renderGrid();

    expect(screen.queryByTestId('quick-edit-new-0')).toBeNull();

    fireEvent.click(screen.getByTestId('grid-add-row'));
    expect(screen.getByTestId('quick-edit-new-0')).toBeInTheDocument();
  });

  it('does not count an untouched blank row as a pending change', () => {
    renderGrid();
    fireEvent.click(screen.getByTestId('grid-add-row'));

    expect(screen.getByTestId('quick-edit-dirty')).toHaveTextContent('No unsaved changes');
    expect(screen.getByRole('button', { name: /^Save/ })).toBeDisabled();
  });

  it('sends a filled row as a new item', () => {
    renderGrid();
    fireEvent.click(screen.getByTestId('grid-add-row'));

    fireEvent.change(screen.getByLabelText('New row 1 Name'), { target: { value: 'Masroshi' } });
    fireEvent.change(screen.getByLabelText('New row 1 Price'), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: /^Save/ }));

    expect(bulkUpdateItems).toHaveBeenCalledWith([], [], [
      expect.objectContaining({ name: 'Masroshi', base_price: 5 }),
    ]);
  });

  it('sends new rows alongside edits in the same save', () => {
    renderGrid();
    fireEvent.change(screen.getByLabelText('Price for Bajiya'), { target: { value: '12' } });
    fireEvent.click(screen.getByTestId('grid-add-row'));
    fireEvent.change(screen.getByLabelText('New row 1 Name'), { target: { value: 'Masroshi' } });
    fireEvent.change(screen.getByLabelText('New row 1 Price'), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: /^Save/ }));

    expect(bulkUpdateItems).toHaveBeenCalledWith(
      [{ id: 1, fields: { base_price: 12 } }],
      [],
      [expect.objectContaining({ name: 'Masroshi', base_price: 5 })],
    );
  });

  it('removes a row that was added by mistake', () => {
    renderGrid();
    fireEvent.click(screen.getByTestId('grid-add-row'));
    fireEvent.change(screen.getByLabelText('New row 1 Name'), { target: { value: 'Oops' } });
    expect(screen.getByTestId('quick-edit-dirty')).toHaveTextContent('1 unsaved change');

    fireEvent.click(screen.getByLabelText('Remove new row 1'));

    expect(screen.queryByTestId('quick-edit-new-0')).toBeNull();
    expect(screen.getByTestId('quick-edit-dirty')).toHaveTextContent('No unsaved changes');
  });

  it('shows what the server refused on a new row', async () => {
    bulkUpdateItems.mockRejectedValue(Object.assign(new Error('No changes were saved — 1 of 1 rows need fixing.'), {
      body: {
        row_errors: {}, variant_row_errors: {},
        new_row_errors: { 0: { base_price: ['The base price field is required.'] } },
      },
    }));
    renderGrid();
    fireEvent.click(screen.getByTestId('grid-add-row'));
    fireEvent.change(screen.getByLabelText('New row 1 Name'), { target: { value: 'Masroshi' } });
    fireEvent.click(screen.getByRole('button', { name: /^Save/ }));

    await waitFor(() =>
      expect(screen.getByText('The base price field is required.')).toBeInTheDocument(),
    );
    // The typed row survives so it can be fixed rather than retyped.
    expect(screen.getByLabelText('New row 1 Name')).toHaveValue('Masroshi');
  });

  it('discards new rows along with the other pending edits', () => {
    renderGrid();
    fireEvent.click(screen.getByTestId('grid-add-row'));
    fireEvent.change(screen.getByLabelText('New row 1 Name'), { target: { value: 'Masroshi' } });

    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));

    expect(screen.queryByTestId('quick-edit-new-0')).toBeNull();
  });
});

/**
 * Owner, 2026-09-02: "can i do the same for the quick edit page" — the
 * desktop/phone layout pass that the list and the categories tab got. jsdom
 * applies no stylesheet, so these pin the structure the CSS hangs off: which
 * cells are the pinned ones, where the save bar sits, and that the bulk card
 * is not there when nothing is ticked.
 */
describe('QuickEditGrid layout', () => {
  it('pins the tick and the name so the row keeps its label while scrolling sideways', () => {
    renderGrid();

    const row = screen.getByTestId('quick-edit-row-1');
    const cells = row.querySelectorAll('td');
    expect(cells[0]).toHaveClass('qe-col-select');
    expect(cells[1]).toHaveClass('qe-col-name');
    expect(row.closest('table')).toHaveClass('qe-table');
    expect(row.closest('table')?.querySelector('thead .qe-col-name')).not.toBeNull();
  });

  it('puts the save bar under the sheet, not above it', () => {
    renderGrid();

    const sheet = screen.getByTestId('quick-edit-scroll');
    const bar = screen.getByTestId('quick-edit-savebar');
    // Node.DOCUMENT_POSITION_FOLLOWING — the bar comes after the sheet.
    expect(sheet.compareDocumentPosition(bar) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(bar).toHaveAttribute('data-dirty', 'false');

    fireEvent.change(screen.getByLabelText('Price for Bajiya'), { target: { value: '12' } });
    expect(bar).toHaveAttribute('data-dirty', 'true');
  });

  it('shows the bulk card only once something is ticked', () => {
    renderGrid();

    expect(screen.getByTestId('quick-edit-selection')).toHaveTextContent('Tick rows to change them together.');
    expect(screen.queryByTestId('bulk-actions')).toBeNull();

    fireEvent.click(screen.getByLabelText('Select Bajiya'));

    expect(screen.getByTestId('bulk-actions')).toBeInTheDocument();
    expect(screen.getByTestId('bulk-tabs')).toHaveClass('qe-bulk-tabs');
  });

  it('keeps the error with the save bar it belongs to', async () => {
    bulkUpdateItems.mockRejectedValue(Object.assign(new Error('No changes were saved — 1 of 1 rows need fixing.'), {
      body: { row_errors: { 0: { base_price: ['Too low.'] } }, variant_row_errors: {}, new_row_errors: {} },
    }));
    renderGrid();
    fireEvent.change(screen.getByLabelText('Price for Bajiya'), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: /^Save/ }));

    const error = await screen.findByTestId('quick-edit-error');
    expect(screen.getByTestId('quick-edit-savebar')).toContainElement(error);
  });

  it('flags the sheet while a column menu is open so it is not clipped', () => {
    renderGrid();

    fireEvent.click(screen.getByLabelText('Filter by Price'));
    expect(screen.getByTestId('quick-edit-scroll')).toHaveClass('has-menu');
  });
});
