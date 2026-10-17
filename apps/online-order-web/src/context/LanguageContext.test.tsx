import { act, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LanguageProvider, translate, useLanguage } from './LanguageContext';

function Probe() {
  const { t, setLang } = useLanguage();
  return (
    <>
      <span data-testid="menu">{t('nav.menu')}</span>
      <span data-testid="fallback">{t('menu.load_failed')}</span>
      <button type="button" onClick={() => setLang('dv')}>dv</button>
    </>
  );
}

/* Dhivehi where it exists, English where it does not yet (feature 3a). */
describe('LanguageContext', () => {
  it('shows Dhivehi for a translated key and English for the rest', () => {
    render(<LanguageProvider><Probe /></LanguageProvider>);
    expect(screen.getByTestId('menu').textContent).toBe('Menu');

    act(() => screen.getByText('dv').click());

    expect(screen.getByTestId('menu').textContent).toBe('މެނޫ');
    expect(screen.getByTestId('fallback').textContent).toBe("Couldn't load the menu. Check your connection and try again.");
    expect(document.documentElement.dir).toBe('rtl');
    expect(translate('nav.menu')).toBe('މެނޫ');
    expect(translate('nav.menu', 'en')).toBe('Menu');
    act(() => { localStorage.clear(); });
  });
});
