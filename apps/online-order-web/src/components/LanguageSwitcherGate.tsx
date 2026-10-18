import { useEffect, useRef } from 'react';
import { getCustomerMe } from '../api';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { useSiteSettingsContext } from '../context/SiteSettingsContext';

/** True when Content Hub "Show language switcher" is on. */
export function isLanguageSwitcherEnabled(settings: { language_switcher_enabled?: string }): boolean {
  const v = settings.language_switcher_enabled;
  return v === 'true' || v === '1';
}

/**
 * When the admin toggle is off, force English so a leftover bakegrill_lang=dv
 * does not leave customers in RTL English with no way to switch back. While
 * it is on, a customer who signs in gets the language their account keeps
 * (preferred_language), once per sign-in (iruali import plan, feature 3a).
 */
export function LanguageSwitcherGate() {
  const { settings, loaded } = useSiteSettingsContext();
  const { lang, setLang } = useLanguage();
  const { isAuthenticated } = useAuth();
  const enabled = isLanguageSwitcherEnabled(settings);
  const adopted = useRef(false);

  // Only once the server has answered: before that the settings are the
  // defaults (switch off), and acting on them reset every Dhivehi customer to
  // English on each page load (found by the Dhivehi phone-width check, 3b).
  useEffect(() => {
    if (loaded && !enabled && lang !== 'en') {
      setLang('en');
    }
  }, [loaded, enabled, lang, setLang]);

  useEffect(() => {
    if (!isAuthenticated) {
      adopted.current = false;
      return;
    }
    if (!enabled || adopted.current) return;
    adopted.current = true;
    let cancelled = false;
    getCustomerMe()
      .then((res) => {
        const kept = (res.customer as { preferred_language?: string | null }).preferred_language;
        if (!cancelled && (kept === 'en' || kept === 'dv')) setLang(kept);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [enabled, isAuthenticated, setLang]);

  return null;
}
