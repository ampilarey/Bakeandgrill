# Bake & Grill – Full Setup, Use, and How Everything Works

**Purpose of this document:** Complete reference for setup, daily use, user roles, and how the website and apps work. You can share this document with others (e.g. ChatGPT) to explain the whole system.

---

## Table of Contents

1. [What Bake & Grill Is](#1-what-bake--grill-is)
2. [Full Setup (Step by Step)](#2-full-setup-step-by-step)
3. [List of Apps and Website](#3-list-of-apps-and-website)
4. [How Each Part Works and How to Use It](#4-how-each-part-works-and-how-to-use-it)
5. [User Roles in Detail](#5-user-roles-in-detail)
6. [Ordering: Two Options Explained](#6-ordering-two-options-explained)
7. [How It All Fits Together (Architecture)](#7-how-it-all-fits-together-architecture)
8. [Development vs Production URLs](#8-development-vs-production-urls)
9. [Quick Reference](#9-quick-reference)

---

## 1. What Bake & Grill Is

Bake & Grill is a **café operating system**. It includes:

- A **main website** (info + ordering on the same site).
- An **online order app** (dedicated ordering experience).
- **POS app** for staff (take orders, payments, tables, reports).
- **KDS app** for kitchen (view and manage orders).
- **Menu admin** page (add/delete menu items).
- A **print proxy** service that sends receipts and kitchen tickets to thermal printers.

All of these use **one backend** (Laravel API + database). Staff log in with a **PIN**; customers log in with **OTP (SMS)** when ordering online.

---

## 2. Full Setup (Step by Step)

### Prerequisites

- **Docker Desktop** (or Docker + Docker Compose) – for database, Redis, optional backend/print-proxy.
- **Node.js 20+** and npm – for React apps.
- **PHP 8.5+** and **Composer 2.x** – for Laravel backend (if not using Docker for backend).
- **Git** – to clone the project.

### Step 1: Clone and prepare environment

```bash
git clone <repository-url>
cd "Bake&Grill"
cp .env.example .env
```

### Step 2: Start Docker services (database, Redis, optional backend)

```bash
docker-compose up -d
```

This starts:

- **PostgreSQL** on port 5432 (database).
- **Redis** on port 6379 (cache, queues).
- Optionally **Laravel backend** on port 8000 and **print proxy** on port 3000 (if defined in your docker-compose).

If you run the backend **locally** (not in Docker), skip backend in Docker and do Step 3.

### Step 3: Backend setup (Laravel)

```bash
cd backend
cp .env.example .env
# Edit .env: set DB_*, REDIS_*, APP_KEY, etc.
composer install
php artisan key:generate
php artisan migrate --seed
cd ..
```

- `migrate --seed` creates tables and seeds **roles** and **demo staff users** (Owner, Admin, Manager, Cashier with PINs 1111, 2222, 3333, 4444).

### Step 4: Run the backend (if not in Docker)

```bash
cd backend
php artisan serve
```

Backend runs at **http://localhost:8000**.

### Step 5: Install and run frontend apps (React)

For each app (online-order-web, pos-web, kds-web):

```bash
cd apps/online-order-web
npm install
npm run dev
```

Then repeat for `pos-web` and `kds-web` (in separate terminals or background).

- **Online order app** – usually port **3003**.
- **POS app** – usually port **3001**.
- **KDS app** – usually port **3002**.

### Step 6 (Optional): Print proxy

If you use thermal printers:

```bash
cd print-proxy
npm install
# Configure .env: PRINT_PROXY_KEY, PRINTERS_JSON
npm run dev
```

Runs on port **3000**; backend sends print jobs here.

### Step 7 (Optional): Device registration for POS

Staff orders from the POS require a **registered device**. Once, with a staff token:

```bash
curl -X POST http://localhost:8000/api/devices/register \
  -H "Authorization: Bearer YOUR_STAFF_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"POS 1","identifier":"POS-001","type":"pos","ip_address":"127.0.0.1"}'
```

Only **Owner** or **Admin** can register devices. Use a device ID (e.g. `POS-001`) when logging in at the POS.

### Summary of what you run

| Component        | How to run              | Port (typical) |
|-----------------|-------------------------|----------------|
| Backend (Laravel) | `php artisan serve` or Docker | 8000           |
| Main website     | Same as backend (served by Laravel) | 8000           |
| Online order app | `npm run dev` in apps/online-order-web | 3003           |
| POS app          | `npm run dev` in apps/pos-web | 3001           |
| KDS app          | `npm run dev` in apps/kds-web | 3002           |
| Print proxy      | `npm run dev` in print-proxy | 3000           |

---

## 3. List of Apps and Website

| # | Name              | Type        | Who uses it        | URL (dev)              |
|---|-------------------|------------|--------------------|------------------------|
| 1 | **Main website**  | Laravel Blade (server-rendered HTML) | Customers, visitors | http://localhost:8000 |
| 2 | **Online order app** | React PWA  | Customers          | http://localhost:3003 (or /order/ in prod) |
| 3 | **POS app**       | React PWA  | Staff (cashiers, managers) | http://localhost:3001 (or /pos in prod) |
| 4 | **KDS app**       | React PWA  | Staff (kitchen)    | http://localhost:3002 (or /kds in prod) |
| 5 | **Menu admin**    | Blade page | Staff              | http://localhost:8000/admin |
| 6 | **Print proxy**   | Node.js service | No direct user; backend calls it | Port 3000 |

- **Main website** = same process as the backend (Laravel serves both API and Blade pages).
- **Online order, POS, KDS** = separate React apps; they call the backend API.
- **Menu admin** = part of the main website (route `/admin`).
- **Print proxy** = receives print jobs from the backend and sends them to ESC/POS printers.

---

## 4. How Each Part Works and How to Use It

### 4.1 Main website (port 8000)

- **What it is:** The main café site: home, menu, contact, hours, privacy, customer login (OTP), checkout, receipts, event pre-orders.
- **How to use:**
  - **Visitors:** Open http://localhost:8000. Browse home, menu, contact, hours.
  - **Order on the main site:** Go to **Menu**, add items to cart (stored in browser). Click **Cart** / **Checkout** → choose takeaway/delivery → **Login** (OTP) if needed → **Place order**.
  - **Event pre-orders:** Use **Pre-Order** or **Event Orders** from the menu.
  - **Receipts:** Customer can open receipt link from email/SMS (e.g. `/receipts/{token}`).
- **Tech:** Laravel Blade views + JavaScript (cart in `localStorage`). Same backend as the API.

### 4.2 Online order app (port 3003)

- **What it is:** A separate React app only for ordering: menu, cart, OTP login, place order, order history.
- **How to use:**
  - Open http://localhost:3003 (or your production `/order/` URL).
  - **Login:** Enter phone → receive OTP via SMS → enter OTP → logged in.
  - **Order:** Browse categories/items, add to cart, add notes, click **Place order**. Order is sent to the same backend as the main site.
  - Cart can be **imported** from the main website if the user added items there first (same browser).
- **Tech:** React, TypeScript, Vite. Calls backend API; no server-rendered HTML.

### 4.3 POS app (port 3001)

- **What it is:** Point-of-sale for staff: create orders, take payments, manage tables, shifts, reports, inventory, refunds (if role allows), offline queue.
- **How to use:**
  - Open http://localhost:3001 (or /pos).
  - **Login:** Enter **staff PIN** (e.g. 1111, 2222, 3333, 4444) and **device ID** (e.g. POS-001). Device must be registered (Owner/Admin).
  - **Create order:** Choose order type (Dine-in / Takeaway / Online pickup), select table if dine-in, add items from menu (with modifiers), optional discount, then **Checkout** or **Hold**.
  - **Payments:** Add cash/card/wallet, complete payment. Receipt and kitchen prints can be sent via print proxy.
  - **Operations:** Tabs/sections for Inventory, Suppliers, Purchases, Shifts, Reports, SMS promotions, Refunds (depending on role).
  - **Offline:** If the network fails, orders are queued locally and synced when back online.
- **Tech:** React PWA, offline queue in browser.

### 4.4 KDS app (port 3002)

- **What it is:** Kitchen display: list of orders, mark “in progress”, bump, recall.
- **How to use:**
  - Open http://localhost:3002 (or /kds).
  - **Login:** Staff PIN + device ID (e.g. KDS-001 if registered).
  - View orders; tap to **Start**, **Bump**, or **Recall**. Updates are reflected for all KDS users.
- **Tech:** React, real-time or polling to backend API.

### 4.5 Menu admin (http://localhost:8000/admin)

- **What it is:** A page on the main site to add and delete menu items (and optionally manage categories via API).
- **How to use:**
  - Open http://localhost:8000/admin.
  - **Login:** Staff PIN and device ID (e.g. ADMIN-001).
  - **Add item:** Select category, enter name, price (MVR), optional description → **Add item**.
  - **Delete item:** Click **Delete** next to an item and confirm.
- **Tech:** Blade view + JavaScript that calls the backend API with the staff token.

### 4.6 Print proxy (port 3000)

- **What it is:** A small Node.js server. The backend sends it print jobs (receipts, kitchen tickets); it forwards them to thermal printers (ESC/POS over TCP, e.g. port 9100).
- **Who uses it:** No one directly. The backend uses it when an order is created or a receipt is printed.
- **Setup:** Configure `PRINTERS_JSON` (name, host, port per printer) and `PRINT_PROXY_KEY` to match the backend.

---

## 5. User Roles in Detail

There are **two kinds of users:** **staff** (PIN login) and **customers** (OTP login). Only staff have **roles**.

### 5.1 Staff roles (four)

| Role     | Slug     | Purpose |
|----------|----------|---------|
| **Owner**  | `owner`  | Full access; business owner. |
| **Admin**  | `admin`  | Same as Owner for permissions; can manage devices. |
| **Manager**| `manager`| Shift/floor manager; refunds, discounts, stock, cash, purchases, SMS. |
| **Cashier**| `cashier`| Till only; create orders, take payments, hold/resume. |

### 5.2 What each staff role can do

| Action | Cashier | Manager | Admin | Owner |
|--------|:-------:|:-------:|:-----:|:-----:|
| POS – create orders, payments, hold/resume | ✅ | ✅ | ✅ | ✅ |
| Apply discount on order | ❌ | ✅ | ✅ | ✅ |
| Process refund | ❌ | ✅ | ✅ | ✅ |
| Void order | ❌ | ✅ | ✅ | ✅ |
| Stock – adjust inventory, stock count | ❌ | ✅ | ✅ | ✅ |
| Cash – open/close shift, cash movements | ❌ | ✅ | ✅ | ✅ |
| Purchases – suppliers, purchase orders | ❌ | ✅ | ✅ | ✅ |
| SMS promotions – send campaigns | ❌ | ✅ | ✅ | ✅ |
| Devices – register, enable/disable POS devices | ❌ | ❌ | ✅ | ✅ |
| Menu admin – add/delete items | ✅ | ✅ | ✅ | ✅ |

Menu add/delete only requires a valid staff token; the backend does not restrict it by role further.

### 5.3 Demo staff users (after seeding)

| Name    | Role    | PIN  | Email                  |
|---------|---------|------|------------------------|
| Owner   | owner   | 1111 | owner@bakegrill.local  |
| Admin   | admin   | 2222 | admin@bakegrill.local  |
| Manager | manager | 3333 | manager@bakegrill.local |
| Cashier | cashier | 4444 | cashier@bakegrill.local |

Use the **PIN** (and a device ID for POS/KDS) to log in. The **role** is stored in the database and enforced by the backend (policies/gates).

### 5.4 Customers

- **Customers** are not staff. They log in with **OTP (SMS)** on the main site or the online order app.
- They get a Sanctum token with the `customer` ability. They can only place orders and see their own orders; they do not have staff roles or access to POS/KDS/admin.

---

## 6. Ordering: Two Options Explained

Customers can place orders in **two different ways**. Both use the **same backend and same menu**; only the **interface** differs.

### Option A: Order on the main website (port 8000)

- **Flow:** Main site → **Menu** → add to cart (browser storage) → **Checkout** → login (OTP if needed) → place order.
- **Use case:** Customer is already on your website; they order without leaving it.
- **Where:** All on the same domain (e.g. http://localhost:8000).

### Option B: Order in the online order app (port 3003)

- **Flow:** Open the order app → **Menu** → cart → **Login (OTP)** → place order.
- **Use case:** You share a direct “Order here” link; or you want a dedicated, app-like ordering experience (e.g. PWA on mobile).
- **Where:** Different app (different port in dev, often same domain `/order/` in production).

### Relationship between the two

- **Same backend, same menu, same order type** (e.g. online pickup). Orders from both go into the same system.
- The **online order app** can **import** the main site’s cart from `localStorage` if the user had added items on the main site first.
- You can use **only one** of these flows, or **both**: main site for “order on our website,” app for “order via this link/app.”

---

## 7. How It All Fits Together (Architecture)

```
                    ┌─────────────────────────────────────────┐
                    │         Laravel Backend (PHP)            │
                    │  • API (orders, menu, auth, reports)     │
                    │  • Main website (Blade: home, menu,      │
                    │    contact, checkout, receipts, /admin)  │
                    │  • Database (PostgreSQL), Redis          │
                    └──────────────────┬──────────────────────┘
                                        │
          ┌─────────────────────────────┼─────────────────────────────┐
          │                             │                             │
          ▼                             ▼                             ▼
   ┌──────────────┐             ┌──────────────┐             ┌──────────────┐
   │ Main website │             │ React apps   │             │ Print proxy  │
   │ (Blade)      │             │ POS, KDS,    │             │ (Node.js)    │
   │ same process │             │ Online order │             │ → printers   │
   └──────────────┘             └──────────────┘             └──────────────┘
```

- **Backend:** Serves the main website (Blade) and the REST API. Stores data in PostgreSQL; uses Redis for cache/queues.
- **React apps (POS, KDS, online order):** Run in the browser, call the API for all data and actions (auth, menu, orders, payments, etc.).
- **Print proxy:** Receives print jobs from the backend and sends them to thermal printers. No user-facing UI.

**Auth:**

- **Staff:** PIN (+ device ID for POS/KDS) → API returns Sanctum token with `staff` ability. Role is stored in DB and used for permissions (refund, discount, device, etc.).
- **Customers:** Phone → OTP (SMS) → API returns Sanctum token with `customer` ability. Can only place orders and see own orders.

**Security (summary):** Server computes all prices; clients never send prices. CORS and Sanctum protect the API. Devices must be registered for POS orders.

---

## 8. Development vs Production URLs

| Part           | Development              | Production (example)        |
|----------------|--------------------------|-----------------------------|
| Main website   | http://localhost:8000    | https://yoursite.com        |
| Online order   | http://localhost:3003    | https://yoursite.com/order/ |
| POS            | http://localhost:3001    | https://yoursite.com/pos    |
| KDS            | http://localhost:3002    | https://yoursite.com/kds    |
| Menu admin     | http://localhost:8000/admin | https://yoursite.com/admin |
| API            | http://localhost:8000/api    | https://yoursite.com/api    |

In production, the React apps are usually **built** (e.g. `npm run build`) and the built files are placed under the Laravel `public` directory (e.g. `public/order/`, `public/pos/`, `public/kds/`) so the same domain serves everything.

---

## 9. Quick Reference

| Topic | Summary |
|-------|---------|
| **What it is** | Café system: main website, online order app, POS, KDS, menu admin, print proxy. |
| **Backend** | Laravel 12, PHP 8.5, PostgreSQL, Redis. Serves main site + API. |
| **Frontend** | Main site = Blade; POS, KDS, online order = React. Menu admin = Blade + JS. |
| **Staff login** | PIN + device ID (for POS/KDS). Roles: Owner, Admin, Manager, Cashier. |
| **Customer login** | OTP (SMS) on website or order app. |
| **Ordering** | Two options: (1) main site menu → checkout, (2) online order app. Same backend. |
| **Demo PINs** | 1111 Owner, 2222 Admin, 3333 Manager, 4444 Cashier. |
| **Setup** | Docker for DB/Redis; backend: `composer install`, `migrate --seed`, `php artisan serve`; apps: `npm install`, `npm run dev` in each. |

---

**End of document.** You can share this file with ChatGPT or anyone else to explain the full setup, use, roles, and how the website and apps work together.
