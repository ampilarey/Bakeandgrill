import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

vi.mock('../ScanSheet', () => ({
  ScanSheet: ({ onScan, onClose }: { onScan: (t: string) => void; onClose: () => void }) => (
    <div data-testid="scan-sheet">
      <button type="button" onClick={() => onScan('https://bakeandgrill.mv/b/K7PQ2M4D')}>fake-scan</button>
      <button type="button" onClick={onClose}>fake-close</button>
    </div>
  ),
}));

import { ReprintScan, codeFromScan } from './ReprintScan';

function Where() {
  const loc = useLocation();
  return <div data-testid="where">{loc.pathname}{loc.search}</div>;
}

const mount = () => render(
  <MemoryRouter initialEntries={['/labels/stickers']}>
    <Routes><Route path="*" element={<><ReprintScan /><Where /></>} /></Routes>
  </MemoryRouter>,
);

/*
 * Scan to reprint (round 11, 2026-10-13): the QR on a pack's sticker, or its
 * code typed, opens Print labels on the label that printed it.
 */
describe('codeFromScan', () => {
  it('reads the code out of the pack page address, a reprint link, or the bare code', () => {
    expect(codeFromScan('https://bakeandgrill.mv/b/K7PQ2M4D')).toBe('K7PQ2M4D');
    expect(codeFromScan('https://bakeandgrill.mv/b/k7pq2m4d?utm=x#top')).toBe('K7PQ2M4D');
    expect(codeFromScan('http://127.0.0.1:8000/admin/labels/stickers?code=k7pq2m4d&x=1')).toBe('K7PQ2M4D');
    expect(codeFromScan('  k7pq2m4d ')).toBe('K7PQ2M4D');
    expect(codeFromScan('https://bakeandgrill.mv/menu')).toBeNull();
    expect(codeFromScan('K7P')).toBeNull();
    expect(codeFromScan('HELLO WORLD')).toBeNull();
    expect(codeFromScan('')).toBeNull();
  });
});

describe('ReprintScan', () => {
  it('opens the label of a typed code', () => {
    mount();
    expect(screen.getByTestId('reprint-scan-go')).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Pack code'), { target: { value: 'k7pq2m4d' } });
    expect(screen.getByLabelText('Pack code')).toHaveValue('K7PQ2M4D');
    fireEvent.click(screen.getByTestId('reprint-scan-go'));
    expect(screen.getByTestId('where')).toHaveTextContent('/labels/stickers?code=K7PQ2M4D');
  });

  it('opens the label of a scanned QR, and closes the scanner without one', () => {
    mount();
    fireEvent.click(screen.getByTestId('reprint-scan-open'));
    fireEvent.click(screen.getByText('fake-close'));
    expect(screen.queryByTestId('scan-sheet')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('reprint-scan-open'));
    fireEvent.click(screen.getByText('fake-scan'));
    expect(screen.queryByTestId('scan-sheet')).not.toBeInTheDocument();
    expect(screen.getByTestId('where')).toHaveTextContent('/labels/stickers?code=K7PQ2M4D');
  });

  it('says when what was typed is not a pack code, and hands a code to a host that asks', () => {
    mount();
    fireEvent.change(screen.getByLabelText('Pack code'), { target: { value: 'HELLO WORLD' } });
    fireEvent.click(screen.getByTestId('reprint-scan-go'));
    expect(screen.getByRole('alert')).toHaveTextContent('That is not a pack code');
    expect(screen.getByTestId('where')).toHaveTextContent('/labels/stickers');
    expect(screen.getByTestId('where')).not.toHaveTextContent('?code=');

    const onCode = vi.fn();
    render(<MemoryRouter><ReprintScan onCode={onCode} /></MemoryRouter>);
    const box = screen.getAllByLabelText('Pack code')[1];
    fireEvent.change(box, { target: { value: 'ABCD2345' } });
    fireEvent.click(screen.getAllByTestId('reprint-scan-go')[1]);
    expect(onCode).toHaveBeenCalledWith('ABCD2345');
  });
});
