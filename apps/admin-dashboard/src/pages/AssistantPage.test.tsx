import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const fetchAiSettings = vi.fn();
const saveAiSettings = vi.fn();
vi.mock('../api/ai', () => ({
  fetchAiSettings: (...a: unknown[]) => fetchAiSettings(...a),
  saveAiSettings: (...a: unknown[]) => saveAiSettings(...a),
  fetchAiStatus: vi.fn().mockResolvedValue({ ready: true, enabled: true, features: {} }),
}));

import AssistantPage from './AssistantPage';

const settings = (over: Record<string, unknown> = {}) => ({
  ready: true, enabled: true,
  features: [
    { key: 'reply_drafts', label: 'Draft replies to customers', about: 'A Draft reply button.', where: 'Reviews', on: true },
    { key: 'captions', label: 'Social post captions', about: 'Writes the caption.', where: 'Social Hub', on: true },
  ],
  ...over,
});

describe('System → Integrations → Assistant', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('has a master switch and one per feature, each saved as it is flipped', async () => {
    fetchAiSettings.mockResolvedValue(settings());
    saveAiSettings.mockImplementation(async (patch: { enabled?: boolean }) => settings(patch.enabled === false ? { enabled: false } : {}));
    render(<MemoryRouter><AssistantPage /></MemoryRouter>);

    fireEvent.click(await screen.findByTestId('ai-feature-captions'));
    await waitFor(() => expect(saveAiSettings).toHaveBeenCalledWith({ features: { captions: false } }));

    fireEvent.click(screen.getByTestId('ai-master'));
    await waitFor(() => expect(saveAiSettings).toHaveBeenCalledWith({ enabled: false }));
    // With the master off the feature switches are locked, and keep their setting.
    await waitFor(() => expect(screen.getByTestId('ai-feature-reply_drafts')).toBeDisabled());
    expect(screen.getByTestId('ai-feature-reply_drafts')).toHaveAttribute('aria-checked', 'true');
  });

  it('says where the key goes when there is none', async () => {
    fetchAiSettings.mockResolvedValue(settings({ ready: false }));
    render(<MemoryRouter><AssistantPage /></MemoryRouter>);
    expect(await screen.findByTestId('ai-no-key')).toHaveTextContent('System → Integrations → API keys');
  });
});
