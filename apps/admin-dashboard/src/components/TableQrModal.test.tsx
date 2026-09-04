import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchTableQr = vi.fn();
const rotateTableQr = vi.fn();

vi.mock('../api', () => ({
  fetchTableQr: (...args: unknown[]) => fetchTableQr(...args),
  rotateTableQr: (...args: unknown[]) => rotateTableQr(...args),
}));

import { TableQrModal, TableQrSheetModal } from './TableQrModal';

type Table = Parameters<typeof TableQrModal>[0]['table'];

function table(id: number, name: string, extra: Partial<Table> = {}): Table {
  return {
    id, name, capacity: 4, location: 'Indoor', status: 'available',
    current_order_id: null, current_order_number: null, current_order_total: null,
    is_active: true, ...extra,
  } as Table;
}

const qrFor = (id: number, name: string) => ({
  table: { id, name, location: 'Indoor' },
  token: `token${id}`.padEnd(24, 'x'),
  url: `https://bakeandgrill.mv/?table=${`token${id}`.padEnd(24, 'x')}`,
});

describe('TableQrModal', () => {
  beforeEach(() => {
    fetchTableQr.mockReset();
    rotateTableQr.mockReset();
    fetchTableQr.mockImplementation((id: number) => Promise.resolve(qrFor(id, 'T4')));
  });

  it('shows the card and the link the QR opens', async () => {
    render(<TableQrModal table={table(4, '4')} onClose={() => {}} />);

    const card = await screen.findByTestId('table-qr-preview');
    expect(card).toHaveTextContent('Table 4');
    expect(card).toHaveTextContent('Scan to order');
    // The QR itself, not just the wording.
    expect(card.querySelector('svg')).not.toBeNull();
    expect(screen.getByText(/\?table=token4/)).toBeInTheDocument();
  });

  it('warns that the printed card dies before replacing a code', async () => {
    // Rotation is the one destructive action here: somebody sitting at that
    // table is holding a card that stops working the moment it is confirmed.
    rotateTableQr.mockResolvedValue({ ...qrFor(4, 'T4'), token: 'rotated'.padEnd(24, 'y'), url: 'https://bakeandgrill.mv/?table=rotatedyyyyyyyyyyyyyyyyy' });
    render(<TableQrModal table={table(4, '4')} onClose={() => {}} />);
    await screen.findByTestId('table-qr-preview');

    fireEvent.click(screen.getByText(/Replace this code/));
    expect(screen.getByText(/stops working immediately/)).toBeInTheDocument();
    expect(rotateTableQr).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Replace the code' }));
    await waitFor(() => expect(rotateTableQr).toHaveBeenCalledWith(4));
    expect(await screen.findByText(/table=rotated/)).toBeInTheDocument();
  });

  it('leaves the code alone when the warning is declined', async () => {
    render(<TableQrModal table={table(4, '4')} onClose={() => {}} />);
    await screen.findByTestId('table-qr-preview');

    fireEvent.click(screen.getByText(/Replace this code/));
    fireEvent.click(screen.getByRole('button', { name: 'Keep the current code' }));

    expect(rotateTableQr).not.toHaveBeenCalled();
    expect(screen.queryByText(/stops working immediately/)).not.toBeInTheDocument();
  });

  it('says so rather than showing a blank card when the fetch fails', async () => {
    fetchTableQr.mockRejectedValue(new Error('Network down'));
    render(<TableQrModal table={table(4, '4')} onClose={() => {}} />);

    expect(await screen.findByText('Network down')).toBeInTheDocument();
  });
});

describe('TableQrSheetModal', () => {
  beforeEach(() => {
    fetchTableQr.mockReset();
    fetchTableQr.mockImplementation((id: number) => Promise.resolve(qrFor(id, String(id))));
  });

  it('draws one card per table, each with its own code', async () => {
    render(
      <TableQrSheetModal
        tables={[table(1, '1'), table(2, '2'), table(3, '3')]}
        onClose={() => {}}
      />,
    );

    const sheet = await screen.findByTestId('table-qr-sheet');
    await waitFor(() => expect(sheet.children).toHaveLength(3));
    expect(fetchTableQr).toHaveBeenCalledTimes(3);
    // Cards are not interchangeable — each names the table it belongs on.
    for (const name of ['Table 1', 'Table 2', 'Table 3']) {
      expect(sheet).toHaveTextContent(name);
    }
  });

  it('skips tables taken out of service', async () => {
    // A card on a retired table is a scan that goes nowhere.
    render(
      <TableQrSheetModal
        tables={[table(1, '1'), table(2, '2', { is_active: false })]}
        onClose={() => {}}
      />,
    );

    const sheet = await screen.findByTestId('table-qr-sheet');
    await waitFor(() => expect(sheet.children).toHaveLength(1));
    expect(fetchTableQr).toHaveBeenCalledTimes(1);
    expect(fetchTableQr).toHaveBeenCalledWith(1);
  });
});
