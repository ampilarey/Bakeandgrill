# How the Website and Apps Work – Short Overview

## In one sentence

**One Laravel backend** (API + main website) is used by **several web apps**: a customer-facing site and ordering app, and staff apps for POS and kitchen, plus a small print server for receipts.

---

## How it fits together

```
                    ┌─────────────────────────────────────────┐
                    │         Laravel Backend (PHP)            │
                    │  • API (orders, menu, auth, reports)     │
                    │  • Main website (home, menu, contact)   │
                    │  • Database (PostgreSQL)                 │
                    └──────────────────┬───────────────────────┘
                                       │
         ┌─────────────────────────────┼─────────────────────────────┐
         │                             │                             │
         ▼                             ▼                             ▼
  ┌──────────────┐            ┌──────────────┐            ┌──────────────┐
  │ Main website │            │ React apps   │            │ Print proxy  │
  │ (Blade pages)│            │ (POS, KDS,   │            │ (Node.js)    │
  │              │            │  Online order)│            │ → printers   │
  └──────────────┘            └──────────────┘            └──────────────┘
```

- **Backend:** Serves the main website (Blade), runs the API, and talks to the database and (optionally) SMS and the print proxy.
- **React apps:** Run in the browser, call the API for data and actions (orders, menu, auth).
- **Print proxy:** Receives print jobs from the backend and sends them to thermal printers on the network.

---

## List of apps / parts

| # | App / part | What it is | Who uses it | URL (dev) |
|---|------------|------------|-------------|-----------|
| 1 | **Main website** | Laravel Blade (HTML) – home, menu, contact, hours, privacy, checkout, receipts | Customers (and anyone browsing) | `http://localhost:8000` |
| 2 | **Online order app** | React PWA – browse menu, cart, OTP login, place order | Customers | `http://localhost:3003/order/` or served at `/order` by backend in prod |
| 3 | **POS app** | React PWA – take orders, payments, tables, shifts, reports, inventory, offline queue | Staff (cashiers, managers) | `http://localhost:3001` or `/pos` in prod |
| 4 | **KDS app** | React PWA – list orders, mark “in progress”, bump, recall | Staff (kitchen) | `http://localhost:3002` or `/kds` in prod |
| 5 | **Menu admin** | Blade page – add/delete menu items (uses API with staff login) | Staff | `http://localhost:8000/admin` |
| 6 | **Print proxy** | Node.js server – receives print jobs from Laravel, sends to ESC/POS printers | Backend (no direct user UI) | Runs on port 3000; backend calls it |

So: **1 backend + main site**, **3 React apps** (online order, POS, KDS), **1 admin page**, **1 print service**.

---

## Short flow

- **Customers:** Visit the main website or go straight to the **online order** app → browse menu → log in with **OTP (SMS)** → place order. They can also use the main site’s **checkout** and **receipt** pages.
- **Staff:** Log in to **POS** (or **KDS**) with **PIN** → create orders / manage tables / take payments (POS) or manage kitchen orders (KDS). Orders can be sent to the **print proxy** for kitchen/bar printers.
- **Menu changes:** Staff open **/admin**, log in with PIN, then **add or delete items** (and the same menu is used by the main site and online order app).

---

## Tech in short

- **Backend:** Laravel 12, PHP 8.5, PostgreSQL, Redis.
- **Main site + admin:** Laravel Blade views.
- **Online order, POS, KDS:** React + TypeScript + Vite; they call the Laravel API.
- **Auth:** Staff = PIN + Sanctum token; customers = OTP (SMS) + Sanctum token.
- **Print:** Node.js print proxy → ESC/POS over TCP (e.g. port 9100).

---

## Summary

| Item | Description |
|------|-------------|
| **Website** | Main site on Laravel (info, menu, contact, checkout, receipts). |
| **Apps** | Online order (customers), POS (staff), KDS (kitchen), Menu admin (staff), Print proxy (no UI). |
| **How they work** | All use the same Laravel API and database; React apps run in the browser and talk to that API. |
