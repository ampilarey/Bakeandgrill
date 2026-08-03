# Banner v2 — sequencing, Dhivehi, logo separator, scheduling, emergency

Item 1 (ticker fully clearing the screen) is **already shipped** — verify only.
Items 2–4 land together; 5 and 6 are separate and larger.

## 0. Verify, then fix the migration default

`scroll_mode: 'ticker'` already renders one copy animating `translateX(100%)` →
`translateX(-100%)`. Confirm this, then leave it alone.

Add a one-time migration that moves existing `scroll: true` / `seamless` banners
to `ticker`. Deliberate, tested — not a silent default flip.

## 2. Sequencing by repeat count, not a timer

Drop `duration_seconds` as the mechanism. Add `repeat_count` (integer, default 1).
Drive advancement from `animationiteration` / `animationend`, never a parallel
`setTimeout`. Keep `duration_seconds` deprecated and ignored.

## 3. Direction — English and Dhivehi together

Add `direction` per banner: `ltr` (default) or `rtl`.
- `rtl` — reverse ticker; set `dir="rtl"` and `lang="dv"` on the text element.
- Thaana font stack on the banner.
- Next banner must not start until the current has fully exited.

## 4. Logo between banners

`show_logo_between` at rotation level (default off). Uses `logo_dark ?? logo`.
Skip when only one banner is enabled.

## 5. Scheduling for banners and emergencies

Reuse campaign scheduler via shared service. Optional `schedule` per banner.
Replace single emergency string with scheduled list; manual override wins.

## 6. Emergency types and layouts

Editable copy + Dhivehi variants. More modes. Layouts: notice, alert, split,
countdown. Fire alarm defaults to `alert`.
