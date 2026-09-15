import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { SortFilterHead, SortFilterPanel, useSortFilter, type Column } from '../components/TableControls';
import { useState } from 'react';

/*
 * Owner, 2026-09-15: "In some places there is no sort and filter option.
 * For example suppliers in purchase. Check other places too." One control
 * for every list: headings sort, boxes under them narrow.
 */

type Row = { id: number; name: string; phone: string | null; total: number; status: 'active' | 'inactive' };

const ROWS: Row[] = [
  { id: 1, name: 'Villa Mart', phone: '7001111', total: 120, status: 'active' },
  { id: 2, name: 'Agora', phone: null, total: 45.5, status: 'inactive' },
  { id: 3, name: 'Redwave', phone: '7003333', total: 300, status: 'active' },
];

const COLUMNS: Column<Row>[] = [
  { key: 'name', label: 'Name', get: (r) => r.name },
  { key: 'phone', label: 'Phone', get: (r) => r.phone },
  { key: 'total', label: 'Total', kind: 'number', get: (r) => r.total },
  { key: 'status', label: 'Status', kind: 'select', get: (r) => r.status },
  { key: 'actions', label: 'Actions' },
];

function Table() {
  const ctl = useSortFilter(ROWS, COLUMNS, 'demo');
  return (
    <table>
      <SortFilterHead controls={ctl} allRows={ROWS} />
      <tbody>
        {ctl.rows.map((r) => (
          <tr key={r.id}><td>{r.name}</td><td>{r.phone ?? '—'}</td><td>{r.total}</td><td>{r.status}</td><td /></tr>
        ))}
      </tbody>
    </table>
  );
}

const names = () => screen.getAllByRole('row').filter((r) => r.closest('tbody')).map((r) => r.querySelector('td')!.textContent);

describe('Sort and filter from the headings', () => {
  beforeEach(() => localStorage.clear());

  it('sorts one way, then the other, with blanks last either way', () => {
    render(<Table />);
    expect(names()).toEqual(['Villa Mart', 'Agora', 'Redwave']);

    fireEvent.click(screen.getByTestId('demo-sort-name'));
    expect(names()).toEqual(['Agora', 'Redwave', 'Villa Mart']);
    expect(screen.getByTestId('demo-sort-name').closest('th')).toHaveAttribute('aria-sort', 'ascending');

    fireEvent.click(screen.getByTestId('demo-sort-name'));
    expect(names()).toEqual(['Villa Mart', 'Redwave', 'Agora']);

    fireEvent.click(screen.getByTestId('demo-sort-phone'));
    expect(names()).toEqual(['Villa Mart', 'Redwave', 'Agora']);
    fireEvent.click(screen.getByTestId('demo-sort-phone'));
    expect(names()).toEqual(['Redwave', 'Villa Mart', 'Agora']);

    fireEvent.click(screen.getByTestId('demo-sort-total'));
    expect(names()).toEqual(['Agora', 'Villa Mart', 'Redwave']);
  });

  it('narrows by text, by a number expression and by a pick, and clears', () => {
    render(<Table />);
    fireEvent.change(screen.getByTestId('demo-filter-name'), { target: { value: 'a' } });
    expect(names()).toEqual(['Villa Mart', 'Agora', 'Redwave']);
    fireEvent.change(screen.getByTestId('demo-filter-name'), { target: { value: 'ag' } });
    expect(names()).toEqual(['Agora']);
    fireEvent.change(screen.getByTestId('demo-filter-name'), { target: { value: '' } });

    fireEvent.change(screen.getByTestId('demo-filter-total'), { target: { value: '>100' } });
    expect(names()).toEqual(['Villa Mart', 'Redwave']);

    const status = screen.getByTestId('demo-filter-status');
    expect(within(status).getAllByRole('option').map((o) => o.textContent)).toEqual(['All', 'active', 'inactive']);
    fireEvent.change(status, { target: { value: 'active' } });
    expect(names()).toEqual(['Villa Mart', 'Redwave']);
    fireEvent.change(screen.getByTestId('demo-filter-total'), { target: { value: '>200' } });
    expect(names()).toEqual(['Redwave']);

    fireEvent.click(screen.getByTestId('demo-clear-filters'));
    expect(names()).toEqual(['Villa Mart', 'Agora', 'Redwave']);
    expect(screen.queryByTestId('demo-clear-filters')).toBeNull();
  });

  it('remembers the sort for next time, but not the filters', () => {
    const first = render(<Table />);
    fireEvent.click(screen.getByTestId('demo-sort-total'));
    fireEvent.change(screen.getByTestId('demo-filter-name'), { target: { value: 'red' } });
    first.unmount();

    render(<Table />);
    expect(names()).toEqual(['Agora', 'Villa Mart', 'Redwave']);
    expect(screen.getByTestId('demo-filter-name')).toHaveValue('');
  });

  it('offers the same sort and boxes as a panel for a phone', () => {
    function Cards() {
      const ctl = useSortFilter(ROWS, COLUMNS, 'cards');
      const [open, setOpen] = useState(false);
      return (
        <div>
          <SortFilterPanel controls={ctl} allRows={ROWS} open={open} onToggle={() => setOpen((v) => !v)} />
          <ul>{ctl.rows.map((r) => <li key={r.id}>{r.name}</li>)}</ul>
        </div>
      );
    }
    render(<Cards />);
    const items = () => screen.getAllByRole('listitem').map((li) => li.textContent);
    fireEvent.change(screen.getByTestId('cards-sort-select'), { target: { value: 'total:desc' } });
    expect(items()).toEqual(['Redwave', 'Villa Mart', 'Agora']);

    expect(screen.queryByTestId('cards-filters-panel')).toBeNull();
    fireEvent.click(screen.getByTestId('cards-filters-toggle'));
    fireEvent.change(screen.getByTestId('cards-filter-status'), { target: { value: 'inactive' } });
    expect(items()).toEqual(['Agora']);
    expect(screen.getByTestId('cards-filters-toggle')).toHaveTextContent('Filters (1)');
  });
});
