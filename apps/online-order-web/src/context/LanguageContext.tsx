import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import EN from "../i18n/en.json";
import DV from "../i18n/dv.json";

/**
 * UI copy (iruali import plan, feature 3a). English is i18n/en.json, Dhivehi
 * i18n/dv.json; a key with no Dhivehi falls back to English. A new key goes
 * into both files: i18n/dv-missing.json lists the keys that had no Dhivehi on
 * 2026-10-17, and i18n.test.ts fails on a new one missing from dv.json. The
 * Dhivehi shows only while Admin's language switch is on (LanguageSwitcherGate).
 */
type Translations = Record<string, string>;

const TRANSLATIONS: Translations = EN;
const DHIVEHI: Translations = DV;

/** The language translate() reads outside React (kept in step by the provider). */
let currentLang: 'en' | 'dv' = 'en';



type LanguageContextType = {
  t: (key: string) => string;
  /** UI / card language — EN chrome copy; DV selects name_dv / short_description_dv on cards. */
  lang: 'en' | 'dv';
  setLang: (lang: 'en' | 'dv') => void;
};

const LanguageContext = createContext<LanguageContextType>({
  t: (k) => k,
  lang: 'en',
  setLang: () => {},
});

const LANG_STORAGE_KEY = "bakegrill_lang";

function readStoredLang(): 'en' | 'dv' {
  try {
    const v = localStorage.getItem(LANG_STORAGE_KEY);
    return v === 'dv' ? 'dv' : 'en';
  } catch {
    return 'en';
  }
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<'en' | 'dv'>(() => readStoredLang());

  const setLang = useCallback((next: 'en' | 'dv') => {
    setLangState(next);
    try { localStorage.setItem(LANG_STORAGE_KEY, next); } catch { /* private mode / quota */ }
    document.documentElement.lang = next === 'dv' ? 'dv' : 'en';
    document.documentElement.dir = next === 'dv' ? 'rtl' : 'ltr';
  }, []);

  currentLang = lang;

  useEffect(() => {
    document.documentElement.lang = lang === 'dv' ? 'dv' : 'en';
    document.documentElement.dir = lang === 'dv' ? 'rtl' : 'ltr';
  }, [lang]);

  // Stable while the language stays: screens refetch when `t` changes.
  const t = useCallback((key: string) => translate(key, lang), [lang]);

  return (
    <LanguageContext.Provider value={{ t, lang, setLang }}>
      {children}
    </LanguageContext.Provider>
  );
}

/** Lookup copy outside React hooks (e.g. class ErrorBoundary). */
export function translate(key: string, lang: 'en' | 'dv' = currentLang): string {
  return (lang === 'dv' ? DHIVEHI[key] : undefined) || TRANSLATIONS[key] || key;
}

export const useLanguage = () => useContext(LanguageContext);
