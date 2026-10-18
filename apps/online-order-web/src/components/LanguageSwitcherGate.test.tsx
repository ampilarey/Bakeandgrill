import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ getCustomerMe: vi.fn() }));
vi.mock('../api', () => api);
const state = vi.hoisted(() => ({ auth: true, switcher: 'true', loaded: true, lang: 'en' as 'en' | 'dv', setLang: vi.fn() }));
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ isAuthenticated: state.auth }) }));
vi.mock('../context/SiteSettingsContext', () => ({ useSiteSettingsContext: () => ({ settings: { language_switcher_enabled: state.switcher }, loaded: state.loaded }) }));
vi.mock('../context/LanguageContext', () => ({ useLanguage: () => ({ lang: state.lang, setLang: state.setLang }) }));

import { LanguageSwitcherGate } from './LanguageSwitcherGate';

/* The account keeps the customer's language (iruali import plan, feature 3a). */
describe('LanguageSwitcherGate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(state, { auth: true, switcher: 'true', loaded: true, lang: 'en' });
  });

  it('takes the language the account keeps when a customer signs in', async () => {
    api.getCustomerMe.mockResolvedValue({ customer: { id: 1, preferred_language: 'dv' } });
    render(<LanguageSwitcherGate />);
    await waitFor(() => expect(state.setLang).toHaveBeenCalledWith('dv'));
  });

  it('does not ask while the language switch is off, and puts English back', async () => {
    state.switcher = 'false';
    state.lang = 'dv';
    render(<LanguageSwitcherGate />);
    await waitFor(() => expect(state.setLang).toHaveBeenCalledWith('en'));
    expect(api.getCustomerMe).not.toHaveBeenCalled();
  });

  it('keeps Dhivehi while the settings are still loading (they read as off until then)', async () => {
    state.switcher = 'false';
    state.loaded = false;
    state.lang = 'dv';
    state.auth = false;
    render(<LanguageSwitcherGate />);
    await new Promise((r) => setTimeout(r, 20));
    expect(state.setLang).not.toHaveBeenCalled();
  });
});
