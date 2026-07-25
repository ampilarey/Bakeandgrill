import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { WebsiteSettings } from '../pages/SettingsPage/WebsiteSettingsSubPage';
import * as api from '../api';

const toastSuccess = vi.fn();
vi.mock('../components/ui', () => ({
  useToast: () => ({ success: toastSuccess, error: vi.fn() }),
}));

describe('WebsiteSettings Default item photo', () => {
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
        ],
      },
    });
  });

  it('shows Default item photo uploader and saves via brand upload', async () => {
    const uploadSpy = vi.spyOn(api, 'uploadSiteLogo').mockResolvedValue({
      url: '/storage/site/default_item.jpg',
    });

    render(
      <MemoryRouter>
        <WebsiteSettings />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Default item photo')).toBeTruthy();
    expect(screen.getByText(/Shown for menu items that don't have their own photo/i)).toBeTruthy();

    const input = await screen.findByTestId('default-item-image-input');
    const file = new File(['img'], 'default.jpg', { type: 'image/jpeg' });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(uploadSpy).toHaveBeenCalledWith('default_item_image', file);
    });
    expect(toastSuccess).toHaveBeenCalledWith('Default item photo saved.');
    expect(await screen.findByAltText('Default item')).toBeTruthy();
  });
});
