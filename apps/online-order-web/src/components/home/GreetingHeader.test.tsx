import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GreetingHeader } from './GreetingHeader';

vi.mock('../../context/LanguageContext', () => ({
  useLanguage: () => ({
    t: (key: string) =>
      ({
        'home.greeting_hello': 'Hello',
        'home.greeting_named': 'Hello, {name}',
        'home.greeting_sub': 'What would you like today?',
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

  it('shows CMS greeting + subtitle without brand chrome', () => {
    render(
      <GreetingHeader customerName={null} isAuthenticated={false} chrome="phone" />,
    );

    expect(screen.getByTestId('home-greeting')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Hey there');
    expect(screen.getByText('Ready to order?')).toBeTruthy();
    expect(screen.queryByText('Bake & Grill')).toBeNull();
    expect(screen.queryByText('Sign in')).toBeNull();
  });

  it('uses profile name in CMS named greeting, not a phone number', () => {
    const { rerender } = render(
      <GreetingHeader customerName="Aisha" isAuthenticated chrome="phone" />,
    );
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Hey, Aisha');

    rerender(
      <GreetingHeader customerName="9120011" isAuthenticated chrome="desktop" />,
    );
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Hey there');
  });
});
