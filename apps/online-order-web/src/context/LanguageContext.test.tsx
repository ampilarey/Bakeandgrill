import { act, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LanguageProvider, translate, useLanguage } from './LanguageContext';

function Probe() {
  const { t, setLang } = useLanguage();
  return (
    <>
      <span data-testid="menu">{t('nav.menu')}</span>
      <span data-testid="fallback">{t('no.such_key')}</span>
      <button type="button" onClick={() => setLang('dv')}>dv</button>
    </>
  );
}

/* Dhivehi for every key (feature 3b); an unknown key shows as itself. */
describe('LanguageContext', () => {
  it('shows Dhivehi in Dhivehi and English in English', () => {
    render(<LanguageProvider><Probe /></LanguageProvider>);
    expect(screen.getByTestId('menu').textContent).toBe('Menu');

    act(() => screen.getByText('dv').click());

    expect(screen.getByTestId('menu').textContent).toBe('މެނޫ');
    expect(screen.getByTestId('fallback').textContent).toBe('no.such_key');
    expect(translate('menu.load_failed')).toBe('މެނޫ ލޯޑެއް ނުކުރެވުނު. ކަނެކްޝަން ބައްލަވައި އަލުން މަސައްކަތް ކުރައްވާ.');
    expect(translate('menu.load_failed', 'en')).toBe("Couldn't load the menu. Check your connection and try again.");
    expect(document.documentElement.dir).toBe('rtl');
    expect(translate('nav.menu')).toBe('މެނޫ');
    expect(translate('nav.menu', 'en')).toBe('Menu');
    act(() => { localStorage.clear(); });
  });
});
