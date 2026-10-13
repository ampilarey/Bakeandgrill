import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../ui', async () => {
  const actual = await vi.importActual<typeof import('../ui')>('../ui');
  return { ...actual, useToast: () => ({ toast: vi.fn() }) };
});

import { LabelPrinterCard } from './LabelPrinterCard';
import { readPrinterSetup, sendToLabelPrinter, PRINTER_SETUP_KEY } from '../../api';

/*
 * The label printer card (round C): language, dots per inch, the printer's
 * address and the print agent, kept in this browser; Check the agent asks it.
 */
describe('LabelPrinterCard', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    try { localStorage.clear(); } catch { /* jsdom */ }
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('keeps the printer for this computer and checks the agent', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: () => Promise.resolve({ ok: true, agent: 'bake-and-grill-label-print-agent', version: '1.0.0' }) });
    render(<LabelPrinterCard />);
    fireEvent.change(screen.getByLabelText('Printer language'), { target: { value: 'zpl' } });
    fireEvent.change(screen.getByLabelText('Dots per inch'), { target: { value: '300' } });
    fireEvent.change(screen.getByLabelText('Printer address'), { target: { value: ' 192.168.1.50 ' } });
    fireEvent.click(screen.getByTestId('printer-save'));
    expect(readPrinterSetup()).toEqual({ language: 'zpl', dpi: 300, agent: 'http://127.0.0.1:9110', host: '192.168.1.50', port: 9100, via: 'agent' });
    expect(JSON.parse(localStorage.getItem(PRINTER_SETUP_KEY) ?? '{}').host).toBe('192.168.1.50');

    fireEvent.click(screen.getByTestId('printer-check'));
    expect(await screen.findByText('Print agent found (version 1.0.0).')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:9110/', { method: 'GET' });
  });

  it('says when no agent answers', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    render(<LabelPrinterCard />);
    fireEvent.click(screen.getByTestId('printer-check'));
    expect(await screen.findByText(/No print agent at that address/)).toBeInTheDocument();
  });

  it('hands a sticker link to the agent with the printer, and says what went wrong', async () => {
    await expect(sendToLabelPrinter('/labels/stickers.tspl?x=1', { language: 'tspl', dpi: 203, agent: 'http://127.0.0.1:9110/', host: '', port: 9100 }))
      .rejects.toThrow('Type the printer\'s address');
    fetchMock.mockResolvedValue({ ok: true, json: () => Promise.resolve({ ok: true, bytes: 12345 }) });
    await expect(sendToLabelPrinter('/labels/stickers.tspl?x=1', { language: 'tspl', dpi: 203, agent: 'http://127.0.0.1:9110/', host: '10.0.0.9', port: 9100 })).resolves.toEqual({ ok: true, bytes: 12345 });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://127.0.0.1:9110/print');
    expect(JSON.parse(String(init.body))).toEqual({ url: `${window.location.origin}/labels/stickers.tspl?x=1`, host: '10.0.0.9', port: 9100 });

    fetchMock.mockResolvedValue({ ok: false, json: () => Promise.resolve({ ok: false, error: 'Could not reach the printer at 10.0.0.9:9100 (ECONNREFUSED).' }) });
    await expect(sendToLabelPrinter('/labels/stickers.tspl?x=1', { language: 'tspl', dpi: 203, agent: 'http://127.0.0.1:9110', host: '10.0.0.9', port: 9100 })).rejects.toThrow('ECONNREFUSED');
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(sendToLabelPrinter('/labels/stickers.tspl?x=1', { language: 'tspl', dpi: 203, agent: 'http://127.0.0.1:9110', host: '10.0.0.9', port: 9100 })).rejects.toThrow('The print agent is not running on this computer');
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
  });

  // Round 16: Bluetooth from this phone, no agent or address; a browser without it says why.
  it('switches to Bluetooth, pairs the printer and keeps the choice for this phone', async () => {
    const requestDevice = vi.fn(async () => ({ id: 'p1', name: 'XP-P323B', gatt: { connected: true, connect: async () => ({ connected: true, getPrimaryServices: async () => [{ uuid: '000018f0-0000-1000-8000-00805f9b34fb', getCharacteristics: async () => [{ uuid: 'w', properties: { write: true, writeWithoutResponse: true }, writeValueWithoutResponse: vi.fn() }] }], getPrimaryService: vi.fn() }) } }));
    vi.stubGlobal('navigator', { ...navigator, bluetooth: { requestDevice } });
    render(<LabelPrinterCard />);
    fireEvent.click(screen.getByTestId('printer-via-bluetooth'));
    expect(screen.queryByLabelText('Printer address')).toBeNull();
    expect(screen.queryByTestId('printer-check')).toBeNull();
    fireEvent.click(screen.getByTestId('printer-pair'));
    expect(await screen.findByText('Paired: XP-P323B.')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('printer-save'));
    expect(readPrinterSetup().via).toBe('bluetooth');
  });

  it('says why when the browser has no Bluetooth', () => {
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)' });
    render(<LabelPrinterCard />);
    fireEvent.click(screen.getByTestId('printer-via-bluetooth'));
    expect(screen.getByRole('alert')).toHaveTextContent('iPhones and iPads do not let a web page use Bluetooth');
  });
});
