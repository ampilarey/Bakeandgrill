import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { PickOrType } from '../components/PickOrType';

/*
 * A dropdown that does not dead-end.
 *
 * Owner, 2026-09-06: "in all the drop down places if the item is not listed,
 * add option to write so it will be saved in respective field."
 */

const CATS = [
  { value: '1', label: 'Dry goods' },
  { value: '2', label: 'Dairy' },
];

function Harness({ onCreate, initial = '' }: {
  onCreate?: (t: string) => Promise<string | null>;
  initial?: string;
}) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <PickOrType
        ariaLabel="Category"
        options={CATS}
        value={value}
        onChange={setValue}
        onCreate={onCreate}
        emptyLabel="No category"
        addLabel="＋ Add a new category"
      />
      <output data-testid="value">{value}</output>
    </>
  );
}

describe('PickOrType', () => {
  it('picks a value that is already on the list', () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText('Category'), { target: { value: '2' } });

    expect(screen.getByTestId('value')).toHaveTextContent('2');
  });

  it('saves what was typed when nothing has to be created', async () => {
    // A unit is its own value: type "sachet" and the field is "sachet".
    render(<Harness />);
    fireEvent.change(screen.getByLabelText('Category'), { target: { value: '__pick_or_type_add__' } });
    fireEvent.change(await screen.findByLabelText('New category'), { target: { value: 'sachet' } });
    fireEvent.click(screen.getByText('Use this'));

    await waitFor(() => expect(screen.getByTestId('value')).toHaveTextContent('sachet'));
  });

  it('creates the thing and selects what came back', async () => {
    const onCreate = vi.fn().mockResolvedValue('99');
    render(<Harness onCreate={onCreate} />);

    fireEvent.change(screen.getByLabelText('Category'), { target: { value: '__pick_or_type_add__' } });
    fireEvent.change(await screen.findByLabelText('New category'), { target: { value: 'Spices' } });
    fireEvent.click(screen.getByText('Use this'));

    await waitFor(() => expect(onCreate).toHaveBeenCalledWith('Spices'));
    expect(screen.getByTestId('value')).toHaveTextContent('99');
  });

  it('matches an existing option rather than making a second one that means the same', async () => {
    // "dairy " and "Dairy" are the same category. Creating both is how a list
    // rots into uselessness.
    const onCreate = vi.fn();
    render(<Harness onCreate={onCreate} />);

    fireEvent.change(screen.getByLabelText('Category'), { target: { value: '__pick_or_type_add__' } });
    fireEvent.change(await screen.findByLabelText('New category'), { target: { value: '  dairy ' } });
    fireEvent.click(screen.getByText('Use this'));

    await waitFor(() => expect(screen.getByTestId('value')).toHaveTextContent('2'));
    expect(onCreate).not.toHaveBeenCalled();
  });

  it('says so rather than saving nothing', async () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText('Category'), { target: { value: '__pick_or_type_add__' } });
    fireEvent.click(await screen.findByText('Use this'));

    expect(await screen.findByText('Type something first.')).toBeInTheDocument();
    expect(screen.getByTestId('value')).toHaveTextContent('');
  });

  it('surfaces a refusal from the server instead of pretending it saved', async () => {
    const onCreate = vi.fn().mockRejectedValue(new Error('That name is taken.'));
    render(<Harness onCreate={onCreate} />);

    fireEvent.change(screen.getByLabelText('Category'), { target: { value: '__pick_or_type_add__' } });
    fireEvent.change(await screen.findByLabelText('New category'), { target: { value: 'Dry' } });
    fireEvent.click(screen.getByText('Use this'));

    expect(await screen.findByText('That name is taken.')).toBeInTheDocument();
    expect(screen.getByTestId('value')).toHaveTextContent('');
  });

  it('goes back to the list without changing anything', async () => {
    render(<Harness initial="1" />);
    fireEvent.change(screen.getByLabelText('Category'), { target: { value: '__pick_or_type_add__' } });
    fireEvent.click(await screen.findByText('Back to list'));

    expect(await screen.findByLabelText('Category')).toBeInTheDocument();
    expect(screen.getByTestId('value')).toHaveTextContent('1');
  });

  it('shows a value the list has never heard of instead of blanking the field', () => {
    /*
     * An item whose unit is "sachet" opens on a list built from other items.
     * Without this the select would fall back to its first option and the
     * next save would quietly change the unit.
     */
    render(<Harness initial="sachet" />);

    const select = screen.getByLabelText('Category') as HTMLSelectElement;
    expect(select.value).toBe('sachet');
  });
});
