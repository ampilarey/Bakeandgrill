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
  "mode.pickup": { en: "Pickup", dv: "Pickup" },
  "mode.delivery": { en: "Delivery", dv: "Delivery" },
  "mode.toggle_aria": { en: "Order mode", dv: "Order mode" },
  "menu.categories": { en: "Categories", dv: "Categories" },
  "menu.clear_filters": { en: "Clear filters", dv: "Clear filters" },
  "menu.toast_prune_one": { en: "{n} cart item removed for this order mode.", dv: "{n} cart item removed for this order mode." },
  "menu.toast_prune_many": { en: "{n} cart items removed for this order mode.", dv: "{n} cart items removed for this order mode." },
  "menu.toast_delivery_fallback": { en: "No delivery items right now — showing pickup menu instead.", dv: "No delivery items right now — showing pickup menu instead." },
  "cart.edit": { en: "Edit", dv: "Edit" },
  "common.cancel": { en: "Cancel", dv: "Cancel" },
  "common.clear": { en: "Clear", dv: "Clear" },
  "menu.search_aria": { en: "Search menu", dv: "Search menu" },
  "menu.search_results_count": { en: "{n} results", dv: "{n} results" },
  "menu.popular": { en: "Popular", dv: "Popular" },
  "menu.no_results": { en: "No results for '{q}'", dv: "No results for '{q}'" },
  "menu.sort_price_low": { en: "Price ↑", dv: "Price ↑" },
  "menu.sort_price_high": { en: "Price ↓", dv: "Price ↓" },
  "menu.filter_all": { en: "All items", dv: "All items" },
  "menu.filter_specials": { en: "Specials", dv: "Specials" },
  "menu.filter_all_diets": { en: "All diets", dv: "All diets" },
  "menu.open_search": { en: "Search", dv: "Search" },
  "a11y.announcement": { en: "Site announcement", dv: "Site announcement" },

  // ── Phase 4 Home strings ───────────────────────────────────────────────────
  "home.sign_in":              { en: "Sign in",                       dv: "Sign in" },
  "home.chip_rewards":         { en: "points",                        dv: "points" },
  "home.chip_sign_in_points":  { en: "Sign in to earn points",        dv: "Sign in to earn points" },
  "home.chip_order":           { en: "Track order",                   dv: "Track order" },
  "home.chip_no_order":        { en: "No active order",               dv: "No active order" },
  "home.chip_specials":        { en: "specials today",                dv: "specials today" },
  "home.specials_title":       { en: "Today's specials",              dv: "Today's specials" },
  "home.see_all":              { en: "See all →",                     dv: "See all →" },
  "home.order_again":          { en: "Order again",                   dv: "Order again" },
  "home.reorder":              { en: "Order again",                   dv: "Order again" },
  "home.reordering":           { en: "Adding…",                       dv: "Adding…" },
  "home.promo_region":         { en: "Promotional banner",            dv: "Promotional banner" },
  "home.mode_delivery_hint":   { en: "Delivered to your door in 30–45 min", dv: "Delivered to your door in 30–45 min" },
  "home.mode_pickup_hint":     { en: "Pick up at our Kalaafaanu Hingun location", dv: "Pick up at our Kalaafaanu Hingun location" },
  "home.footer_thanks":        { en: "Thank you for choosing Bake & Grill. Made with love in Malé.", dv: "Thank you for choosing Bake & Grill. Made with love in Malé." },
  "home.footer_whatsapp":      { en: "WhatsApp",                      dv: "WhatsApp" },
  "home.footer_viber":         { en: "Viber",                         dv: "Viber" },
  "home.corporate_thanks":     { en: "Thanks — we'll be in touch!",   dv: "Thanks — we'll be in touch!" },
  "prayer.aria":               { en: "Prayer times",                  dv: "Prayer times" },
  "prayer.title":              { en: "Prayer Times",                  dv: "Prayer Times" },
  "prayer.next_in":            { en: "next in {t}",                   dv: "next in {t}" },
  "prayer.use_location":       { en: "Use my location",               dv: "Use my location" },
  "prayer.change_island":      { en: "Change island",                 dv: "Change island" },
  "prayer.search_island":      { en: "Search island or atoll…",       dv: "Search island or atoll…" },
  "prayer.no_islands":         { en: "No islands found",              dv: "No islands found" },
  "prayer.unavailable":        { en: "Prayer times unavailable",      dv: "Prayer times unavailable" },
  "prayer.offline_cached":     { en: "Offline — cached times",        dv: "Offline — cached times" },
  "prayer.cached":             { en: "Showing cached times",          dv: "Showing cached times" },

  // ── Phase 5 Checkout accordion strings ────────────────────────────────────
  "checkout.acc_order_type":     { en: "Order Type",                   dv: "Order Type" },
  "checkout.acc_pickup":         { en: "Pickup Time",                  dv: "Pickup Time" },
  "checkout.acc_delivery":       { en: "Delivery Details",             dv: "Delivery Details" },
  "checkout.acc_discounts":      { en: "Discounts & Rewards",          dv: "Discounts & Rewards" },
  "checkout.acc_notes":          { en: "Special Instructions",         dv: "Special Instructions" },
  "checkout.acc_payment":        { en: "Payment",                      dv: "Payment" },
  "checkout.acc_payment_summary":{ en: "BML",                          dv: "BML" },
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

