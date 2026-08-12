import { useEffect } from 'react';
import { useLanguage } from '../context/LanguageContext';
import { useSiteSettingsContext } from '../context/SiteSettingsContext';

/** True when Content Hub "Show language switcher" is on. */
export function isLanguageSwitcherEnabled(settings: { language_switcher_enabled?: string }): boolean {
  const v = settings.language_switcher_enabled;
  return v === 'true' || v === '1';
}

/**
 * When the admin toggle is off, force English so a leftover bakegrill_lang=dv
 * does not leave customers in RTL English with no way to switch back.
 */
export function LanguageSwitcherGate() {
  const { settings } = useSiteSettingsContext();
  const { lang, setLang } = useLanguage();
  const enabled = isLanguageSwitcherEnabled(settings);

  useEffect(() => {
    if (!enabled && lang !== 'en') {
      setLang('en');
    }
  }, [enabled, lang, setLang]);

  return null;
}
