import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

type Lang = "en" | "dv";

type Translations = Record<string, Record<Lang, string>>;

const TRANSLATIONS: Translations = {
  "menu.title": { en: "Our Menu", dv: "އަހަރެމެންގެ މެނޫ" },
  "menu.search": { en: "Search menu…", dv: "މެނޫ ހޯދާ…" },
  "cart.title": { en: "Your Cart", dv: "ތިބާގެ ކާތް" },
  "cart.empty": { en: "Your cart is empty — add something to get started", dv: "ކާތް ހުސް" },
  "cart.checkout": { en: "Proceed to Checkout", dv: "ޗެކްއައުޓް" },
  "checkout.title": { en: "Checkout", dv: "ޗެކްއައުޓް" },
  "reserve.title": { en: "Reserve a Table", dv: "ތާ ބުކް ކުރޭ" },
  "order.status.pending": { en: "Order Received", dv: "އޯޑަރ ލިބިއްޖެ" },
  "order.status.preparing": { en: "Being Prepared", dv: "ތައްޔާރު ކުރަނީ" },
  "order.status.ready": { en: "Ready", dv: "ތައްޔާރު" },
  "order.status.completed": { en: "Completed", dv: "ނިމިއްޖެ" },
  "closed.message": { en: "We are currently closed", dv: "ދެންނެވި ވަގުތުތައް ތަކެ ހިދުމަތެ ނެތް" },
  "cart.view": { en: "View cart", dv: "View cart" },
  "order.status.payment_pending": { en: "Awaiting payment", dv: "Awaiting payment" },
  "order.status.paid": { en: "Confirmed", dv: "Confirmed" },
  "order.status.cancelled": { en: "Cancelled", dv: "Cancelled" },
  "nav.home": { en: "Home", dv: "Home" },
  "nav.menu": { en: "Menu", dv: "Menu" },
  "nav.orders": { en: "Orders", dv: "Orders" },
  "nav.rewards": { en: "Rewards", dv: "Rewards" },
  "nav.account": { en: "Account", dv: "Account" },
  "nav.aria": { en: "Main navigation", dv: "Main navigation" },
  "common.back": { en: "Back", dv: "Back" },
  "common.change": { en: "Change", dv: "Change" },
  "common.try_again": { en: "Try again", dv: "Try again" },
  "common.loading": { en: "Loading", dv: "Loading" },
  "common.skip_content": { en: "Skip to content", dv: "Skip to content" },
  "common.on": { en: "On", dv: "On" },
  "common.off": { en: "Off", dv: "Off" },
  "sheet.close": { en: "Close", dv: "Close" },
  "sheet.dialog": { en: "Dialog", dv: "Dialog" },
  "error.generic_title": { en: "Something went wrong", dv: "Something went wrong" },
  "orders.active_capsule": { en: "Order", dv: "Order" },
  "orders.active_badge": { en: "Active order", dv: "Active order" },
  "rewards.title": { en: "Rewards", dv: "Rewards" },
  "rewards.stub_title": { en: "Loyalty & rewards", dv: "Loyalty & rewards" },
  "rewards.stub_body": { en: "Sign in to see your points. Gift cards and loyalty redemption stay at checkout.", dv: "Sign in to see your points. Gift cards and loyalty redemption stay at checkout." },
  "rewards.stub_cta": { en: "Go to account", dv: "Go to account" },
  "rewards.checkout_cta": { en: "Use at checkout", dv: "Use at checkout" },
  "home.greeting_hello": { en: "Hello", dv: "Hello" },
  "home.greeting_named": { en: "Hello, {name}", dv: "Hello, {name}" },
  "home.greeting_sub": { en: "What would you like today?", dv: "What would you like today?" },
  "account.settings": { en: "Settings", dv: "Settings" },
  "account.dark_mode": { en: "Dark mode", dv: "Dark mode" },
  "account.language": { en: "Language", dv: "Language" },
  "account.lang_en": { en: "English", dv: "English" },
  "account.lang_dv": { en: "Dhivehi", dv: "Dhivehi" },
  "account.more_links": { en: "More", dv: "More" },
  "account.link_preorder": { en: "Pre-Order", dv: "Pre-Order" },
  "account.link_reservations": { en: "Reservations", dv: "Reservations" },
  "account.link_hours": { en: "Hours", dv: "Hours" },
  "account.link_contact": { en: "Contact", dv: "Contact" },
  "account.link_about": { en: "About", dv: "About" },
  "account.link_privacy": { en: "Privacy", dv: "Privacy" },
  "account.link_orders": { en: "Order history", dv: "Order history" },
  "account.link_terms": { en: "Terms & Conditions", dv: "Terms & Conditions" },
  "account.link_refund": { en: "Refund Policy", dv: "Refund Policy" },
  "account.prayer_times": { en: "Prayer times", dv: "Prayer times" },
  "a11y.announcement": { en: "Site announcement", dv: "Site announcement" },
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
    try { localStorage.setItem("bakegrill_lang", l); } catch { /* private mode / quota */ }
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

