# Branch cleanup audit

Read-only inventory of remote branches **not merged into `main`**, as of 2026-08-10.
**Nothing in this document was deleted.** Recommendations only.

Method: `git branch -r --no-merged origin/main`, then for each branch: commit count ahead of `main`, last commit date/subject, whether touched paths already exist on `main` with equivalent features (by path presence + `git log` subject match + spot checks), and whether unique `.md` files would be lost.

Working branch `claude/service-availability-maintenance-zj4whc` is listed for completeness (active PR — keep).

---

## What actually matters

| Priority | Branch | Why |
|---|---|---|
| **Rescue docs** | Several `*-plan` branches | Plan markdown that **does not exist under `docs/` on `main`**. Same class of loss as `claude/home-page-builder-plan` (already rescued once elsewhere; file still absent from `main`). |
| **Active work** | `claude/service-availability-maintenance-zj4whc` | Open PR for page builder Stages E–F. |
| **Likely nothing left** | March 2026 audit/prompt branches + old code spikes | Hundreds of commits behind; features re-landed via later PRs. |

---

## Summary table

| Branch | Commits ahead of main | Last commit | Already on main by another route? | Recommendation |
|---|---:|---|---|---|
| `claude/service-availability-maintenance-zj4whc` | 4 (+ merge commit with main) | 2026-08-10 — build: sync admin and order bundles for page builder Stages E–F | N/A — this is the open E/F PR | **KEEP** — active PR |
| `claude/home-page-builder-plan` | 1 | 2026-08-09 — docs: home page builder plan | **No** — `docs/HOME_PAGE_BUILDER_PLAN.md` is **not** on `main` | **KEEP** — rescue `docs/HOME_PAGE_BUILDER_PLAN.md` into `docs/` (same situation you already hit once) |
| `claude/platter-builder-plan` | 4 | 2026-08-05 — docs: reward picker is part of Stage F… | **No** — `docs/PLATTER_BUILDER_AND_PROMOTIONS_PLAN.md` missing on `main` (platter UI code exists; the **plan doc** does not) | **KEEP** — rescue that plan file |
| `claude/media-upgrade-plan` | 2 | 2026-08-05 — docs: revise media plan after code audit | **Yes** — `docs/MEDIA_SYSTEM_UPGRADE_PLAN.md` is on `main` (this branch’s tip may still have newer wording) | **NEEDS A HUMAN LOOK** — compare tip vs `main` doc; keep only if tip has unmerged edits |
| `claude/redis-resilience-plan` | 1 | 2026-08-01 — docs: add Redis resilience plan | **No** — `docs/REDIS_RESILIENCE_PLAN.md` missing | **KEEP** — rescue plan doc |
| `claude/hub-desktop-width-plan` | 1 | 2026-07-31 — docs: add hub desktop width fix plan | **No** — `docs/HUB_DESKTOP_WIDTH_PLAN.md` missing | **KEEP** — rescue plan doc |
| `claude/content-hub-layout-plan` | 1 | 2026-07-28 — docs: add content hub layout redesign plan | **No** — `docs/CONTENT_HUB_LAYOUT_PLAN.md` missing | **KEEP** — rescue plan doc |
| `claude/content-app-scope-audit-plan` | 1 | 2026-07-27 — docs: add content app-scope audit plan | **No** — `docs/CONTENT_APP_SCOPE_AUDIT_PLAN.md` missing | **KEEP** — rescue plan doc |
| `claude/branding-panel-redesign-plan` | 1 | 2026-07-27 — docs: add branding panel redesign plan | **No** — `docs/BRANDING_PANEL_REDESIGN_PLAN.md` missing | **KEEP** — rescue plan doc |
| `claude/content-branding-unification-plan` | 4 | 2026-07-26 — docs: fix four gaps found on plan re-read | **No** — `docs/CONTENT_BRANDING_UNIFICATION_PLAN.md` missing | **KEEP** — rescue plan doc |
| `claude/tv-signage-plan` | 4 | 2026-07-25 — docs: signage Rev 2.1… | **No** — `docs/TV_SIGNAGE_MENU_BOARD_PLAN.md` missing (signage **product** is on `main`; this revision of the plan is not) | **KEEP** — rescue plan doc |
| `claude/specials-display-consistency-plan` | 1 | 2026-07-25 — docs: specials/promotions display consistency plan | **No** — `docs/SPECIALS_DISPLAY_CONSISTENCY_PLAN.md` missing | **KEEP** — rescue plan doc |
| `claude/default-item-image-plan` | 1 | 2026-07-25 — docs: default item image plan | **No** — `docs/DEFAULT_ITEM_IMAGE_PLAN.md` missing (feature likely shipped; plan file not) | **KEEP** — rescue plan doc |
| `claude/dinein-menu-view-plan` | 1 | 2026-07-25 — docs: dine-in view-only digital menu plan | **No** — `docs/DINEIN_MENU_VIEW_PLAN.md` missing | **KEEP** — rescue plan doc |
| `claude/discount-strategy-plan` | 2 | 2026-07-25 — docs: audit fixes — MVR/laari input… | **No** — `docs/DISCOUNT_STRATEGY_PLAN.md` missing | **KEEP** — rescue plan doc |
| `claude/mobile-menu-footer-plan` | 8 | 2026-07-25 — docs: subcategories render as smaller sub-headers… | **No** — `docs/MOBILE_MENU_FOOTER_PLAN.md` and `docs/MENU_CARD_DISPLAY_FIELDS_PLAN.md` missing | **KEEP** — rescue both plan files |
| `claude/iphone-media-upload-plan` | 1 | 2026-07-24 — docs: iPhone media upload fix plan | **No** — `docs/IPHONE_MEDIA_UPLOAD_FIX_PLAN.md` missing (HEIC work may be live; plan file not) | **KEEP** — rescue plan doc |
| `claude/pos-discount-controls-plan` | 2 | 2026-07-24 — docs: discount controls — SMS one-time-code… | **Yes** — `docs/POS_DISCOUNT_CONTROLS_PLAN.md` on `main` | **SAFE TO DELETE** after confirming tip == `main` file |
| `claude/media-library-plan` | 2 | 2026-07-24 — docs: media library — Collections + editing | **Yes** — `docs/MEDIA_LIBRARY_PLAN.md` on `main`; library shipped | **SAFE TO DELETE** |
| `claude/sms-control-center-plan` | 1 | 2026-07-23 — docs: SMS Control Center plan | **Yes** — `docs/SMS_CONTROL_CENTER_PLAN.md` on `main`; feature shipped | **SAFE TO DELETE** |
| `claude/content-studio-modern-plan` | 2 | 2026-07-23 — content: editable order-app status banner wording (Phase 6) | **Yes** — plan path on `main`; Phase 6 banner commit `643fa445a` on `main` | **SAFE TO DELETE** |
| `claude/multi-app-audit-calculations-1ijj9c` | 13 | 2026-07-20 — docs(catering-plan): rev 12… | **Partial** — `docs/CATERING-EVENTS-PLAN.md` on `main`; **`docs/AUDIT-CALCULATIONS-FLOWS.md` is unique** | **KEEP** — rescue `docs/AUDIT-CALCULATIONS-FLOWS.md` (then delete) |
| `claude/media-library-editing` | 5 | 2026-08-? / 2026-07-24 tip — Media Library export/download | **Yes** — central media library + editing landed on `main` (`91920c680` et al.); export tip may be redundant | **SAFE TO DELETE** unless you still want a separate export/download feature check |
| `claude/menu-mobile-one-col` | 3 | 2026-07-25 — shorter mobile menu skeleton height | **Superseded** — `main` explicitly keeps **2 columns** on phone (`/* always 2 cols on phone (§15) */`) | **SAFE TO DELETE** — later product choice overrode one-col |
| `fix/sms-cost-and-permissions` | 1 | 2026-08-02 — fix(sms): drop em dashes from defaults… | **Yes** — same subject on `main` as `d4c30a4f3` | **SAFE TO DELETE** |
| `cursor/setup-dev-environment-4700` | 1 | 2026-08-07 — docs: add AGENTS.md… | **Partial** — no `AGENTS.md` on `main`; `CLAUDE.md` / `.cursor/` exist | **KEEP** — rescue `AGENTS.md` if still useful, else safe |
| `claude/audit-modularity-permissions-Ho3h1` | 3 | 2026-03-15 — architecture prompt + SMS modularisation | **Yes** — domain SMS + permissions model on `main`; ~1928 behind | **SAFE TO DELETE** |
| `claude/review-production-implementation-bglsc` | 5 | 2026-03-14 — DB::raw casts / queue after_commit | **Likely yes** — hardening re-done; unique `docs/IMPLEMENTATION_REVIEW.md` | **NEEDS A HUMAN LOOK** — salvage review doc if wanted, then delete |
| `claude/model-based-refactor-oSm83` | 6 | 2026-03-14 — production hardening cursor prompt | **Obsolete prompts** at repo root; ~1997 behind | **NEEDS A HUMAN LOOK** — only if you want archive of old prompts |
| `claude/audit-admin-panel-E8Rp5` | 2 | 2026-03-19 — full audit report + admin fix prompt | Unique `docs/FULL_AUDIT_REPORT.md`, `docs/prompts/CURSOR_ADMIN_AUDIT_FIX_PROMPT.md` | **KEEP** briefly — rescue those two files into `docs/archive/` then delete |
| `claude/code-review-report-KIJoL` | 2 | 2026-03-22 — code review report | Unique root `CODE_REVIEW_REPORT.md` | **KEEP** briefly — rescue then delete |
| `claude/code-review-zcCNg` | 1 | 2026-03-24 — cursor prompt with 55 prioritized fixes | Prompt-only; ~1763 behind | **SAFE TO DELETE** (or archive prompt if curious) |
| `claude/audit-user-roles-ZRCvS` | 1 | 2026-03-15 — role consolidation prompt | Prompt-only; roles/permissions shipped later | **SAFE TO DELETE** |
| `claude/website-review-audit-gwuJu` | 1 | 2026-03-18 — website review prompt | Unique `docs/prompts/WEBSITE_REVIEW_AUDIT_PROMPT.md` | **KEEP** briefly — rescue prompt then delete |
| `claude/review-login-authentication-tXTTs` | 1 | 2026-03-20 — unified login + OTP prompt | Unique `CURSOR_PROMPT_AUTH_UPGRADE.md`; auth largely rebuilt | **SAFE TO DELETE** after optional archive |
| `claude/determined-boyd` | 1 | 2026-03-21 — authentication audit prompt | Unique `AUTH_AUDIT_CURSOR_PROMPT.md` | **SAFE TO DELETE** after optional archive |
| `claude/audit-ordering-logic-vDPnc` | 1 | 2026-03-21 — ordering logic fixes prompt | Prompt-only; ordering rewritten many times | **SAFE TO DELETE** |
| `claude/review-order-invoice-flow-0h8aj` | 1 | 2026-03-21 — order/invoice/receipt overhaul prompt | Unique `docs/prompts/CURSOR_ORDER_INVOICE_RECEIPT_PROMPT.md` | **KEEP** briefly — rescue then delete |

---

## Plan documents missing from `docs/` on main

These branches hold writing that would be lost if deleted without a cherry-pick:

| File | Branch |
|---|---|
| `docs/HOME_PAGE_BUILDER_PLAN.md` | `claude/home-page-builder-plan` |
| `docs/PLATTER_BUILDER_AND_PROMOTIONS_PLAN.md` | `claude/platter-builder-plan` |
| `docs/REDIS_RESILIENCE_PLAN.md` | `claude/redis-resilience-plan` |
| `docs/HUB_DESKTOP_WIDTH_PLAN.md` | `claude/hub-desktop-width-plan` |
| `docs/CONTENT_HUB_LAYOUT_PLAN.md` | `claude/content-hub-layout-plan` |
| `docs/CONTENT_APP_SCOPE_AUDIT_PLAN.md` | `claude/content-app-scope-audit-plan` |
| `docs/BRANDING_PANEL_REDESIGN_PLAN.md` | `claude/branding-panel-redesign-plan` |
| `docs/CONTENT_BRANDING_UNIFICATION_PLAN.md` | `claude/content-branding-unification-plan` |
| `docs/TV_SIGNAGE_MENU_BOARD_PLAN.md` | `claude/tv-signage-plan` |
| `docs/SPECIALS_DISPLAY_CONSISTENCY_PLAN.md` | `claude/specials-display-consistency-plan` |
| `docs/DEFAULT_ITEM_IMAGE_PLAN.md` | `claude/default-item-image-plan` |
| `docs/DINEIN_MENU_VIEW_PLAN.md` | `claude/dinein-menu-view-plan` |
| `docs/DISCOUNT_STRATEGY_PLAN.md` | `claude/discount-strategy-plan` |
| `docs/MOBILE_MENU_FOOTER_PLAN.md` | `claude/mobile-menu-footer-plan` |
| `docs/MENU_CARD_DISPLAY_FIELDS_PLAN.md` | `claude/mobile-menu-footer-plan` |
| `docs/IPHONE_MEDIA_UPLOAD_FIX_PLAN.md` | `claude/iphone-media-upload-plan` |
| `docs/AUDIT-CALCULATIONS-FLOWS.md` | `claude/multi-app-audit-calculations-1ijj9c` |
| `AGENTS.md` (repo root) | `cursor/setup-dev-environment-4700` |

Suggested rescue pattern (same as home-page-builder-plan): `git show origin/<branch>:docs/<FILE>.md > docs/<FILE>.md` on a small PR — **do not merge the whole stale branch**.

---

## Notes

1. **Divergent ≠ valuable.** Branches hundreds of commits behind almost always had their *ideas* re-implemented on `main` through later PRs; only unique markdown (and rare unique source paths) are worth keeping.
2. **No undelivered product code spikes** stood out beyond docs. The closest code candidates (`media-library-editing`, `menu-mobile-one-col`, `content-studio-modern-plan`, `fix/sms-cost-and-permissions`) all appear superseded on `main`.
3. **Delete nothing from this audit alone.** Rescue the missing plan files first, then prune.

---

*Generated for the owner. Delete operations intentionally omitted.*
