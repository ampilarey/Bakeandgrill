# Execution prompt — Admin theming migration

Paste the relevant stage into a fresh session.

---

## Stage 1 — Enforce the design system (run this regardless of the dark-mode decision)

```
Read docs/ADMIN_THEMING_MOBILE_PLAN.md first.

Implement Stage 1 only. Do not migrate any colours yet.

1. Add an ESLint rule to apps/admin-dashboard banning hex colour literals
   inside style={{…}} objects under src/pages/**. Set severity to "warn".
2. Baseline the existing ~3,188 violations so only NEW violations surface —
   the build must not start failing.
3. Add a short section to CLAUDE.md documenting the ten canonical hex →
   variable mappings from §1.4 of the plan, so future work uses variables.

Do not touch page source. Do not wrap tables. Do not change PageShell.
Commit to claude/service-availability-maintenance-zj4whc.
```

---

## Stage 2 — Colour migration (only if dark mode is staying)

```
Read docs/ADMIN_THEMING_MOBILE_PLAN.md first, especially §1.4 and §3.

Migrate hardcoded hex literals to CSS variables in apps/admin-dashboard,
starting with src/pages/DashboardPage.tsx ONLY.

Apply case-insensitive replacement of exactly these ten mappings:
  #6b5d4f → var(--color-text-secondary)
  #9c8e7e → var(--color-text-muted)
  #e8e0d8 → var(--color-border)
  #d4813a → var(--color-primary)
  #1c1408 → var(--color-text)
  #ef4444 → var(--color-danger)
  #f8f6f3 → var(--color-bg)
  #22c55e → var(--color-success)
  #f59e0b → var(--color-warning)
  #f0ebe5 → var(--color-border-light)

Leave every other hex literal alone — do not improvise mappings.

CRITICAL: light mode must be pixel-identical afterwards. Each variable's
:root value is byte-identical to the literal it replaces, so any visible
light-mode change means the replacement hit the wrong property — revert it,
don't tune it.

Run `npm test` in apps/admin-dashboard. Report the result honestly, including
failures.

Commit this page on its own to claude/service-availability-maintenance-zj4whc,
then STOP and report. Do not continue to other pages in the same run.
```

Then repeat, substituting the next page in the §3 order: `OrdersPage.tsx`,
`ReportsPage/ReportsTabPanels.tsx`, `ForecastPage.tsx`, then descending by count.

---

## Alternative — if dark mode is being dropped

```
Read docs/ADMIN_THEMING_MOBILE_PLAN.md first.

Decision: dark mode is not wanted in the admin. Remove it rather than leave a
toggle that only restyles the shell.

1. Remove the dark-mode toggle from AppShell (the moon icon and its handler).
2. Remove the [data-theme="dark"] blocks from src/index.css, including the
   [style*="background: #fff"] hack.
3. Remove any persisted theme preference read/write left orphaned by the above.

Leave the :root light variables in place — they are still used and are the
target of any future migration.

Run `npm test` in apps/admin-dashboard and report results.
Commit to claude/service-availability-maintenance-zj4whc.
```
