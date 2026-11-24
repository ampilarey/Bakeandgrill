import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

/*
 * Owner, 2026-11-24: "Where to setup API. Before I added Claude and Google API to bill.
 * How about make all API related in admin separately."
 */

const fetchAiSettings = vi.fn();
const saveAiSettings = vi.fn();
vi.mock('../api/ai', () => ({
  fetchAiSettings: (...a: unknown[]) => fetchAiSettings(...a),
  saveAiSettings: (...a: unknown[]) => saveAiSettings(...a),
  fetchAiStatus: vi.fn().mockResolvedValue({ ready: true, enabled: true, features: {} }),
}));
const getBillReader = vi.fn();
vi.mock('../api/purchasing', () => ({
  getBillReader: (...a: unknown[]) => getBillReader(...a),
  saveBillReader: vi.fn(),
  testBillReader: vi.fn(),
}));

import ApiKeysPage from './ApiKeysPage';

const provider = (over: Record<string, unknown>) => ({
  key: 'claude', label: 'Claude (Anthropic)', where: 'console.anthropic.com → API keys', has_key: true,
  key_hint: '…1234', key_from: 'admin', model: 'claude-opus-5-5', default_model: 'claude-opus-5-5', ...over,
});
const images = { ready: false, model: 'gemini-2.5-flash-image', default_model: 'gemini-2.5-flash-image' };

describe('System → Integrations → API keys', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getBillReader.mockResolvedValue({ provider: 'claude', providers: [provider({}), provider({ key: 'google', label: 'Google Gemini', has_key: false, key_hint: null, key_from: null })] });
    fetchAiSettings.mockResolvedValue({ ready: true, enabled: true, features: [], images });
  });

  it('has every service, its key box and the picture model on one screen', async () => {
    render(<MemoryRouter><ApiKeysPage /></MemoryRouter>);
    expect(await screen.findByTestId('bill-reader-claude')).toHaveTextContent('In use');
    expect(screen.getByTestId('bill-reader-google')).toHaveTextContent('No key yet.');
    expect(screen.getByTestId('api-keys-uses')).toHaveTextContent('One key serves everything');
    expect(screen.getByRole('link', { name: 'Assistant' })).toHaveAttribute('href', '/integrations/assistant');
    expect(await screen.findByTestId('ai-images')).toHaveTextContent('Add a Google key above');
  });

  it('saves the picture model', async () => {
    saveAiSettings.mockResolvedValue({ ready: true, enabled: true, features: [], images: { ...images, model: 'another-image-model' } });
    render(<MemoryRouter><ApiKeysPage /></MemoryRouter>);
    fireEvent.change(await screen.findByTestId('ai-image-model'), { target: { value: ' another-image-model ' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Save model' }).slice(-1)[0]);
    await waitFor(() => expect(saveAiSettings).toHaveBeenCalledWith({ image_model: 'another-image-model' }));
  });

  it('still shows the keys when the assistant settings do not load', async () => {
    fetchAiSettings.mockRejectedValue(new Error('no'));
    render(<MemoryRouter><ApiKeysPage /></MemoryRouter>);
    expect(await screen.findByTestId('api-keys-card')).toBeInTheDocument();
    expect(screen.queryByTestId('ai-images')).toBeNull();
  });
});
