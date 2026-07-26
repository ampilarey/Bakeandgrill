import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { WebsiteSettings } from '../pages/SettingsPage/WebsiteSettingsSubPage';

vi.mock('../components/ui', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}));

describe('WebsiteSettings branding editors moved to hub', () => {
  it('no longer renders default item photo or new-items editors', () => {
    render(
      <MemoryRouter>
        <WebsiteSettings />
      </MemoryRouter>,
    );

    expect(screen.queryByText('Default item photo')).toBeNull();
    expect(screen.queryByTestId('default-item-image-input')).toBeNull();
    expect(screen.queryByTestId('menu-new-days-input')).toBeNull();
    expect(screen.getByRole('link', { name: /Open Branding/i }).getAttribute('href')).toBe(
      '/content?group=Branding',
    );
  });
});
