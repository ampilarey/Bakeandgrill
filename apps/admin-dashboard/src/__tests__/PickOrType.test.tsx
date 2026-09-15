import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { PickOrType } from '../components/PickOrType';

/*
 * One box to search, pick, or type something new.
 *
 * Owner, 2026-09-06: "in all the drop down places if the item is not listed,
 * add option to write so it will be saved in respective field."
 * Owner, 2026-09-15: "no search option, can u add search and pick in same box?"
 */

const CATS = [
  { value: '1', label: 'Dry goods' },
  { value: '2', label: 'Dairy' },
];

function Harness({ onCreate, initial = '', required = false }: {
  onCreate?: (t: string) => Promise<string | null>;
  initial?: string;
  required?: boolean;
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
        emptyLabel={required ? undefined : 'No category'}
      />
      <output data-testid="value">{value}</output>
    </>
  );
}

const box = () => screen.getByLabelText('Category');
const listed = () => screen.getAllByRole('option').map((o) => o.textContent);

describe('PickOrType', () => {
  it('opens the list on focus and picks a row', () => {
    render(<Harness />);
    fireEvent.focus(box());
    expect(listed()).toEqual(['No category', 'Dry goods', 'Dairy']);

    fireEvent.mouseDown(screen.getByRole('option', { name: 'Dairy' }));
    expect(screen.getByTestId('value')).toHaveTextContent('2');
    expect(box()).toHaveValue('Dairy');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('narrows the list to what is typed', () => {
    render(<Harness />);
    fireEvent.change(box(), { target: { value: 'dai' } });
    expect(listed()).toEqual(['Dairy', '＋ Use “dai”']);
  });

  it('is the text itself, letter by letter, when nothing has to be created', () => {
    // A unit is its own value: type "sachet" and the field is "sachet".
    render(<Harness />);
    fireEvent.change(box(), { target: { value: 'sachet' } });
    expect(screen.getByTestId('value')).toHaveTextContent('sachet');
  });

  it('creates the thing from the "Use" row and selects what came back', async () => {
    const onCreate = vi.fn().mockResolvedValue('99');
    render(<Harness onCreate={onCreate} />);

    fireEvent.change(box(), { target: { value: 'Spices' } });
    // Not created just by typing — an id field waits to be told.
    expect(screen.getByTestId('value')).toHaveTextContent('');
    fireEvent.mouseDown(screen.getByRole('option', { name: '＋ Use “Spices” — add it' }));

    await waitFor(() => expect(onCreate).toHaveBeenCalledWith('Spices'));
    expect(screen.getByTestId('value')).toHaveTextContent('99');
  });

  it('creates on Enter too', async () => {
    const onCreate = vi.fn().mockResolvedValue('99');
    render(<Harness onCreate={onCreate} />);
    fireEvent.change(box(), { target: { value: 'Spices' } });
    fireEvent.keyDown(box(), { key: 'Enter' });
    await waitFor(() => expect(screen.getByTestId('value')).toHaveTextContent('99'));
  });

  it('matches an existing option rather than making a second one that means the same', () => {
    // "dairy " and "Dairy" are the same category. Creating both is how a list
    // rots into uselessness.
    const onCreate = vi.fn();
    render(<Harness onCreate={onCreate} />);

    fireEvent.change(box(), { target: { value: '  dairy ' } });
    expect(screen.getByTestId('value')).toHaveTextContent('2');
    expect(screen.queryByRole('option', { name: /Use “/ })).toBeNull();
    expect(onCreate).not.toHaveBeenCalled();
  });

  it('says so rather than saving nothing when a choice is required', () => {
    render(<Harness required />);
    fireEvent.change(box(), { target: { value: 'x' } });
    fireEvent.change(box(), { target: { value: '' } });
    fireEvent.keyDown(box(), { key: 'Enter' });

    expect(screen.getByText('Type something first.')).toBeInTheDocument();
    expect(screen.getByTestId('value')).toHaveTextContent('');
  });

  it('surfaces a refusal from the server instead of pretending it saved', async () => {
    const onCreate = vi.fn().mockRejectedValue(new Error('That name is taken.'));
    render(<Harness onCreate={onCreate} />);

    fireEvent.change(box(), { target: { value: 'Dry' } });
    fireEvent.keyDown(box(), { key: 'Enter' });

    expect(await screen.findByText('That name is taken.')).toBeInTheDocument();
    expect(screen.getByTestId('value')).toHaveTextContent('');
  });

  it('drops a half-typed name on an id field when you walk away, and on Escape', () => {
    const onCreate = vi.fn();
    render(<Harness onCreate={onCreate} initial="1" />);

    fireEvent.change(box(), { target: { value: 'Dai' } });
    fireEvent.keyDown(box(), { key: 'Escape' });
    expect(screen.getByTestId('value')).toHaveTextContent('1');
    expect(box()).toHaveValue('Dry goods');

    fireEvent.change(box(), { target: { value: 'Spi' } });
    fireEvent.blur(box());
    expect(screen.getByTestId('value')).toHaveTextContent('1');
    expect(box()).toHaveValue('Dry goods');
    expect(onCreate).not.toHaveBeenCalled();
  });

  it('shows a value the list has never heard of instead of blanking the field', () => {
    /*
     * An item whose unit is "sachet" opens on a list built from other items.
     * The box shows it as it is, and the next save keeps it.
     */
    render(<Harness initial="sachet" />);
    expect(box()).toHaveValue('sachet');
  });

  it('walks the list with the arrow keys', () => {
    render(<Harness />);
    fireEvent.keyDown(box(), { key: 'ArrowDown' });
    fireEvent.keyDown(box(), { key: 'ArrowDown' });
    fireEvent.keyDown(box(), { key: 'Enter' });
    expect(screen.getByTestId('value')).toHaveTextContent('1');
  });
});
