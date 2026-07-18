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

  // ── Phase 6 Orders tab strings ────────────────────────────────────────────
  "orders.active_section": { en: "Active Orders",                                        dv: "Active Orders" },
  "orders.past_section":   { en: "Past Orders",                                          dv: "Past Orders" },
  "orders.empty_title":    { en: "No orders yet",                                        dv: "No orders yet" },
  "orders.empty_body":     { en: "Start your first order and it will appear here.",      dv: "Start your first order and it will appear here." },
  "orders.empty_cta":      { en: "Browse the menu",                                      dv: "Browse the menu" },
  "orders.sign_in_prompt": { en: "Sign in to view your order history.",                  dv: "Sign in to view your order history." },
  "orders.track":          { en: "Track",                                                dv: "Track" },
  "orders.view":           { en: "View",                                                 dv: "View" },

  // ── Phase 5 PR3 AuthBlock strings ──────────────────────────────────────────
  "auth.title_phone":      { en: "Your phone number",                        dv: "Your phone number" },
  "auth.sub_phone":        { en: "Enter your Maldives number to sign in.",    dv: "Enter your Maldives number to sign in." },
  "auth.continue":         { en: "Continue →",                               dv: "Continue →" },
  "auth.checking":         { en: "Checking…",                                dv: "Checking…" },
  "auth.guest_cta":        { en: "Checkout as guest — no OTP needed",        dv: "Checkout as guest — no OTP needed" },
  "auth.title_password":   { en: "Welcome back",                             dv: "Welcome back" },
  "auth.signing_as":       { en: "Signing in as +960 {phone}",               dv: "Signing in as +960 {phone}" },
  "auth.forgot":           { en: "Forgot password?",                         dv: "Forgot password?" },
  "auth.different_number": { en: "← Use a different number",                 dv: "← Use a different number" },
  "auth.sign_in":          { en: "Sign in →",                                dv: "Sign in →" },
  "auth.signing_in":       { en: "Signing in…",                              dv: "Signing in…" },
  "auth.title_otp":        { en: "Enter your code",                          dv: "Enter your code" },
  "auth.otp_sent":         { en: "Code sent to +960 {phone}",                dv: "Code sent to +960 {phone}" },
  "auth.confirm":          { en: "Confirm →",                                dv: "Confirm →" },
  "auth.verifying":        { en: "Verifying…",                               dv: "Verifying…" },
  "auth.resend":           { en: "Resend code",                              dv: "Resend code" },
  "auth.resend_in":        { en: "Resend in {n}s",                           dv: "Resend in {n}s" },
  "auth.title_guest":      { en: "Guest checkout",                           dv: "Guest checkout" },
  "auth.sub_guest":        { en: "Enter your name and phone — no account needed.", dv: "Enter your name and phone — no account needed." },
  "auth.back_otp":         { en: "← Sign in with OTP instead",              dv: "← Sign in with OTP instead" },
  "auth.guest_continue":   { en: "Continue to checkout →",                   dv: "Continue to checkout →" },
  "auth.guest_starting":   { en: "Starting…",                                dv: "Starting…" },
  "auth.title_profile":    { en: "One last step",                            dv: "One last step" },
  "auth.sub_profile":      { en: "Set your name and a password so you can sign in next time.", dv: "Set your name and a password so you can sign in next time." },
  "auth.create_account":   { en: "Create account →",                         dv: "Create account →" },
  "auth.saving":           { en: "Saving…",                                  dv: "Saving…" },
  "auth.skip_profile":     { en: "Skip for now — go to checkout",            dv: "Skip for now — go to checkout" },
  "auth.title_forgot":     { en: "Reset your password",                      dv: "Reset your password" },
  "auth.sub_forgot":       { en: "We'll send a code to verify it's you.",    dv: "We'll send a code to verify it's you." },
  "auth.send_reset":       { en: "Send reset code →",                        dv: "Send reset code →" },
  "auth.sending":          { en: "Sending…",                                 dv: "Sending…" },
  "auth.back_pass":        { en: "← Back to sign in",                        dv: "← Back to sign in" },
  "auth.title_forgot_otp": { en: "Enter the code",                           dv: "Enter the code" },
  "auth.reset_sent":       { en: "Reset code sent to +960 {phone}",          dv: "Reset code sent to +960 {phone}" },
  "auth.title_new_pass":   { en: "New password",                             dv: "New password" },
  "auth.new_pass_for":     { en: "New password for +960 {phone}",            dv: "New password for +960 {phone}" },
  "auth.set_password":     { en: "Set password →",                           dv: "Set password →" },

  // ── Phase 6 Account §21 hub strings ──────────────────────────────────────
  "account.title":              { en: "My Account",           dv: "My Account" },
  "account.greeting":           { en: "Hi, {name}",           dv: "Hi, {name}" },
  "account.profile":            { en: "Profile",              dv: "Profile" },
  "account.addresses":          { en: "Addresses",            dv: "Addresses" },
  "account.orders":             { en: "Order History",        dv: "Order History" },
  "account.bookings":           { en: "Bookings",             dv: "Bookings" },
  "account.extras":             { en: "Account extras",       dv: "Account extras" },
  "account.loyalty":            { en: "Loyalty",              dv: "Loyalty" },
  "account.credit":             { en: "Credit Account",       dv: "Credit Account" },
  "account.deposit":            { en: "Deposit Balance",      dv: "Deposit Balance" },
  "account.favourites":         { en: "Favourites",           dv: "Favourites" },
  "account.preorders":          { en: "Pre-orders",           dv: "Pre-orders" },
  "account.reviews":            { en: "Reviews",              dv: "Reviews" },
  "account.push_notifications": { en: "Push notifications",   dv: "Push notifications" },
  "account.logout":             { en: "Sign out",             dv: "Sign out" },
  "account.logout_confirm":     { en: "Sign out of your account?", dv: "Sign out of your account?" },
  "account.link_whatsapp":      { en: "WhatsApp us",          dv: "WhatsApp us" },
  "account.link_viber":         { en: "Message on Viber",     dv: "Message on Viber" },
  "account.referrals":          { en: "Referrals",            dv: "Referrals" },

  // ── Phase 6 RewardsPage strings ────────────────────────────────────────────
  "rewards.sign_in_teaser":     { en: "Sign in to see your loyalty points and referral code",     dv: "Sign in to see your loyalty points and referral code" },
  "rewards.points_available":   { en: "points available",                                         dv: "points available" },
  "rewards.approx_mvr":         { en: "≈ MVR {value}",                                           dv: "≈ MVR {value}" },
  "rewards.tier_member":        { en: "{tier} Member",                                            dv: "{tier} Member" },
  "rewards.progress_to_next":   { en: "{n} pts to reach {tier}",                                  dv: "{n} pts to reach {tier}" },
  "rewards.at_max_tier":        { en: "Maximum tier reached",                                      dv: "Maximum tier reached" },
  "rewards.use_at_checkout":    { en: "Use points at checkout →",                                  dv: "Use points at checkout →" },
  "rewards.referral_title":     { en: "Refer a friend",                                            dv: "Refer a friend" },
  "rewards.referral_body":      { en: "Share your code. Your friend saves on their first order.",  dv: "Share your code. Your friend saves on their first order." },
  "rewards.referral_copy":      { en: "Copy code",                                                 dv: "Copy code" },
  "rewards.referral_copied":    { en: "Copied!",                                                   dv: "Copied!" },
  "rewards.referral_share":     { en: "Share",                                                     dv: "Share" },
  "rewards.referral_uses_one":  { en: "1 friend referred",                                         dv: "1 friend referred" },
  "rewards.referral_uses_many": { en: "{n} friends referred",                                      dv: "{n} friends referred" },
  "rewards.how_title":          { en: "How points work",                                           dv: "How points work" },
  "rewards.how_earn":           { en: "Earn {rate} point per MVR 1 spent on food.",                dv: "Earn {rate} point per MVR 1 spent on food." },
  "rewards.how_redeem":         { en: "{rate} points = MVR 1 off at checkout.",                    dv: "{rate} points = MVR 1 off at checkout." },
  "rewards.how_min":            { en: "Minimum {min} points needed to redeem.",                    dv: "Minimum {min} points needed to redeem." },
  "rewards.how_max_pct":        { en: "Points can cover up to {pct}% of your order total.",        dv: "Points can cover up to {pct}% of your order total." },
  "rewards.how_expand":         { en: "Details",                                                   dv: "Details" },
  "rewards.how_collapse":       { en: "Close",                                                     dv: "Close" },
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

