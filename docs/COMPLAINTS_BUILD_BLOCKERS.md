# Complaints / invoice build — blockers

Recorded while attempting Stages 1–5 of the receipt complaints & invoice work on
`claude/service-availability-maintenance-zj4whc`.

## Blocker (all stages)

**Missing binding plan:** `docs/RECEIPT_FEEDBACK_AND_COMPLAINTS_PLAN.md` (revision 2)
is not present on this branch, on `origin/main`, or on any remote branch searched
(`git ls-tree`, GitHub contents API, path `/home/user/Bakeandgrill/...`).

The build prompt says that file is binding, must be read completely before any
code, and wins where the prompt and plan disagree. Without it:

- Schema details in plan §3 / §10 (exact columns, snapshot fields, reference
  format rules, settings keys for complaint windows) cannot be implemented
  without guessing.
- Money / permissions / privacy edges in §6 (refund linkage), §7 (photos),
  §8 (invoice Pay routing), and §11 (abuse protection) cannot be reconciled
  against the prompt safely.
- STOP CONDITION: “Any point where the plan is genuinely ambiguous about money,
  permissions or customer privacy” — absence of the plan is that ambiguity.

**Action needed from owner:** commit or attach revision 2 of
`docs/RECEIPT_FEEDBACK_AND_COMPLAINTS_PLAN.md` to this branch (or `main`), then
re-run the five-stage build.

## Stages status

| Stage | Status |
|---|---|
| 1 — Foundation | **Blocked** — plan missing |
| 2 — Form | **Blocked** — plan missing |
| 3 — Photos and ratings | **Blocked** — plan missing |
| 4 — Refund linkage | **Blocked** — plan missing |
| 5 — Invoice page | **Blocked** — plan missing (§8); not independent of the plan file itself |

No application code was changed for this feature. Absolute prohibitions (no public
refund path, no public complaint photos, no auto public reviews, no weakened
guards, no generic Pay, fixture add-only) were not tested because implementation
did not start.

## What was checked

- `docs/` on HEAD and `origin/main`
- `git log --all -- '*RECEIPT_FEEDBACK*' '*COMPLAINT*'`
- Remote branch name search for complaint/feedback/receipt plan branches
- Existing live gap confirmed: `ReceiptPageController::feedback` /
  `Api\ReceiptController::feedback` write `receipt_feedback` only; no admin
  queue or SMS consumer found yet
