import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { WebsiteSettings } from '../pages/SettingsPage/WebsiteSettingsSubPage';

vi.mock('../components/ui', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}));

describe('WebsiteSettings Dine-in menu', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows dine-in URL and QR only', async () => {
    render(
      <MemoryRouter>
        <WebsiteSettings />
      </MemoryRouter>,
    );

    expect(await screen.findByTestId('dinein-menu-card')).toBeTruthy();
    expect(screen.getByTestId('dinein-menu-qr')).toBeTruthy();
    expect(screen.getByTestId('dinein-menu-url').textContent).toContain('/menu');
    expect(screen.getByTestId('dinein-menu-url').textContent).not.toContain('/order/view');
    expect(screen.queryByTestId('menu-new-days-input')).toBeNull();
  });
});
