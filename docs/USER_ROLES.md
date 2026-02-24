# User Roles – Bake & Grill

Staff log in with a **PIN** (and device ID for POS). Each staff user has one **role** that controls what they can do.

---

## The four staff roles

| Role      | Slug     | Who it’s for |
|-----------|----------|----------------|
| **Owner** | `owner`  | Business owner; full access. |
| **Admin** | `admin`  | Back-office admin; same as owner for permissions. |
| **Manager** | `manager` | Shift / floor manager; can do refunds, discounts, stock, cash, purchases, SMS. |
| **Cashier** | `cashier` | Till only; orders, payments, hold/resume. No refunds, discounts, or device management. |

---

## What each role can do

| Action | Cashier | Manager | Admin | Owner |
|--------|:-------:|:-------:|:-----:|:-----:|
| **POS** – Create orders, take payments, hold/resume | ✅ | ✅ | ✅ | ✅ |
| **Apply discount** on an order | ❌ | ✅ | ✅ | ✅ |
| **Process refund** | ❌ | ✅ | ✅ | ✅ |
| **Void order** | ❌ | ✅ | ✅ | ✅ |
| **Stock** – Adjust inventory, stock count | ❌ | ✅ | ✅ | ✅ |
| **Cash** – Open/close shift, cash movements | ❌ | ✅ | ✅ | ✅ |
| **Purchases** – Create/edit purchases, suppliers | ❌ | ✅ | ✅ | ✅ |
| **SMS promotions** – Send SMS campaigns | ❌ | ✅ | ✅ | ✅ |
| **Devices** – Register, enable/disable POS devices | ❌ | ❌ | ✅ | ✅ |
| **Menu admin** – Add/delete items (via /admin or API) | ✅* | ✅* | ✅ | ✅ |

\* Menu add/delete only requires a valid staff token; the app does not further restrict by role.

---

## Demo users (after seeding)

If you ran `php artisan db:seed` with the demo seeders, these users exist:

| Name    | Role    | PIN  | Email                 |
|---------|---------|------|------------------------|
| Owner   | owner   | 1111 | owner@bakegrill.local  |
| Admin   | admin   | 2222 | admin@bakegrill.local  |
| Manager | manager | 3333 | manager@bakegrill.local |
| Cashier | cashier | 4444 | cashier@bakegrill.local |

Use the **PIN** to log in at POS, KDS, or the menu admin page. The **role** is stored in the database and used by the backend to allow or deny actions (e.g. refunds, discounts, device management).

---

## Customers (not staff)

- **Customers** are separate: they log in with **OTP** (SMS) on the website / online ordering.
- They have a `customer` token ability; they can only place orders and see their own orders, not access staff features or roles.

---

## Changing a user’s role

Roles are stored in the `roles` table; users have a `role_id` in the `users` table. To change someone’s role you need to update the database (e.g. via Laravel Tinker or a future admin UI):

```bash
cd backend
php artisan tinker
```

```php
$user = \App\Models\User::where('email', 'cashier@bakegrill.local')->first();
$managerRole = \App\Models\Role::where('slug', 'manager')->first();
$user->update(['role_id' => $managerRole->id]);
```

---

## Summary

- **4 staff roles:** Owner, Admin, Manager, Cashier.  
- **Cashier:** POS only (orders, payments).  
- **Manager:** + discounts, refunds, void, stock, cash, purchases, SMS.  
- **Admin/Owner:** + device management.  
- **Demo PINs:** 1111 (Owner), 2222 (Admin), 3333 (Manager), 4444 (Cashier).
