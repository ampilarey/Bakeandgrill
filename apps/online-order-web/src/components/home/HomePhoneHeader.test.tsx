import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { HomePhoneHeader } from './HomePhoneHeader';

vi.mock('../../context/LanguageContext', () => ({
  useLanguage: () => ({
    t: (key: string) =>
      ({
        'home.sign_in': 'Sign in',
        'nav.account': 'Account',
        'header.website_aria': 'Visit {name} website',
      })[key] ?? key,
  }),
}));

vi.mock('../../context/SiteSettingsContext', () => ({
  useSiteSettingsContext: () => ({
    settings: { site_name: 'Bake & Grill', logo: '/logo.png' },
  }),
}));

describe('HomePhoneHeader', () => {
  it('shows brand and sign-in when logged out', () => {
    render(
      <MemoryRouter>
        <HomePhoneHeader customerName={null} isAuthenticated={false} />
      </MemoryRouter>,
    );

    expect(screen.getByTestId('home-phone-header')).toBeTruthy();
    expect(screen.getByText('Bake & Grill')).toBeTruthy();
    expect(screen.getByText('Sign in')).toBeTruthy();
  });

  it('shows account chip with phone when authenticated', () => {
    render(
      <MemoryRouter>
        <HomePhoneHeader customerName="9120011" isAuthenticated />
      </MemoryRouter>,
    );

    expect(screen.getByText('9120011')).toBeTruthy();
    expect(screen.queryByText('Sign in')).toBeNull();
  });
});
