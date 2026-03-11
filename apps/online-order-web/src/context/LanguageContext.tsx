import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

type Lang = "en" | "dv";

type Translations = Record<string, Record<Lang, string>>;

const TRANSLATIONS: Translations = {
  "menu.title":          { en: "Our Menu",       dv: "އަހަރެމެންގެ މެނޫ" },
  "menu.search":         { en: "Search menu…",   dv: "މެނޫ ހޯދާ…" },
  "cart.title":          { en: "Your Cart",       dv: "ތިބާގެ ކާތް" },
  "cart.empty":          { en: "Your cart is empty", dv: "ކާތް ހުސް" },
  "cart.checkout":       { en: "Proceed to Checkout", dv: "ޗެކްއައުޓް" },
  "checkout.title":      { en: "Checkout",        dv: "ޗެކްއައުޓް" },
  "reserve.title":       { en: "Reserve a Table", dv: "ތާ ބުކް ކުރޭ" },
  "order.status.pending":   { en: "Order Received",   dv: "އޯޑަރ ލިބިއްޖެ" },
  "order.status.preparing": { en: "Being Prepared",   dv: "ތައްޔާރު ކުރަނީ" },
  "order.status.ready":     { en: "Ready",             dv: "ތައްޔާރު" },
  "order.status.completed": { en: "Completed",         dv: "ނިމިއްޖެ" },
  "closed.message":      { en: "We are currently closed", dv: "ދެންނެވި ވަގުތުތައް ތަކެ ހިދުމަތެ ނެތް" },
};

type LanguageContextType = {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: string) => string;
};

const LanguageContext = createContext<LanguageContextType>({
  lang: "en",
  setLang: () => {},
  t: (k) => k,
});

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    const saved = localStorage.getItem("bakegrill_lang") as Lang | null;
    return saved ?? "en";
  });

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir  = lang === "dv" ? "rtl" : "ltr";
  }, [lang]);

  const setLang = (l: Lang) => {
    setLangState(l);
    localStorage.setItem("bakegrill_lang", l);
  };

  const t = (key: string): string => {
    return TRANSLATIONS[key]?.[lang] ?? TRANSLATIONS[key]?.en ?? key;
  };

  return (
    <LanguageContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export const useLanguage = () => useContext(LanguageContext);
