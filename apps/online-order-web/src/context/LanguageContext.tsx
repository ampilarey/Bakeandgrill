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
  "cart.view": { en: "View cart", dv: "ކާތް ނަލާ" },
  "order.status.payment_pending": { en: "Awaiting payment", dv: "ފައވސާ އިންމި އވން" },
  "order.status.paid": { en: "Confirmed", dv: "ބަސީންކުރިވފައ" },
  "order.status.cancelled": { en: "Cancelled", dv: "ކިންސަލްކުރިވފައ" },
  "nav.home": { en: "Home", dv: "ހޯމް" },
  "nav.menu": { en: "Menu", dv: "މެނޫ" },
  "nav.orders": { en: "Orders", dv: "އޯޑަރތައް" },
  "nav.rewards": { en: "Rewards", dv: "ރިވޯޑްސް" },
  "nav.account": { en: "Account", dv: "އެކައުންޓް" },
  "nav.aria": { en: "Main navigation", dv: "މައވ ނިވވގޭޖަން" },
  "common.back": { en: "Back", dv: "ފަހަތަޗް" },
  "common.change": { en: "Change", dv: "ނަދަލު" },
  "common.try_again": { en: "Try again", dv: "އަލުން މަސައްކަތް ކުރޭ" },
  "common.loading": { en: "Loading", dv: "ލޯޑްވަނީ" },
  "common.skip_content": { en: "Skip to content", dv: "ކޮންޓިންޓަޗް ދޭ" },
  "common.on": { en: "On", dv: "އޮން" },
  "common.off": { en: "Off", dv: "އޮފް" },
  "sheet.close": { en: "Close", dv: "ލައްޕާ" },
  "sheet.dialog": { en: "Dialog", dv: "ޑަބަލޮގް" },
  "error.generic_title": { en: "Something went wrong", dv: "މައްސަލައިއް ދވމާވިއްޖި" },
  "orders.active_capsule": { en: "Order", dv: "އޯޑަރ" },
  "orders.active_badge": { en: "Active order", dv: "ހވނަގަމުންދާ އޯޑަރ" },
  "rewards.title": { en: "Rewards", dv: "ރިވޯޑްސް" },
  "rewards.stub_title": { en: "Loyalty & rewards", dv: "ލޮބަލްޓީ އަދވ ރިވޯޑްސް" },
  "rewards.stub_body": { en: "Sign in to see your points. Gift cards and loyalty redemption stay at checkout.", dv: "ކާތް ހުސް" },
  "rewards.stub_cta": { en: "Go to account", dv: "އެކައުންޓްަޗް" },
  "rewards.checkout_cta": { en: "Use at checkout", dv: "ޗެކްއައުޓްގައވ ނޭނުންކުރޭ" },
  "home.greeting_hello": { en: "Hello", dv: "އައްސަލާމް" },
  "home.greeting_named": { en: "Hello, {name}", dv: "އައްސަލާމް، {name}" },
  "home.greeting_sub": { en: "What would you like today?", dv: "މވއަދު ކޮންއިއް ނޭނުންވާޗިވިވ؟" },
  "account.settings": { en: "Settings", dv: "ސިޓވންތައް" },
  "account.dark_mode": { en: "Dark mode", dv: "ދަރުކުރުން" },
  "account.language": { en: "Language", dv: "ނަސް" },
  "account.lang_en": { en: "English", dv: "English" },
  "account.lang_dv": { en: "Dhivehi", dv: "ދިވެހި" },
  "account.more_links": { en: "More", dv: "އވތުރު" },
  "account.link_preorder": { en: "Pre-Order", dv: "ޕްރީ-އޯޑަރ" },
  "account.link_reservations": { en: "Reservations", dv: "ރވޒަވޭޖަން" },
  "account.link_hours": { en: "Hours", dv: "ވަގުތު" },
  "account.link_contact": { en: "Contact", dv: "ގުޅުން" },
  "account.link_about": { en: "About", dv: "ތަނޢާރަފް" },
  "account.link_privacy": { en: "Privacy", dv: "ޕްރައވވިސީ" },
  "account.link_orders": { en: "Order history", dv: "އޯޑަރ ހވސްޓްރީ" },
  "account.link_terms": { en: "Terms & Conditions", dv: "ޖަރުތުތައް" },
  "account.link_refund": { en: "Refund Policy", dv: "ރީފަންޑް ސވބާސަތު" },
  "account.prayer_times": { en: "Prayer times", dv: "ނަމާދު ވަގުތު" },
  "a11y.announcement": { en: "Site announcement", dv: "އިނައުންސްމަންޓް" },
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

