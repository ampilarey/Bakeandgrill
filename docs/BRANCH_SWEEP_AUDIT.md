# Branch sweep audit

Read-only inventory of remote branches that still carry content not present on `origin/main`, as of **2026-08-12** (main tip `a2a275516`).

**Nothing was merged, cherry-picked, rebased, deleted, or force-pushed.** This document recommends; the owner decides.

## Summary

`git fetch --all` then scanned **188** remote branches (`refs/remotes/origin/*` excluding `origin/main` and `origin/HEAD`). After excluding `backend/public/**` and `package-lock.json` from every comparison: **151** are fully merged (empty triple-dot), **0** are squash-merged (empty two-dot tree for source paths), and **37** remain candidates. Of those 37, **1** is **LOST WORK**, **30** are **SUPERSEDED**, **3** are **ABANDONED**, and **3** are **UNCLEAR**.

Calibration: `origin/claude/media-library-editing` (tip `f5ea79a78`, 2026-07-24) survived steps 2–3 as a candidate. A prior cleanup note had treated it as safe to delete; this method correctly kept it. Crop/rotate from that tip were later **re-implemented forward** on main (`52e31d0ff`); the tip still carries an **Export/download** UI that main does not have — that residual is the LOST WORK row below. **Do not merge that branch.**

> Method note: step 3 (`git diff origin/main B`) almost never goes empty for weeks-stale tips, even when their unique commits were squash-absorbed, because the rest of the tip tree lags main. Squash detection therefore produced **0** hits here. Classification of the 37 candidates was done from **triple-dot** unique paths, reading the diffs, and checking whether main already has equivalent code or a rescued copy of the doc (`e50e76144` and later).

---

## LOST WORK

Ordered by business cost (customer/staff product gap first).

| Branch | Tip date | What the live product is missing | Stale | Same-file commits on main since merge-base | Merge or reimplement? |
|---|---|---|---|---|---|
| `origin/claude/media-library-editing` | 2026-07-24 (`f5ea79a78`) | **Media Library detail drawer has no Export / Export original.** Staff cannot download the current (or master) file from the library without leaving the app. Visual crop, free-angle rotate, flip, cache-bust, and brand “use as” from the same tip are **already on main** via forward reimplementation (`52e31d0ff`) and later ContentWriter `useAs` — those parts are not missing anymore. | **707** commits behind main | **~23** commits touch the branch’s source files on main (including `MediaLibraryPage.tsx`, `MediaEditor.php`, media API/tests); **~10** touch `MediaLibraryPage.tsx` / `MediaEditor.php` alone | **Reimplement forward.** Merging would revert CSS-variable migration, mobile detail drawer, video studio, dark-mode Stages 2e/3c, and the newer crop/rotate UI. Port only `exportMediaAsset` / `mediaExportFilename` + the Export buttons/tests from `f5ea79a78`. Then delete the branch. |

### LOST WORK detail — `claude/media-library-editing`

**Commits not in main:**

```
f5ea79a78 feat(admin): add Media Library export/download
9b0f6546d feat(media): richer rotate tool with flip, free angle, live preview
b994c9ec1 fix(media): explicit Save as branding for favicon/logo/OG
a0077c64b fix(admin): stronger media cache-bust + live edit previews
52cbb0ea4 feat(media): visual crop, cache-bust, and brand use-as actions
```

**Triple-dot source delta (excluding `backend/public`, `package-lock.json`):** 10 files, +1070 / −96 — mainly `MediaLibraryPage.tsx`, `MediaEditor.php`, `MediaLibraryController.php`, media API/tests.

**What it does (from the code, not the name):** Adds an interactive `react-easy-crop` cropper and a rotate/flip panel with live CSS preview; teaches `opRotate` free angles; wires brand use-as; and (tip commit) adds client-side Export that `fetch`es the asset URL and triggers a browser download (plus Export original when `original_url` exists).

**Superseded on main already:** crop/rotate/flip (`52e31d0ff`), use-as via `MediaLibraryController::useAs` + `ContentWriter` / `ContentRegistry::SCOPES`, media cache-bust helpers.

**Still missing on main:** `exportMediaAsset` / `mediaExportFilename` and the Export UI — confirmed absent from `MediaLibraryPage.tsx` / `api/media.ts` on `origin/main` (only video-studio “Exported muted MP4…” toast exists).

---

## SUPERSEDED and ABANDONED (safe to delete)

One line each. Docs listed as “rescued” were copied onto main in `e50e76144` (or already lived on main); do not merge the stale tip.

### SUPERSEDED (30)

| Branch | Why safe to delete |
|---|---|
| `claude/branding-panel-redesign-plan` | Plan rescued; Brand Kit shipped (`BrandKitCards`, `35a0a69e2`). |
| `claude/content-app-scope-audit-plan` | Plan rescued; scope audit closed on main’s status header. |
| `claude/content-branding-unification-plan` | Plan rescued; branding unified under Content hub. |
| `claude/content-hub-layout-plan` | Plan rescued; hub shell/`SectionRail` shipped (`7e4f2af8b`). |
| `claude/content-studio-modern-plan` | Phase 6 landed (`643fa445a`); later `order_status_*` keys retired — merging would re-seed dead keys. |
| `claude/default-item-image-plan` | Plan rescued; `default_item_image` live (`73e305797`). |
| `claude/dinein-menu-view-plan` | Plan rescued; view-only dine-in menu shipped (`0146dc169`). |
| `claude/discount-strategy-plan` | Plan rescued; discount cards / evaluator path live. |
| `claude/home-page-builder-plan` | Plan rescued; Stages A–F built (`page_blocks`). Main’s doc is newer than the tip. |
| `claude/hub-desktop-width-plan` | Plan rescued; hub desktop width fix shipped. |
| `claude/iphone-media-upload-plan` | Plan rescued; HEIC convert + `.mov` accept shipped (`1e04b9f5e`). |
| `claude/media-library-plan` | Plan on main identical; central media library shipped (`91920c680`). |
| `claude/media-upgrade-plan` | Plan on main updated (`e7a40b95a`); WebP stages 1–3 built. Remaining Stage 4 is tracked on main’s doc, not trapped on this tip. |
| `claude/mobile-menu-footer-plan` | Both docs rescued; subcategory/menu work largely shipped; leftovers tracked on main’s status header. |
| `claude/multi-app-audit-calculations-1ijj9c` | Audit + catering plan rescued/on main; catering/events code advanced far past the tip. |
| `claude/platter-builder-plan` | Plan rescued; platter admin + picker + KDS stages shipped. |
| `claude/pos-discount-controls-plan` | Discount controls + SMS OTP approval shipped (`28f2ae6ad`); tip’s plan text is stale vs main. |
| `claude/redis-resilience-plan` | Plan rescued; `ResilientCache` widely used on main. Open failover items live in main’s plan, not as unique code on this branch. |
| `claude/sms-control-center-plan` | Plan identical on main; SMS Control Center shipped (`bb6c086ac`). |
| `claude/specials-display-consistency-plan` | Plan rescued; unified specials/offers work on main (`624d07d3f`). Residual “unverified” polish is a main-doc follow-up, not branch-trapped code. |
| `claude/tv-signage-plan` | Plan rescued; TV signage designer/player shipped. Rev 2.1 polish tracked on main’s doc. |
| `claude/menu-mobile-one-col` | Headline “1 col on phone” was rejected; main hard-codes 2-col (`c7964b09e` and later). Merging would fight current menu CSS. |
| `fix/sms-cost-and-permissions` | Same fix on main as `d4c30a4f3` (em-dash GSM-7 defaults + send-perm filter); migration byte-identical. |
| `claude/audit-modularity-permissions-Ho3h1` | Domain SMS + granular permissions + gated nav reimplemented on main long ago. |
| `claude/review-production-implementation-bglsc` | Hardening absorbed (`after_commit`, OPcache, casts, etc.); review doc archived. |
| `claude/audit-admin-panel-E8Rp5` | Report + fix prompt rescued to `docs/archive/`. |
| `claude/code-review-report-KIJoL` | Report rescued to `docs/archive/CODE_REVIEW_REPORT.md`. |
| `claude/website-review-audit-gwuJu` | Prompt rescued to `docs/archive/WEBSITE_REVIEW_AUDIT_PROMPT.md`. |
| `claude/review-order-invoice-flow-0h8aj` | Prompt rescued to `docs/archive/CURSOR_ORDER_INVOICE_RECEIPT_PROMPT.md`. |
| `cursor/setup-dev-environment-4700` | `AGENTS.md` rescued/expanded on main; tip is an older draft. |

### ABANDONED (3)

| Branch | Why safe to delete |
|---|---|
| `claude/model-based-refactor-oSm83` | Deletes obsolete root Cursor prompts and adds a root `.cursorrules` prompt; no product code. Live rules are `.cursor/rules/*.mdc`. |
| `claude/audit-ordering-logic-vDPnc` | Single root `CURSOR_PROMPT.md` for ordering fixes; ordering has been rewritten many times since (1866 behind). Prompt never rescued; not a working feature branch. |
| `claude/audit-user-roles-ZRCvS` | Single root `CURSOR_PROMPT.md` for roles/permissions/layout; permissions model and admin shell shipped later (2017 behind). |

---

## UNCLEAR (3)

Keep this list small. Each needs one owner answer before delete.

| Branch | Tip | Question |
|---|---|---|
| `claude/determined-boyd` | 2026-03-21 — `AUTH_AUDIT_CURSOR_PROMPT.md` | Unique auth-audit prompt is **not** on main (unlike other March audits). The concrete bugs it names (plaintext password reset, deactivated-customer login) appear **fixed** on main (`hashed` cast + `is_active` checks). **Do you want this file copied to `docs/archive/` before the branch is deleted**, or is historical discard OK? |
| `claude/review-login-authentication-tXTTs` | 2026-03-20 — `CURSOR_PROMPT_AUTH_UPGRADE.md` | Unique unified-login/OTP upgrade prompt is **not** on main. Auth has been largely rebuilt since. **Archive to `docs/archive/` before delete, or discard?** |
| `claude/code-review-zcCNg` | 2026-03-24 — `.cursor/rules/code-review-fixes.mdc` (55-item fix list) | Never rescued; would install as an always-apply Cursor rule if merged. Critical items checked (e.g. payment `lockForUpdate`) look addressed on main. **Archive the mdc under `docs/archive/` before delete, or discard?** |

---

## Rollback branches

`origin/cursor/rollback-charge-4col-mobile-be02` is an ancestor of `origin/main` (empty triple-dot source diff) — the revert already landed. No unmerged rollback tip was found among candidates. No case of “rollback never merged so the bad change is still live” in this sweep.

---

## Exact commands (re-run in six months)

```bash
git fetch --all

MAIN=origin/main
EXCLUDES=(. ':(exclude)backend/public' ':(exclude)package-lock.json')

# List branches (exclude main + HEAD)
git for-each-ref --format='%(refname:short)' refs/remotes/origin \
  | grep -vE '^origin/(HEAD|main)$' | sort > /tmp/branches.txt

: > /tmp/merged.txt; : > /tmp/squash.txt; : > /tmp/candidates.txt

while IFS= read -r B; do
  # Step 2 — anything unique via merge-base triple-dot?
  if [[ -z "$(git diff --stat "$MAIN...$B" -- "${EXCLUDES[@]}" | tr -d '[:space:]')" ]]; then
    echo "$B" >> /tmp/merged.txt
    continue
  fi
  # Step 3 — entire tip tree already matches main for source paths?
  # (Rare for stale tips; still run it. Then classify survivors by reading
  # triple-dot diffs + checking main for equivalent code/docs.)
  if [[ -z "$(git diff --stat "$MAIN" "$B" -- "${EXCLUDES[@]}" | tr -d '[:space:]')" ]]; then
    echo "$B" >> /tmp/squash.txt
    continue
  fi
  echo "$B" >> /tmp/candidates.txt
done < /tmp/branches.txt

# Per candidate (example)
B=origin/claude/example
git log --oneline "$MAIN..$B"
git diff --stat "$MAIN...$B" -- "${EXCLUDES[@]}"
git diff --name-status "$MAIN...$B" -- "${EXCLUDES[@]}"
git rev-list --count "$B..$MAIN"          # how far behind
MB=$(git merge-base "$MAIN" "$B")
# commits on main touching the same source files since merge-base:
git log --oneline "$MB..$MAIN" -- $(git diff --name-only "$MAIN...$B" -- "${EXCLUDES[@]}")

# Calibration — must appear in candidates until Export is ported or the tip is deleted:
grep media-library-editing /tmp/candidates.txt
```

**Classification rules used**

1. **LOST WORK** — working product code on the tip that main still lacks (read the diff). Always report behind-count, same-file churn, and merge-vs-reimplement.
2. **SUPERSEDED** — main solved the same problem later (name the superseding commit or rescued doc path).
3. **ABANDONED** — spike, obsolete prompt, or explicitly rejected direction (e.g. 1-col mobile menu).
4. **UNCLEAR** — only when a unique artifact’s retention value is a human call; ask one precise question.

**Do not** summarise from branch names. **Do not** merge stale tips that touch files main has rewritten.

---

## Related prior note

`docs/BRANCH_CLEANUP_AUDIT.md` (2026-08-10) rescued many plan docs and marked most of these tips safe to delete. It under-weighted `claude/media-library-editing` (flagged “unless you still want export/download”). This sweep uses a stricter content filter and keeps that residual as **LOST WORK** until Export is reimplemented or explicitly declined.
