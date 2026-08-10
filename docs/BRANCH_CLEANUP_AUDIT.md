# Branch cleanup audit

Read-only inventory of remote branches **not merged into `main`**, as of 2026-08-10,
updated 2026-08-10 after **document rescue** onto `claude/service-availability-maintenance-zj4whc`.

**Nothing in this document was deleted.** Recommendations only. After rescue, most former
KEEP rows are now **SAFE TO DELETE**.

Method: `git branch -r --no-merged origin/main`, then for each branch: commit count ahead of
`main`, last commit date/subject, whether touched paths already exist on `main` with
equivalent features, and whether unique `.md` files would be lost. Unique docs from
KEEP / KEEP-briefly rows were copied into `docs/` (or `docs/archive/`, or repo-root
`AGENTS.md`) on this branch with status + provenance headers — **not** by merging the
stale branches.

Working branch `claude/service-availability-maintenance-zj4whc` remains **KEEP** (active PR).

---

## What actually matters

| Priority | Branch | Why |
|---|---|---|
| **Active work** | `claude/service-availability-maintenance-zj4whc` | Open PR (page builder Stages E–F + this doc rescue). |
| **Cleanup ready** | Former KEEP-to-rescue plan branches | Unique markdown now lives under `docs/` on this branch — branches themselves may be deleted after this PR merges (or after you confirm the rescued files are on `main`). |
| **Likely nothing left** | March 2026 audit/prompt branches + old code spikes | Hundreds of commits behind; features re-landed via later PRs; unique prompts archived under `docs/archive/` where worth keeping. |

---

## Summary table

| Branch | Commits ahead of main | Last commit | Already on main by another route? | Recommendation |
|---|---:|---|---|---|
| `claude/service-availability-maintenance-zj4whc` | (active) | 2026-08-10 — doc rescue + prior E/F work | N/A — this is the open PR | **KEEP** — active PR |
| `claude/home-page-builder-plan` | 1 | 2026-08-09 — docs: home page builder plan | Doc rescued → `docs/HOME_PAGE_BUILDER_PLAN.md` | **SAFE TO DELETE** — rescued to `docs/HOME_PAGE_BUILDER_PLAN.md` |
| `claude/platter-builder-plan` | 4 | 2026-08-05 — docs: reward picker is part of Stage F… | Doc rescued → `docs/PLATTER_BUILDER_AND_PROMOTIONS_PLAN.md` | **SAFE TO DELETE** — rescued to `docs/PLATTER_BUILDER_AND_PROMOTIONS_PLAN.md` |
| `claude/media-upgrade-plan` | 2 | 2026-08-05 — docs: revise media plan after code audit | **Yes** — tip blob **identical** to `origin/main:docs/MEDIA_SYSTEM_UPGRADE_PLAN.md` (`e41bfb818…`). This PR branch already has the **owner-corrected** Stages 1–3 built / Stage 4 not built wording (`6cef8cfc3…`). Tip has **nothing worth keeping** over the corrected file. | **SAFE TO DELETE** — tip == main doc blob; do not overwrite owner-corrected copy |
| `claude/redis-resilience-plan` | 1 | 2026-08-01 — docs: add Redis resilience plan | Doc rescued → `docs/REDIS_RESILIENCE_PLAN.md` | **SAFE TO DELETE** — rescued to `docs/REDIS_RESILIENCE_PLAN.md` |
| `claude/hub-desktop-width-plan` | 1 | 2026-07-31 — docs: add hub desktop width fix plan | Doc rescued → `docs/HUB_DESKTOP_WIDTH_PLAN.md` | **SAFE TO DELETE** — rescued to `docs/HUB_DESKTOP_WIDTH_PLAN.md` |
| `claude/content-hub-layout-plan` | 1 | 2026-07-28 — docs: add content hub layout redesign plan | Doc rescued → `docs/CONTENT_HUB_LAYOUT_PLAN.md` | **SAFE TO DELETE** — rescued to `docs/CONTENT_HUB_LAYOUT_PLAN.md` |
| `claude/content-app-scope-audit-plan` | 1 | 2026-07-27 — docs: add content app-scope audit plan | Doc rescued → `docs/CONTENT_APP_SCOPE_AUDIT_PLAN.md` | **SAFE TO DELETE** — rescued to `docs/CONTENT_APP_SCOPE_AUDIT_PLAN.md` |
| `claude/branding-panel-redesign-plan` | 1 | 2026-07-27 — docs: add branding panel redesign plan | Doc rescued → `docs/BRANDING_PANEL_REDESIGN_PLAN.md` | **SAFE TO DELETE** — rescued to `docs/BRANDING_PANEL_REDESIGN_PLAN.md` |
| `claude/content-branding-unification-plan` | 4 | 2026-07-26 — docs: fix four gaps found on plan re-read | Doc rescued → `docs/CONTENT_BRANDING_UNIFICATION_PLAN.md` | **SAFE TO DELETE** — rescued to `docs/CONTENT_BRANDING_UNIFICATION_PLAN.md` |
| `claude/tv-signage-plan` | 4 | 2026-07-25 — docs: signage Rev 2.1… | Doc rescued → `docs/TV_SIGNAGE_MENU_BOARD_PLAN.md` | **SAFE TO DELETE** — rescued to `docs/TV_SIGNAGE_MENU_BOARD_PLAN.md` |
| `claude/specials-display-consistency-plan` | 1 | 2026-07-25 — docs: specials/promotions display consistency plan | Doc rescued → `docs/SPECIALS_DISPLAY_CONSISTENCY_PLAN.md` | **SAFE TO DELETE** — rescued to `docs/SPECIALS_DISPLAY_CONSISTENCY_PLAN.md` |
| `claude/default-item-image-plan` | 1 | 2026-07-25 — docs: default item image plan | Doc rescued → `docs/DEFAULT_ITEM_IMAGE_PLAN.md` | **SAFE TO DELETE** — rescued to `docs/DEFAULT_ITEM_IMAGE_PLAN.md` |
| `claude/dinein-menu-view-plan` | 1 | 2026-07-25 — docs: dine-in view-only digital menu plan | Doc rescued → `docs/DINEIN_MENU_VIEW_PLAN.md` | **SAFE TO DELETE** — rescued to `docs/DINEIN_MENU_VIEW_PLAN.md` |
| `claude/discount-strategy-plan` | 2 | 2026-07-25 — docs: audit fixes — MVR/laari input… | Doc rescued → `docs/DISCOUNT_STRATEGY_PLAN.md` | **SAFE TO DELETE** — rescued to `docs/DISCOUNT_STRATEGY_PLAN.md` |
| `claude/mobile-menu-footer-plan` | 8 | 2026-07-25 — docs: subcategories render as smaller sub-headers… | Both docs rescued | **SAFE TO DELETE** — rescued to `docs/MOBILE_MENU_FOOTER_PLAN.md` + `docs/MENU_CARD_DISPLAY_FIELDS_PLAN.md` |
| `claude/iphone-media-upload-plan` | 1 | 2026-07-24 — docs: iPhone media upload fix plan | Doc rescued → `docs/IPHONE_MEDIA_UPLOAD_FIX_PLAN.md` | **SAFE TO DELETE** — rescued to `docs/IPHONE_MEDIA_UPLOAD_FIX_PLAN.md` |
| `claude/pos-discount-controls-plan` | 2 | 2026-07-24 — docs: discount controls — SMS one-time-code… | **Yes** — `docs/POS_DISCOUNT_CONTROLS_PLAN.md` on `main` | **SAFE TO DELETE** after confirming tip == `main` file |
| `claude/media-library-plan` | 2 | 2026-07-24 — docs: media library — Collections + editing | **Yes** — `docs/MEDIA_LIBRARY_PLAN.md` on `main`; library shipped | **SAFE TO DELETE** |
| `claude/sms-control-center-plan` | 1 | 2026-07-23 — docs: SMS Control Center plan | **Yes** — `docs/SMS_CONTROL_CENTER_PLAN.md` on `main`; feature shipped | **SAFE TO DELETE** |
| `claude/content-studio-modern-plan` | 2 | 2026-07-23 — content: editable order-app status banner wording (Phase 6) | **Yes** — plan path on `main`; Phase 6 banner commit `643fa445a` on `main` | **SAFE TO DELETE** |
| `claude/multi-app-audit-calculations-1ijj9c` | 13 | 2026-07-20 — docs(catering-plan): rev 12… | Unique audit rescued; catering plan already on `main` | **SAFE TO DELETE** — rescued `docs/AUDIT-CALCULATIONS-FLOWS.md` |
| `claude/media-library-editing` | 5 | 2026-07-24 tip — Media Library export/download | **Yes** — central media library + editing landed on `main` | **SAFE TO DELETE** unless you still want a separate export/download feature check |
| `claude/menu-mobile-one-col` | 3 | 2026-07-25 — shorter mobile menu skeleton height | **Superseded** — `main` keeps **2 columns** on phone | **SAFE TO DELETE** |
| `fix/sms-cost-and-permissions` | 1 | 2026-08-02 — fix(sms): drop em dashes from defaults… | **Yes** — same subject on `main` as `d4c30a4f3` | **SAFE TO DELETE** |
| `cursor/setup-dev-environment-4700` | 1 | 2026-08-07 — docs: add AGENTS.md… | `AGENTS.md` rescued to repo root | **SAFE TO DELETE** — rescued to `AGENTS.md` |
| `claude/audit-modularity-permissions-Ho3h1` | 3 | 2026-03-15 — architecture prompt + SMS modularisation | **Yes** — domain SMS + permissions model on `main` | **SAFE TO DELETE** |
| `claude/review-production-implementation-bglsc` | 5 | 2026-03-14 — DB::raw casts / queue after_commit | Review doc archived | **SAFE TO DELETE** — rescued to `docs/archive/IMPLEMENTATION_REVIEW.md` |
| `claude/model-based-refactor-oSm83` | 6 | 2026-03-14 — production hardening cursor prompt | Obsolete prompts at repo root; ~1997 behind | **SAFE TO DELETE** — optional archive skipped (prompt-only / superseded); no unique doc rescued |
| `claude/audit-admin-panel-E8Rp5` | 2 | 2026-03-19 — full audit report + admin fix prompt | Both files archived | **SAFE TO DELETE** — rescued to `docs/archive/FULL_AUDIT_REPORT.md` + `docs/archive/CURSOR_ADMIN_AUDIT_FIX_PROMPT.md` |
| `claude/code-review-report-KIJoL` | 2 | 2026-03-22 — code review report | Report archived | **SAFE TO DELETE** — rescued to `docs/archive/CODE_REVIEW_REPORT.md` |
| `claude/code-review-zcCNg` | 1 | 2026-03-24 — cursor prompt with 55 prioritized fixes | Prompt-only; ~1763 behind | **SAFE TO DELETE** |
| `claude/audit-user-roles-ZRCvS` | 1 | 2026-03-15 — role consolidation prompt | Prompt-only; roles/permissions shipped later | **SAFE TO DELETE** |
| `claude/website-review-audit-gwuJu` | 1 | 2026-03-18 — website review prompt | Prompt archived | **SAFE TO DELETE** — rescued to `docs/archive/WEBSITE_REVIEW_AUDIT_PROMPT.md` |
| `claude/review-login-authentication-tXTTs` | 1 | 2026-03-20 — unified login + OTP prompt | Unique `CURSOR_PROMPT_AUTH_UPGRADE.md`; auth largely rebuilt | **SAFE TO DELETE** after optional archive (not rescued this pass) |
| `claude/determined-boyd` | 1 | 2026-03-21 — authentication audit prompt | Unique `AUTH_AUDIT_CURSOR_PROMPT.md` | **SAFE TO DELETE** after optional archive (not rescued this pass) |
| `claude/audit-ordering-logic-vDPnc` | 1 | 2026-03-21 — ordering logic fixes prompt | Prompt-only; ordering rewritten many times | **SAFE TO DELETE** |
| `claude/review-order-invoice-flow-0h8aj` | 1 | 2026-03-21 — order/invoice/receipt overhaul prompt | Prompt archived | **SAFE TO DELETE** — rescued to `docs/archive/CURSOR_ORDER_INVOICE_RECEIPT_PROMPT.md` |

---

## Rescued documents (this pass)

| Landed at | Source branch | Status note (header on file) |
|---|---|---|
| `docs/HOME_PAGE_BUILDER_PLAN.md` | `claude/home-page-builder-plan` | Stages A–F built |
| `docs/PLATTER_BUILDER_AND_PROMOTIONS_PLAN.md` | `claude/platter-builder-plan` | Built |
| `docs/REDIS_RESILIENCE_PLAN.md` | `claude/redis-resilience-plan` | Partly built / failover unverified |
| `docs/HUB_DESKTOP_WIDTH_PLAN.md` | `claude/hub-desktop-width-plan` | Built |
| `docs/CONTENT_HUB_LAYOUT_PLAN.md` | `claude/content-hub-layout-plan` | Built |
| `docs/CONTENT_APP_SCOPE_AUDIT_PLAN.md` | `claude/content-app-scope-audit-plan` | Built |
| `docs/BRANDING_PANEL_REDESIGN_PLAN.md` | `claude/branding-panel-redesign-plan` | Built |
| `docs/CONTENT_BRANDING_UNIFICATION_PLAN.md` | `claude/content-branding-unification-plan` | Built |
| `docs/TV_SIGNAGE_MENU_BOARD_PLAN.md` | `claude/tv-signage-plan` | Built; Rev 2.1 polish unverified |
| `docs/SPECIALS_DISPLAY_CONSISTENCY_PLAN.md` | `claude/specials-display-consistency-plan` | Unverified — needs a look |
| `docs/DEFAULT_ITEM_IMAGE_PLAN.md` | `claude/default-item-image-plan` | Built |
| `docs/DINEIN_MENU_VIEW_PLAN.md` | `claude/dinein-menu-view-plan` | Built |
| `docs/DISCOUNT_STRATEGY_PLAN.md` | `claude/discount-strategy-plan` | Built |
| `docs/MOBILE_MENU_FOOTER_PLAN.md` | `claude/mobile-menu-footer-plan` | Partly built / rest unverified |
| `docs/MENU_CARD_DISPLAY_FIELDS_PLAN.md` | `claude/mobile-menu-footer-plan` | Built |
| `docs/IPHONE_MEDIA_UPLOAD_FIX_PLAN.md` | `claude/iphone-media-upload-plan` | Built |
| `docs/AUDIT-CALCULATIONS-FLOWS.md` | `claude/multi-app-audit-calculations-1ijj9c` | Historical audit |
| `AGENTS.md` | `cursor/setup-dev-environment-4700` | Operational guide |
| `docs/archive/IMPLEMENTATION_REVIEW.md` | `claude/review-production-implementation-bglsc` | Historical archive |
| `docs/archive/FULL_AUDIT_REPORT.md` | `claude/audit-admin-panel-E8Rp5` | Historical archive |
| `docs/archive/CURSOR_ADMIN_AUDIT_FIX_PROMPT.md` | `claude/audit-admin-panel-E8Rp5` | Historical archive |
| `docs/archive/CODE_REVIEW_REPORT.md` | `claude/code-review-report-KIJoL` | Historical archive |
| `docs/archive/WEBSITE_REVIEW_AUDIT_PROMPT.md` | `claude/website-review-audit-gwuJu` | Historical archive |
| `docs/archive/CURSOR_ORDER_INVOICE_RECEIPT_PROMPT.md` | `claude/review-order-invoice-flow-0h8aj` | Historical archive |

**Collisions:** none — no existing `docs/` path was overwritten.

**Media plan human look:** `origin/claude/media-upgrade-plan:docs/MEDIA_SYSTEM_UPGRADE_PLAN.md` has the **same git blob** as `origin/main`. Tip wording is not newer than main. The owner-corrected status table on this branch must stay; tip was not copied.

---

## Notes

1. **Divergent ≠ valuable.** Branches hundreds of commits behind almost always had their *ideas* re-implemented on `main` through later PRs; only unique markdown was worth keeping.
2. **No undelivered product code spikes** stood out beyond docs. The closest code candidates (`media-library-editing`, `menu-mobile-one-col`, `content-studio-modern-plan`, `fix/sms-cost-and-permissions`) all appear superseded on `main`.
3. **Still do not delete from the audit alone until this rescue PR is on `main`** (or you are sure the rescued files will not be lost). After merge, pruning the SAFE TO DELETE remotes is one safe operation.
4. Optional leftover archives not rescued this pass: `CURSOR_PROMPT_AUTH_UPGRADE.md` (`claude/review-login-authentication-tXTTs`), `AUTH_AUDIT_CURSOR_PROMPT.md` (`claude/determined-boyd`) — auth was rebuilt; skip unless you want prompt history.

---

*Generated for the owner. Delete operations intentionally omitted.*
