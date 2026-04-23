# POS UAT Execution Report

## Environment

| Field | Value |
|-------|--------|
| Base URL | `https://test.bakeandgrill.mv` |
| POS route | `https://test.bakeandgrill.mv/pos/` |
| Date (authoritative) | Friday 24 April 2026 |
| Time (local agent) | ~00:20–00:25 (session approximate) |
| Browser automation | Cursor IDE Browser MCP (Chromium-based) |
| Viewports exercised | 1280×800 (desktop), 768×1024 (tablet), 390×844 (mobile) |

## Credentials and data

| Item | Used in this run |
|------|------------------|
| Staff email + PIN | **Not provided** — no successful staff login executed |
| Negative-test emails | `notauser@invalid-domain-test.xyz`, `pos-uat-staff@bakeandgrill.test` |
| Test PIN (invalid) | `1234`, `9999` |
| OPS / shift / inventory | Not reached (login required) |

## What was executed live

1. **A001** — Loaded `/pos/`; Bake & Grill POS login card rendered; title "Bake & Grill - POS".
2. **A003** — Invalid credentials → red banner: "Login failed. Check your email and PIN." Screenshot: `pos-uat-evidence/A003-invalid-login.png`.
3. **A004** — Wrong PIN path with plausible email → same error handling (API/auth failure).
4. **A005** — Empty email → "Sign In →" remained **disabled** (matches `LoginPage` / `App.tsx` guard).
5. **A006** — Email filled, PIN length 3 → Sign In **disabled** (`pin.length < 4`).
6. **B001 / B005** — Device ID field showed `POS-532C34E3` on first paint.
7. **B002** — Full navigation reload to `/pos/` retained the same device ID.
8. **C007** — Verified `https://test.bakeandgrill.mv/` loads from site root (same origin as login link `href="/"`).
9. **V001** — Login failure surfaced usable inline error (same evidence as A003).
10. **W001** — At 768×1024, login layout remained usable (no horizontal clipping in snapshot).
11. **W005** — At 390×844, login layout usable. Screenshot: `pos-uat-evidence/W005-mobile-login.png`.
12. **A001 evidence** — Screenshot: `pos-uat-evidence/A001-pos-load.png`.

## Summary counts

| Metric | Value |
|--------|-------|
| Total test cases in matrix | 151 |
| **PASS** (live) | **12** |
| **BLOCKED** (missing staff access) | **127** |
| **NOT EXECUTED** (manual / network / DevTools) | **11** |
| **NOT AVAILABLE** (UI gap vs spec) | **1** |

### By area (high level)

| Area | Note |
|------|------|
| A | Login negatives + load PASS; success path BLOCKED |
| B | Device ID on login PASS; clear-storage test manual |
| C | Site link PASS; POS/OPS header BLOCKED |
| D | Offline suite NOT EXECUTED (tooling) |
| E–U | BLOCKED pending staff credentials |
| V | Login failure PASS; simulated API failures NOT EXECUTED |
| W | Layout-only PASS; flows BLOCKED |

## Biggest blockers

1. **No demo staff email + PIN** shared for this session — **127** cases require authenticated POS/OPS.
2. **Offline / failure injection** (Areas D, F007, K010, V002, V005) need DevTools or OS network control — marked NOT EXECUTED, not falsely marked PASS.

## Automation / commands

```bash
# Generate CSV (optional regeneration)
python3 scripts/generate_pos_uat_artifacts.py
```

Browser actions were performed via MCP (`browser_navigate`, `browser_snapshot`, `browser_fill`, `browser_click`, `browser_resize`, `browser_take_screenshot`); no Playwright/Cypress suite was added in this pass.

## Verdict

**POS UAT BLOCKED BY MISSING ACCESS/ENVIRONMENT** for full matrix completion. The **12 PASS** results are limited to **pre-auth** UX, validation, device ID persistence, main site link, and responsive login shell.
