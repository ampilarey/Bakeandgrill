# Bake & Grill — Complete Feature Build Prompt

You are adding new features to a full-stack monorepo (Laravel 12 backend + 4 React/Vite frontends) for a cafe in the Maldives. The codebase uses DDD with repository pattern, DTOs, and event-driven architecture.

## Project Structure

```
Bakeandgrill/
├── backend/                    # Laravel 12 + PHP 8.5 API
│   ├── app/
│   │   ├── Domains/           # DDD domains (Orders, Payments, Printing, Inventory, Loyalty, Promotions, Delivery, KitchenDisplay, Notifications, Realtime, Shifts)
│   │   ├── Http/Controllers/Api/
│   │   ├── Models/            # 45+ Eloquent models
│   │   ├── Services/
│   │   └── Providers/Domains/
│   ├── routes/api.php
│   └── database/migrations/
├── apps/
│   ├── pos-web/               # Point of Sale (React) — decomposed into pages/hooks/components
│   ├── online-order-web/      # Customer ordering (React) — decomposed
│   ├── kds-web/               # Kitchen Display System (React)
│   └── admin-dashboard/       # Admin panel (React) — 10 pages
├── packages/shared/           # Shared types + API client
│   └── src/
│       ├── types/             # order.ts, product.ts, customer.ts, payment.ts
│       └── api/client.ts      # createApiClient() factory
└── print-proxy/               # Node.js ESC/POS print server
```

## Existing Architecture Patterns — Follow These

- **Backend:** Repository pattern (interface + Eloquent implementation), DTOs for cross-domain data, domain service providers, event-driven listeners with error isolation
- **Frontend:** Pages → Hooks → Components → Services separation. All types in `packages/shared`. Apps import via `@shared/*` path alias.
- **Currency:** All monetary values stored as integers in Laari (1 MVR = 100 Laari). Use the `Money` value object.
- **Auth:** Laravel Sanctum with abilities (`staff`, `customer`). Staff use PIN login, customers use OTP/SMS.
- **Real-time:** Server-Sent Events (SSE) for live updates.
- **SMS:** Dhiraagu provider for OTP, notifications, campaigns.

## Existing Features (DO NOT rebuild)

Orders, Payments (BML + Cash), POS, KDS, Online Ordering (Takeaway/Delivery), Loyalty Points & Tiers, Promotions/Promo Codes, Inventory & Stock, Printing (ESC/POS), SMS Campaigns, Staff Management, Shifts, Table Management, Delivery with Zone Fees, Reports (Sales/X-Z/Inventory), Receipts (Email/SMS), Audit Logs, Opening Hours, Pre-orders/Events.

---

## Phase 1 — Customer Experience Features

### 1.1 Table Reservations

**Backend:**
- Create domain: `app/Domains/Reservations/`
- Migration: `reservations` table — `id`, `customer_id` (nullable), `customer_name`, `customer_phone`, `party_size`, `date`, `time_slot`, `duration_minutes` (default 60), `table_id` (nullable), `status` (pending/confirmed/seated/completed/cancelled/no_show), `notes`, `created_at`, `updated_at`
- Migration: `reservation_settings` table — `id`, `slot_duration_minutes`, `max_party_size`, `advance_booking_days`, `buffer_minutes_between`, `auto_cancel_minutes`, `created_at`, `updated_at`
- Model: `Reservation`, `ReservationSetting`
- Repository: `ReservationRepositoryInterface` + `EloquentReservationRepository`
- Service: `ReservationService` — create, confirm, cancel, check availability, auto-assign table, find conflicts
- DTOs: `CreateReservationData`, `ReservationSlotData`
- API endpoints:
  - `POST /api/reservations` — create reservation (customer or guest)
  - `GET /api/reservations/availability?date=&party_size=` — available time slots
  - `GET /api/reservations` — list (staff: all, customer: own)
  - `PATCH /api/reservations/{id}/status` — update status (staff only)
  - `DELETE /api/reservations/{id}` — cancel (customer can cancel own, staff can cancel any)
- Event: `ReservationCreated` — trigger SMS confirmation
- Listener: `SendReservationConfirmationListener` (ShouldQueue)
- Auto-cancel job: `AutoCancelNoShowReservations` — runs every 15 minutes, marks no-shows

**Frontend (online-order-web):**
- New page: `ReservationPage.tsx`
- Date picker, time slot selector (show only available slots), party size input, contact info
- Confirmation screen with reservation details
- Add to App router

**Frontend (admin-dashboard):**
- New page: `ReservationsPage.tsx`
- Calendar/list view of all reservations
- Status management (confirm, seat, complete, mark no-show)
- Settings panel for slot duration, max party size, advance days, buffer time

**Frontend (pos-web):**
- Show today's reservations in ops panel
- Quick-seat action that creates a dine-in order linked to the reservation

### 1.2 Real-Time Order Tracking (Customer-Facing)

**Backend:**
- New SSE stream: `CustomerOrderStreamProvider` — streams status updates for a specific order
- API endpoint: `GET /api/orders/{id}/track` — SSE stream (customer auth or order token)
- Add `estimated_ready_at` column to `orders` table (nullable timestamp)
- KDS status changes should broadcast to customer stream
- Generate a tracking token per order (for guest tracking without login)

**Frontend (online-order-web):**
- Enhance `OrderStatusPage.tsx`:
  - Live status indicator with steps: Order Placed → Preparing → Ready → Completed
  - Animated progress bar
  - Estimated time remaining (countdown from `estimated_ready_at`)
  - SSE connection for real-time updates
  - Works with tracking token (no login required for guests)

**Frontend (kds-web):**
- When bumping an order to "completed", optionally set `estimated_ready_at` or clear it
- Show customer-facing status alongside kitchen status

### 1.3 Customer Reviews & Ratings

**Backend:**
- Migration: `reviews` table — `id`, `order_id` (unique), `customer_id` (nullable), `overall_rating` (1-5), `food_rating` (1-5, nullable), `service_rating` (1-5, nullable), `comment` (text, nullable), `is_published` (boolean, default true), `admin_response` (text, nullable), `created_at`, `updated_at`
- Migration: `item_ratings` table — `id`, `review_id`, `item_id`, `rating` (1-5), `created_at`
- Model: `Review`, `ItemRating`
- Repository: `ReviewRepositoryInterface` + `EloquentReviewRepository`
- Service: `ReviewService` — create, update admin response, get stats, get by item
- API endpoints:
  - `POST /api/orders/{id}/review` — submit review (customer, one per order)
  - `GET /api/reviews` — list published reviews (public)
  - `GET /api/items/{id}/reviews` — reviews for a specific item (public)
  - `GET /api/reviews/stats` — aggregate stats (public)
  - `PATCH /api/reviews/{id}` — admin response (staff only)
  - `PATCH /api/reviews/{id}/visibility` — publish/unpublish (staff only)
- After order completion, send SMS with review link (use existing SMS service)

**Frontend (online-order-web):**
- New page: `ReviewPage.tsx` — star rating form, optional comment, per-item ratings
- Show average rating on menu items
- Reviews section on item detail (if you add item detail pages)

**Frontend (admin-dashboard):**
- New page: `ReviewsPage.tsx`
- List all reviews with filters (rating, date, published/unpublished)
- Respond to reviews
- Publish/unpublish toggle
- Average rating dashboard cards

### 1.4 Favorites & Quick Reorder

**Backend:**
- Migration: `customer_favorites` table — `id`, `customer_id`, `item_id`, `created_at`
- API endpoints:
  - `POST /api/favorites/{item_id}` — add favorite (customer)
  - `DELETE /api/favorites/{item_id}` — remove favorite (customer)
  - `GET /api/favorites` — list favorites (customer)
  - `POST /api/orders/{id}/reorder` — create new order with same items as a past order (customer)

**Frontend (online-order-web):**
- Heart icon on menu items to toggle favorite
- Favorites filter/section on menu page
- "Reorder" button on order history items
- Reorder flow: load items into cart → go to checkout

### 1.5 Push Notifications (Web Push)

**Backend:**
- Migration: `push_subscriptions` table — `id`, `customer_id`, `endpoint`, `p256dh_key`, `auth_key`, `created_at`, `updated_at`
- Service: `WebPushService` — subscribe, unsubscribe, send notification
- Use `web-push` PHP library (minishlink/web-push)
- API endpoints:
  - `POST /api/push/subscribe` — save subscription (customer)
  - `DELETE /api/push/unsubscribe` — remove subscription (customer)
- Integrate into existing listeners:
  - Order status changes → push notification
  - Order ready for pickup → push notification
  - Loyalty points earned → push notification

**Frontend (online-order-web):**
- Service worker for push notifications
- Permission request prompt (non-intrusive, after first order)
- Notification preferences in account settings

---

## Phase 2 — Menu & Catalog Enhancements

### 2.1 Dietary & Allergen Tags

**Backend:**
- Migration: `dietary_tags` table — `id`, `name` (e.g., "Vegetarian", "Vegan", "Gluten-Free", "Halal", "Dairy-Free", "Nut-Free", "Spicy"), `icon` (emoji or icon name), `color` (hex), `sort_order`
- Migration: `item_dietary_tag` pivot table — `item_id`, `dietary_tag_id`
- Migration: add `spicy_level` column to `items` table (tinyint 0-3: none/mild/medium/hot)
- Migration: add `calories` column to `items` table (nullable int)
- Model: `DietaryTag` with many-to-many relationship to `Item`
- API: Include dietary tags in item responses. Add `GET /api/dietary-tags` endpoint.
- Admin API: `POST/PUT /api/admin/dietary-tags` for CRUD

**Frontend (online-order-web):**
- Show dietary tag badges on menu items (colored pills)
- Spicy level indicator (chili icons)
- Calorie display
- Filter menu by dietary tags (multi-select)

**Frontend (admin-dashboard):**
- Dietary tags management section in Menu page
- Tag assignment when editing menu items
- Spicy level and calorie inputs on item edit form

**Frontend (pos-web):**
- Show dietary tags on items in menu grid (small badges)

### 2.2 Combo Meals / Bundles

**Backend:**
- Migration: `combos` table — `id`, `name`, `name_dv` (Dhivehi), `description`, `image_url`, `price_laar`, `is_active`, `sort_order`, `created_at`, `updated_at`
- Migration: `combo_items` table — `id`, `combo_id`, `item_id`, `quantity`, `is_substitutable` (boolean), `substitute_group` (nullable string — items with same group are interchangeable)
- Model: `Combo`, `ComboItem`
- Repository: `ComboRepositoryInterface` + `EloquentComboRepository`
- Service: `ComboService` — CRUD, validate combo composition, calculate savings
- API endpoints:
  - `GET /api/combos` — list active combos (public)
  - `GET /api/combos/{id}` — combo detail with items (public)
  - `POST /api/admin/combos` — create (staff)
  - `PUT /api/admin/combos/{id}` — update (staff)
  - `DELETE /api/admin/combos/{id}` — delete (staff)
- Order integration: When a combo is added to an order, store individual items but apply combo pricing. Add `combo_id` column to `order_items` table (nullable).

**Frontend (online-order-web):**
- Combos section on menu page (featured position)
- Combo detail view showing included items and savings
- "Customize" flow for substitutable items
- Add combo to cart as a group

**Frontend (pos-web):**
- Combos tab in menu grid
- Quick-add combo to cart
- Combo items displayed as a grouped block in cart

**Frontend (admin-dashboard):**
- Combos management page (or section within Menu page)
- Create/edit combos: select items, set quantities, set price, mark substitutable items

### 2.3 Daily Specials / Featured Items

**Backend:**
- Migration: `daily_specials` table — `id`, `item_id`, `combo_id` (nullable, either item or combo), `date` (date), `special_price_laar` (nullable — if different from regular), `label` (e.g., "Chef's Pick", "Today's Special"), `sort_order`, `created_at`
- API: `GET /api/specials?date=` — today's specials (public)
- Admin API: `POST /api/admin/specials`, `DELETE /api/admin/specials/{id}`

**Frontend (online-order-web):**
- "Today's Specials" banner/section at top of menu page
- Special pricing badge with original price crossed out
- Label badge ("Chef's Pick")

**Frontend (pos-web):**
- Specials section at top of menu grid
- Visual highlight for special items

**Frontend (admin-dashboard):**
- Specials management: assign items/combos to dates, set special pricing, add labels

### 2.4 Item Photo Gallery

**Backend:**
- Migration: `item_images` table — `id`, `item_id`, `image_url`, `sort_order`, `is_primary` (boolean), `created_at`
- API: Include images array in item responses
- Admin API: `POST /api/admin/items/{id}/images` (upload), `DELETE /api/admin/items/{id}/images/{image_id}`
- Keep existing `image_url` on items as the primary image for backward compatibility

**Frontend (online-order-web):**
- Image carousel/gallery on item detail
- Thumbnail strip

**Frontend (admin-dashboard):**
- Multi-image upload on item edit form
- Drag to reorder, set primary image

---

## Phase 3 — Operations Features

### 3.1 Tip Management

**Backend:**
- Migration: `tips` table — `id`, `order_id`, `staff_user_id` (nullable), `amount_laar`, `payment_method` (cash/card/online), `shift_id`, `created_at`
- Model: `Tip`
- Service: `TipService` — add tip, get tips by shift, calculate distribution
- API endpoints:
  - `POST /api/orders/{id}/tip` — add tip to order (staff)
  - `GET /api/shifts/{id}/tips` — tips for a shift (staff)
  - `GET /api/reports/tips?from=&to=` — tip report (staff)
- Tip can be added during payment or after order completion
- Include tip total in shift close/X-Z reports

**Frontend (pos-web):**
- Tip input during payment flow (amount or percentage quick buttons: 5%, 10%, 15%)
- Tip summary in shift close screen

**Frontend (admin-dashboard):**
- Tips section in Reports page
- By staff member, by shift, by date range
- CSV export

### 3.2 Employee Scheduling

**Backend:**
- Migration: `schedules` table — `id`, `staff_user_id`, `date`, `start_time`, `end_time`, `role` (e.g., "kitchen", "cashier", "server"), `notes`, `status` (scheduled/confirmed/absent), `created_at`, `updated_at`
- Unique constraint on `staff_user_id` + `date` + `start_time`
- Model: `Schedule`
- Service: `ScheduleService` — create, update, get week view, check conflicts
- API endpoints:
  - `GET /api/schedules?week=` — weekly schedule (staff)
  - `POST /api/admin/schedules` — create schedule entry (staff)
  - `PUT /api/admin/schedules/{id}` — update (staff)
  - `DELETE /api/admin/schedules/{id}` — delete (staff)
  - `GET /api/schedules/my` — current user's schedule (staff)

**Frontend (admin-dashboard):**
- New page: `SchedulePage.tsx`
- Weekly calendar grid (days × time slots)
- Drag to create/resize shifts
- Color-coded by role
- Staff assignment dropdown
- Conflict detection (visual warning)

**Frontend (pos-web):**
- "My Schedule" view accessible from staff menu
- Today's team display

### 3.3 Waste Tracking

**Backend:**
- Migration: `waste_logs` table — `id`, `item_id`, `quantity`, `reason` (expired/damaged/overproduction/other), `notes`, `cost_laar` (auto-calculated from item cost), `staff_user_id`, `shift_id`, `created_at`
- Model: `WasteLog`
- Service: `WasteService` — log waste, calculate cost, report by period/reason
- API endpoints:
  - `POST /api/waste` — log waste (staff)
  - `GET /api/waste?from=&to=` — waste logs (staff)
  - `GET /api/reports/waste?from=&to=` — waste summary report (staff)
- Auto-deduct from inventory when waste is logged

**Frontend (pos-web):**
- "Log Waste" button in ops panel
- Quick form: select item, quantity, reason, optional notes

**Frontend (admin-dashboard):**
- Waste report in Reports page
- By item, by reason, by date range
- Cost impact visualization
- CSV export

### 3.4 Customer Wait Time Estimation

**Backend:**
- Service: `WaitTimeEstimator` — calculate based on:
  - Number of active orders in KDS (pending + in_progress)
  - Average preparation time per item (track historical: add `prepared_at` timestamp to orders)
  - Current queue depth
- Migration: add `prepared_at` column to `orders` table (nullable timestamp, set when KDS bumps to completed)
- API: `GET /api/wait-time` — estimated wait in minutes (public)
- Update `estimated_ready_at` on new orders based on queue

**Frontend (online-order-web):**
- Show estimated wait time on menu page header ("Current wait: ~15 min")
- Show on checkout confirmation
- Update in real-time via SSE

**Frontend (kds-web):**
- Display current average prep time
- Queue depth counter

---

## Phase 4 — Marketing & Growth Features

### 4.1 Google Reviews Integration

**Backend:**
- Config: `config/google.php` — `place_id`, `review_url`
- After a 4-5 star internal review, send follow-up SMS with Google review link (delay 1 hour)
- Listener: `PromptGoogleReviewListener` (ShouldQueue, 1 hour delay)

**Frontend (online-order-web):**
- After submitting a positive review (4-5 stars), show a "Share on Google" prompt with direct link

**Frontend (admin-dashboard):**
- Google review link configuration in settings

### 4.2 Social Sharing

**Backend:**
- API: `GET /api/share/item/{id}` — generate shareable item page with Open Graph meta tags
- API: `GET /api/share/order/{token}` — shareable order summary (what I ordered)

**Frontend (online-order-web):**
- Share button on menu items (WhatsApp, Facebook, copy link)
- "Share my order" button on order confirmation
- Open Graph meta tags for shared links (item image, name, price, restaurant name)

### 4.3 Referral Program

**Backend:**
- Migration: `referral_codes` table — `id`, `customer_id`, `code` (unique, 8 chars), `uses_count`, `created_at`
- Migration: `referrals` table — `id`, `referrer_customer_id`, `referred_customer_id`, `referral_code_id`, `reward_given` (boolean), `created_at`
- Config: `config/referral.php` — `reward_points` (loyalty points for referrer), `referee_promo_code` (promo code for new customer), `max_referrals_per_customer`
- Service: `ReferralService` — generate code, validate, apply rewards
- API endpoints:
  - `GET /api/referral/my-code` — get/generate referral code (customer)
  - `POST /api/referral/apply` — apply referral code during signup (customer)
  - `GET /api/referral/stats` — referral stats for current customer
- On successful referral: reward referrer with loyalty points, give referee a promo code

**Frontend (online-order-web):**
- "Refer a Friend" section in account/profile
- Display referral code with share buttons (WhatsApp, SMS, copy)
- Referral stats (how many friends referred, points earned)
- Referral code input during checkout (for new customers)

**Frontend (admin-dashboard):**
- Referral program settings (reward amounts, limits)
- Referral activity report

### 4.4 Email Marketing / Campaigns

**Backend:**
- Migration: `email_campaigns` table — `id`, `subject`, `body_html`, `body_text`, `status` (draft/scheduled/sending/sent), `scheduled_at`, `sent_at`, `total_recipients`, `sent_count`, `failed_count`, `created_at`, `updated_at`
- Migration: `email_campaign_recipients` table — `id`, `campaign_id`, `customer_id`, `email`, `status` (pending/sent/failed/opened/clicked), `sent_at`, `opened_at`
- Migration: add `email` column to `customers` table (nullable)
- Model: `EmailCampaign`, `EmailCampaignRecipient`
- Service: `EmailCampaignService` — create, schedule, send (use Laravel Mail)
- Job: `SendEmailCampaignRecipientJob` (ShouldQueue)
- API endpoints:
  - `POST /api/admin/email-campaigns` — create (staff)
  - `PUT /api/admin/email-campaigns/{id}` — update (staff)
  - `POST /api/admin/email-campaigns/{id}/send` — send now (staff)
  - `GET /api/admin/email-campaigns` — list (staff)
  - `GET /api/admin/email-campaigns/{id}/stats` — delivery stats (staff)

**Frontend (admin-dashboard):**
- Email Campaigns page (similar to existing SMS Campaigns page)
- Rich text editor for email body
- Preview before sending
- Recipient filtering (all customers, by tier, by last order date)
- Campaign stats (sent, opened, failed)

### 4.5 Gift Cards / Vouchers

**Backend:**
- Migration: `gift_cards` table — `id`, `code` (unique, 16 chars), `initial_balance_laar`, `current_balance_laar`, `purchaser_customer_id` (nullable), `recipient_name` (nullable), `recipient_phone` (nullable), `recipient_message` (nullable), `is_active`, `expires_at`, `created_at`, `updated_at`
- Migration: `gift_card_transactions` table — `id`, `gift_card_id`, `order_id` (nullable), `amount_laar`, `type` (purchase/redemption/refund), `balance_after_laar`, `created_at`
- Model: `GiftCard`, `GiftCardTransaction`
- Repository: `GiftCardRepositoryInterface` + `EloquentGiftCardRepository`
- Service: `GiftCardService` — purchase, check balance, redeem (as payment method), refund
- API endpoints:
  - `POST /api/gift-cards/purchase` — buy a gift card (customer)
  - `GET /api/gift-cards/{code}/balance` — check balance (public)
  - `POST /api/orders/{id}/payments/gift-card` — pay with gift card (customer/staff)
  - `GET /api/admin/gift-cards` — list all (staff)
  - `POST /api/admin/gift-cards` — create manually (staff)
- Integrate as payment method alongside Cash and BML

**Frontend (online-order-web):**
- "Buy Gift Card" page — select amount, recipient details, optional message
- Gift card payment option at checkout (enter code)
- Balance check page

**Frontend (pos-web):**
- Gift card payment option in payment flow
- Scan/enter gift card code
- Show remaining balance after payment

**Frontend (admin-dashboard):**
- Gift cards management page
- Create gift cards manually
- View transaction history per card
- Deactivate/extend expiry

---

## Phase 5 — Analytics & Business Intelligence

### 5.1 Peak Hours Dashboard

**Backend:**
- Service: `AnalyticsService` — aggregate order data by hour/day
- API endpoints:
  - `GET /api/reports/peak-hours?from=&to=` — orders per hour of day (staff)
  - `GET /api/reports/peak-days?from=&to=` — orders per day of week (staff)
  - `GET /api/reports/hourly-revenue?date=` — revenue by hour for a specific day (staff)

**Frontend (admin-dashboard):**
- Heatmap visualization: days of week × hours of day (color intensity = order volume)
- Bar chart: orders per hour for selected date range
- Highlight busiest/slowest periods
- Compare periods (this week vs last week)

### 5.2 Customer Retention Metrics

**Backend:**
- Service: `CustomerAnalyticsService`:
  - New vs returning customers per period
  - Repeat visit rate (% of customers who ordered more than once)
  - Average days between orders
  - Customer lifetime value (total spend per customer)
  - Churn rate (customers who haven't ordered in X days)
- API: `GET /api/reports/customers?from=&to=` (staff)

**Frontend (admin-dashboard):**
- Customer insights section in Reports page
- KPI cards: New customers, Returning %, Avg order frequency, Avg lifetime value
- Retention chart (cohort-based)
- Top customers list (by spend and frequency)

### 5.3 Menu Item Profitability

**Backend:**
- Service: `ProfitabilityService`:
  - Revenue per item (sum of order_items)
  - Cost per item (from item `cost_price_laar` field)
  - Profit margin per item
  - Rank items by profit margin and total profit
- API: `GET /api/reports/profitability?from=&to=` (staff)
- Use existing `cost_price_laar` on items model

**Frontend (admin-dashboard):**
- Profitability table: item name, units sold, revenue, cost, profit, margin %
- Sort by any column
- Highlight low-margin items (< 30%)
- CSV export

### 5.4 Demand Forecasting

**Backend:**
- Service: `ForecastService`:
  - Simple moving average of daily orders (7-day, 30-day)
  - Per-item demand forecast based on historical sales by day-of-week
  - Suggested prep quantities for tomorrow
- API: `GET /api/reports/forecast` (staff)
- Uses last 30-90 days of order data

**Frontend (admin-dashboard):**
- Forecast section in Reports page
- Tomorrow's predicted orders (total and by item)
- Suggested prep quantities
- Trend line chart (actual vs predicted)

---

## Phase 6 — Technical & UX Polish

### 6.1 Multi-Language UI (English + Dhivehi)

**Backend:**
- Already has `name_dv` fields on items — no backend changes needed for menu
- Add `config/locale.php` with supported locales

**Frontend (all apps):**
- Create `packages/shared/src/i18n/` with:
  - `en.json` — English translations
  - `dv.json` — Dhivehi translations
  - `useTranslation.ts` hook
  - `LanguageProvider` context
- Language switcher component (top bar, all apps)
- RTL support for Dhivehi (CSS `direction: rtl`)
- Store preference in localStorage
- All static text strings extracted to translation files
- Item names: show `name_dv` when locale is `dv`, `name` when `en`

### 6.2 Dark Mode

**Frontend (all apps):**
- Create `ThemeProvider` context in `packages/shared/`
- `useTheme.ts` hook — toggle, persist to localStorage, respect system preference
- Dark mode Tailwind classes (`dark:` variants)
- Theme toggle button in header/settings of each app
- Priority: KDS app first (kitchen glare reduction), then others

### 6.3 Accessibility (a11y)

**Frontend (all apps):**
- Add `aria-label`, `aria-describedby`, `role` attributes to interactive elements
- Keyboard navigation: all buttons, links, forms navigable via Tab/Enter/Escape
- Focus management: trap focus in modals, return focus on close
- Screen reader announcements for status changes (order updates, cart changes)
- Color contrast: ensure all text meets WCAG AA (4.5:1 ratio minimum)
- Skip-to-content link on all pages
- Form labels properly associated with inputs
- Error messages announced to screen readers

### 6.4 SEO Optimization (Main Website + Online Ordering)

**Backend:**
- Add structured data (JSON-LD) for:
  - Restaurant schema (name, address, hours, cuisine, price range)
  - Menu schema (items with prices)
  - LocalBusiness schema
- Meta tags controller: generate dynamic meta tags per page
- Sitemap generation: `GET /sitemap.xml`

**Frontend (online-order-web):**
- Dynamic `<title>` and `<meta description>` per page
- Open Graph tags for social sharing
- Canonical URLs
- Semantic HTML (`<nav>`, `<main>`, `<article>`, `<section>`)

### 6.5 PWA Install Prompt

**Frontend (online-order-web):**
- Service worker with caching strategy (network-first for API, cache-first for assets)
- Web app manifest with icons, theme color, display mode
- Custom install prompt (show after first order, not immediately)
- Offline fallback page
- Add to home screen banner (non-intrusive)

---

## Execution Rules

1. **Follow existing patterns.** New domains follow the same structure as existing ones (Repository → Service → Controller → Routes). New frontend features follow the Pages → Hooks → Components → Services pattern.
2. **Add types to shared package.** All new TypeScript types go in `packages/shared/src/types/`. All apps import from `@shared/*`.
3. **Use DTOs for events.** New events carry DTOs, not Eloquent models.
4. **Error isolation.** New listeners implement try-catch. Non-critical listeners implement `ShouldQueue`.
5. **Currency in Laari.** All money values stored as integers (Laari). Use the `Money` value object.
6. **One phase at a time.** Complete and test each phase before moving to the next.
7. **Do NOT break existing features.** Run tests after each phase.
8. **Do NOT change existing API response shapes** unless adding new fields (backward compatible).
9. **Migrations only — no manual DB changes.** Each new table or column gets its own migration.
10. **PHP 8.5 features.** Use readonly classes, enums, named arguments where appropriate.
11. **TypeScript strict mode.** All frontend code must pass strict type checking.
12. **Mobile-first.** All new UI must be responsive and work on mobile devices.

## Phase Execution Order

```
Phase 1 → Customer Experience (Reservations, Order Tracking, Reviews, Favorites, Push)
Phase 2 → Menu Enhancements (Dietary Tags, Combos, Specials, Photo Gallery)
Phase 3 → Operations (Tips, Scheduling, Waste, Wait Time)
Phase 4 → Marketing (Google Reviews, Social, Referrals, Email, Gift Cards)
Phase 5 → Analytics (Peak Hours, Retention, Profitability, Forecasting)
Phase 6 → Polish (i18n, Dark Mode, a11y, SEO, PWA)
```

Start with Phase 1. After each phase, verify all existing features still work and the new features function correctly.
