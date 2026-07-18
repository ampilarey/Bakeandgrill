# Dhivehi strings pending native review

Phase 2 follow-up: every **new** (unreviewed) `t()` key ships with `dv` equal to
its English value so garbled Thaana never reaches customers. Replace the `dv`
field in `apps/online-order-web/src/context/LanguageContext.tsx` after native review.

## Keys

- `cart.view`
- `order.status.payment_pending`
- `order.status.paid`
- `order.status.cancelled`
- `nav.home`
- `nav.menu`
- `nav.orders`
- `nav.rewards`
- `nav.account`
- `nav.aria`
- `common.back`
- `common.change`
- `common.try_again`
- `common.loading`
- `common.skip_content`
- `common.on`
- `common.off`
- `sheet.close`
- `sheet.dialog`
- `error.generic_title`
- `orders.active_capsule`
- `orders.active_badge`
- `rewards.title`
- `rewards.stub_title`
- `rewards.stub_body`
- `rewards.stub_cta`
- `rewards.checkout_cta`
- `home.greeting_hello`
- `home.greeting_named`
- `home.greeting_sub`
- `account.settings`
- `account.dark_mode`
- `account.language`
- `account.lang_en`
- `account.lang_dv`
- `account.more_links`
- `account.link_preorder`
- `account.link_reservations`
- `account.link_hours`
- `account.link_contact`
- `account.link_about`
- `account.link_privacy`
- `account.link_orders`
- `account.link_terms`
- `account.link_refund`
- `account.prayer_times`
- `a11y.announcement`
- `mode.pickup`
- `mode.delivery`
- `menu.categories`
- `menu.clear_filters`
- `common.cancel`
- `common.clear`
- `menu.search_aria`
- `menu.search_results_count`
- `menu.popular`
- `menu.no_results`
- `menu.sort_price_low`
- `menu.sort_price_high`
- `menu.filter_all`
- `menu.filter_specials`
- `menu.filter_all_diets`
- `menu.open_search`
- `mode.toggle_aria`
- `menu.toast_prune_one`
- `menu.toast_prune_many`
- `menu.toast_delivery_fallback`
- `cart.edit`

## Phase 5 Checkout accordion keys (added Jul 2026)

- `checkout.acc_order_type`
- `checkout.acc_pickup`
- `checkout.acc_delivery`
- `checkout.acc_discounts`
- `checkout.acc_notes`
- `checkout.acc_payment`
- `checkout.acc_payment_summary`

## Phase 4 Home keys (added Jul 2026)

- `home.sign_in`
- `home.chip_rewards`
- `home.chip_sign_in_points`
- `home.chip_order`
- `home.chip_no_order`
- `home.chip_specials`
- `home.specials_title`
- `home.see_all`
- `home.order_again`
- `home.reorder`
- `home.reordering`
- `home.promo_region`
- `home.mode_delivery_hint`
- `home.mode_pickup_hint`
- `home.footer_thanks`
- `home.footer_whatsapp`
- `home.footer_viber`
- `home.corporate_thanks`
- `prayer.aria`
- `prayer.title`
- `prayer.next_in`
- `prayer.use_location`
- `prayer.change_island`
- `prayer.search_island`
- `prayer.no_islands`
- `prayer.unavailable`
- `prayer.offline_cached`
- `prayer.cached`

## Phase 5 PR3 AuthBlock keys (added Jul 2026)

New chrome strings for the restyled AuthBlock — all `dv` values equal their
English counterparts and need native Dhivehi review before shipping in Dv mode.

- `auth.title_phone`       — step heading: "Your phone number"
- `auth.sub_phone`         — step subtitle
- `auth.continue`          — primary CTA on phone / forgot-otp steps
- `auth.checking`          — loading state while checking phone
- `auth.guest_cta`         — ghost button: "Checkout as guest — no OTP needed"
- `auth.title_password`    — step heading: "Welcome back"
- `auth.signing_as`        — subtitle with +960 {phone} placeholder
- `auth.forgot`            — ghost button: "Forgot password?"
- `auth.different_number`  — back link (password / otp / forgot-otp steps)
- `auth.sign_in`           — primary CTA on password step
- `auth.signing_in`        — loading state on password step
- `auth.title_otp`         — step heading: "Enter your code"
- `auth.otp_sent`          — subtitle with +960 {phone} placeholder
- `auth.confirm`           — primary CTA on OTP step
- `auth.verifying`         — loading state on OTP step
- `auth.resend`            — resend link when timer is done
- `auth.resend_in`         — resend link with {n}s countdown
- `auth.title_guest`       — step heading: "Guest checkout"
- `auth.sub_guest`         — step subtitle
- `auth.back_otp`          — back link on guest step
- `auth.guest_continue`    — primary CTA on guest step
- `auth.guest_starting`    — loading state on guest step
- `auth.title_profile`     — step heading: "One last step"
- `auth.sub_profile`       — step subtitle
- `auth.create_account`    — primary CTA on profile-setup step
- `auth.saving`            — loading state (profile-setup & reset steps)
- `auth.skip_profile`      — skip link on profile-setup step
- `auth.title_forgot`      — step heading: "Reset your password"
- `auth.sub_forgot`        — step subtitle
- `auth.send_reset`        — primary CTA on forgot-phone step
- `auth.sending`           — loading state on forgot-phone step
- `auth.back_pass`         — back link on forgot-phone step
- `auth.title_forgot_otp`  — step heading: "Enter the code"
- `auth.reset_sent`        — subtitle with +960 {phone} placeholder
- `auth.title_new_pass`    — step heading: "New password"
- `auth.new_pass_for`      — subtitle with +960 {phone} placeholder
- `auth.set_password`      — primary CTA on reset-password step
