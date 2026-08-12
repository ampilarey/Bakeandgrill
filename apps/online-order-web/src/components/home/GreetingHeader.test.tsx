import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GreetingHeader } from './GreetingHeader';

vi.mock('../../context/LanguageContext', () => ({
  useLanguage: () => ({
    t: (key: string) =>
      ({
        'home.greeting_hello': 'Hello',
        'home.greeting_named': 'Hello, {name}',
        'home.greeting_sub': 'What would you like today?',
        'home.sign_in': 'Sign in',
        'nav.account': 'Account',
        'header.website_aria': 'Visit {name} website',
      })[key] ?? key,
  }),
}));

const textMock = vi.fn((key: string, fallback: string) => {
  const cms: Record<string, string> = {
    order_home_greeting_hello: 'Hey there',
    order_home_greeting_named: 'Hey, {name}',
    order_home_greeting_sub: 'Ready to order?',
  };
  return cms[key] ?? fallback;
});

vi.mock('../../context/SiteSettingsContext', () => ({
  useSiteSettingsContext: () => ({
    settings: { site_name: 'Bake & Grill', logo: '/logo.png' },
    text: textMock,
  }),
}));

describe('GreetingHeader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows CMS greeting + subtitle on phone chrome', () => {
    render(
      <MemoryRouter>
        <GreetingHeader customerName={null} isAuthenticated={false} chrome="phone" />
      </MemoryRouter>,
    );

    expect(screen.getByTestId('home-greeting')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Hey there');
    expect(screen.getByText('Ready to order?')).toBeTruthy();
    expect(screen.getByText('Bake & Grill')).toBeTruthy();
    expect(screen.getByText('Sign in')).toBeTruthy();
  });

  it('uses profile name in CMS named greeting, not a phone number', () => {
    const { rerender } = render(
      <MemoryRouter>
        <GreetingHeader customerName="Aisha" isAuthenticated chrome="phone" />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Hey, Aisha');

    rerender(
      <MemoryRouter>
        <GreetingHeader customerName="9120011" isAuthenticated chrome="desktop" />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Hey there');
    expect(screen.queryByText('Bake & Grill')).toBeNull();
  });
});
