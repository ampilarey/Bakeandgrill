import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { WebsiteSettings } from '../pages/SettingsPage/WebsiteSettingsSubPage';
import * as api from '../api';

const toastSuccess = vi.fn();
vi.mock('../components/ui', () => ({
  useToast: () => ({ success: toastSuccess, error: vi.fn() }),
}));

describe('WebsiteSettings Dine-in menu', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    toastSuccess.mockClear();
    vi.spyOn(api, 'getSiteSettings').mockResolvedValue({
      settings: {
        Branding: [
          {
            key: 'default_item_image',
            value: '',
            type: 'image',
            label: 'Default item photo',
            description: '',
          },
          {
            key: 'menu_new_days',
            value: '30',
            type: 'text',
            label: 'New items window (days)',
            description: '',
          },
        ],
      },
    });
  });

  it('shows dine-in URL, QR, and saves menu_new_days', async () => {
    const updateSpy = vi.spyOn(api, 'updateSiteSettings').mockResolvedValue(undefined);

    render(
      <MemoryRouter>
        <WebsiteSettings />
      </MemoryRouter>,
    );

    expect(await screen.findByTestId('dinein-menu-card')).toBeTruthy();
    expect(screen.getByTestId('dinein-menu-qr')).toBeTruthy();
    expect(screen.getByTestId('dinein-menu-url').textContent).toContain('/order/view');

    const input = await screen.findByTestId('menu-new-days-input');
    fireEvent.change(input, { target: { value: '21' } });
    fireEvent.click(screen.getByRole('button', { name: /^Save$/i }));

    await waitFor(() => {
      expect(updateSpy).toHaveBeenCalledWith({ menu_new_days: '21' });
    });
    expect(toastSuccess).toHaveBeenCalledWith('New items window saved.');
  });
});
