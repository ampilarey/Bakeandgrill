import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { BillReaderCard } from './BillReaderCard';

/*
 * Owner, 2026-11-15: "Can you add API key entry to admin so I can switch between
 * Claude, Google etc. if I want."
 */

const getBillReader = vi.fn();
const saveBillReader = vi.fn();
const testBillReader = vi.fn();
vi.mock('../../api/purchasing', () => ({
  getBillReader: (...a: unknown[]) => getBillReader(...a),
  saveBillReader: (...a: unknown[]) => saveBillReader(...a),
  testBillReader: (...a: unknown[]) => testBillReader(...a),
}));

const provider = (over: Record<string, unknown>) => ({
  key: 'claude', label: 'Claude (Anthropic)', where: 'console.anthropic.com → API keys', has_key: false,
  key_hint: null, key_from: null, model: 'claude-opus-5-5', default_model: 'claude-opus-5-5', ...over,
});
const google = (over: Record<string, unknown> = {}) => provider({
  key: 'google', label: 'Google Gemini', where: 'aistudio.google.com → Get API key', model: 'gemini-flash-latest', default_model: 'gemini-flash-latest', ...over,
});

vi.mock('../ai/useAi', () => ({ refreshAi: () => undefined }));

describe('API keys: the services and their keys', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getBillReader.mockResolvedValue({ provider: 'claude', providers: [provider({}), google()] });
  });

  // Owner, 2026-11-27: "add Claude, Gemini, Tesseract switch option where OCR tool is used only".
  it('picks what reads documents apart from the assistant, with free Tesseract needing no key', async () => {
    getBillReader.mockResolvedValue({ provider: 'claude', ocr_provider: 'claude', ocr_choices: ['claude', 'google', 'tesseract'], providers: [provider({ has_key: true, key_hint: '…9f3c', key_from: 'admin' }), google()] });
    saveBillReader.mockResolvedValue({ provider: 'claude', ocr_provider: 'tesseract', ocr_choices: ['claude', 'google', 'tesseract'], providers: [provider({ has_key: true, key_hint: '…9f3c', key_from: 'admin' }), google()] });
    render(<MemoryRouter><BillReaderCard part="keys" /></MemoryRouter>);
    expect(await screen.findByTestId('ocr-use-claude')).toHaveAttribute('aria-pressed', 'true');
    // Google has no key, so it cannot be picked; Tesseract needs none.
    expect(screen.getByTestId('ocr-use-google')).toBeDisabled();
    expect(screen.getByTestId('ocr-use-tesseract')).not.toBeDisabled();
    fireEvent.click(screen.getByTestId('ocr-use-tesseract'));
    await waitFor(() => expect(saveBillReader).toHaveBeenCalledWith({ ocr_provider: 'tesseract' }));
    await waitFor(() => expect(screen.getByTestId('ocr-use-tesseract')).toHaveAttribute('aria-pressed', 'true'));
    expect(screen.getByTestId('ocr-about')).toHaveTextContent('nothing leaves your browser');
    // The assistant's own pick did not move.
    expect(screen.getByTestId('bill-reader-claude')).toHaveTextContent('In use for the assistant');
  });

  it('says reading is off while the picked service has no key', async () => {
    render(<BillReaderCard part="keys" />);
    expect(await screen.findByTestId('bill-reader-off')).toHaveTextContent('Claude (Anthropic) has no key');
    expect(screen.getByTestId('bill-reader-state-claude')).toHaveTextContent('No key yet.');
    // A service with no key cannot be picked or tested.
    expect(screen.getByTestId('bill-reader-use-google')).toBeDisabled();
    expect(screen.getByTestId('bill-reader-test-google')).toBeDisabled();
  });

  it('saves a pasted key, clears the box and shows only its last four', async () => {
    saveBillReader.mockResolvedValue({ provider: 'claude', providers: [provider({}), google({ has_key: true, key_hint: '…9f3c', key_from: 'admin' })] });
    render(<BillReaderCard part="keys" />);
    const box = await screen.findByLabelText('Paste the key', { selector: '#br-key-google' });
    fireEvent.change(box, { target: { value: '  AIza-secret-9f3c ' } });
    fireEvent.click(screen.getAllByRole('button', { name: /Save key/ })[1]);

    await waitFor(() => expect(saveBillReader).toHaveBeenCalledWith({ keys: { google: 'AIza-secret-9f3c' } }));
    expect(await screen.findByText('Key saved, ending …9f3c.')).toBeInTheDocument();
    expect(screen.getByLabelText('Replace the key', { selector: '#br-key-google' })).toHaveValue('');
    expect(document.body.textContent).not.toContain('AIza-secret');
  });

  it('switches the service that reads the bills', async () => {
    getBillReader.mockResolvedValue({ provider: 'claude', providers: [provider({ has_key: true, key_hint: '…1234', key_from: 'env' }), google({ has_key: true, key_hint: '…9f3c', key_from: 'admin' })] });
    saveBillReader.mockResolvedValue({ provider: 'google', providers: [provider({ has_key: true, key_hint: '…1234', key_from: 'env' }), google({ has_key: true, key_hint: '…9f3c', key_from: 'admin' })] });
    render(<BillReaderCard part="keys" />);

    expect(await screen.findByTestId('bill-reader-state-claude')).toHaveTextContent("Using the key in the server's .env file, ending …1234");
    fireEvent.click(screen.getByTestId('bill-reader-use-google'));
    await waitFor(() => expect(saveBillReader).toHaveBeenCalledWith({ provider: 'google' }));
    await waitFor(() => expect(screen.getByTestId('bill-reader-google')).toHaveTextContent('In use'));
    expect(screen.getByTestId('bill-reader-use-claude')).toBeEnabled();
  });

  it('tests a key and says what came back', async () => {
    getBillReader.mockResolvedValue({ provider: 'google', providers: [provider({}), google({ has_key: true, key_hint: '…9f3c', key_from: 'admin' })] });
    testBillReader.mockResolvedValue({ ok: false, message: 'The Google key was refused. Check the key and that the Gemini API is switched on for it.' });
    render(<BillReaderCard part="keys" />);
    fireEvent.click(await screen.findByTestId('bill-reader-test-google'));
    expect(await screen.findByTestId('bill-reader-result-google')).toHaveTextContent('The Google key was refused');
    expect(testBillReader).toHaveBeenCalledWith('google');
  });

  it('shows nothing to someone the server refuses', async () => {
    getBillReader.mockRejectedValue(new Error('Forbidden'));
    const { container } = render(<BillReaderCard part="keys" />);
    await waitFor(() => expect(getBillReader).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  // Owner, 2026-11-24: "make all API related in admin separately". Purchasing keeps the
  // names bills are made out to and points to the one place a key is typed.
  it('in Purchasing settings shows no key box, only the names and where the keys are', async () => {
    getBillReader.mockResolvedValue({ provider: 'google', our_names: 'Bake & Grill, Akuru Institute', providers: [provider({}), google({ has_key: true, key_hint: '…9f3c', key_from: 'admin' })] });
    render(<MemoryRouter><BillReaderCard part="names" /></MemoryRouter>);
    const where = await screen.findByTestId('bill-reader-where');
    expect(where).toHaveTextContent('Bills are read by Google Gemini.');
    expect(screen.getByRole('link', { name: 'System → Integrations → API keys' })).toHaveAttribute('href', '/integrations/keys');
    expect(screen.getByTestId('bill-reader-names')).toHaveValue('Bake & Grill, Akuru Institute');
    expect(screen.queryByText('Paste the key')).toBeNull();
    expect(screen.queryByRole('button', { name: /Save key/ })).toBeNull();
  });
});
