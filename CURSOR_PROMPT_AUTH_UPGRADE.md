# Cursor Prompt: Unified Login + Smart OTP System for Bake & Grill

## Project Context

This is a **Laravel 12 + React monorepo** for a Maldivian restaurant called "Bake & Grill". The backend is at `/backend` and serves:

- **Main Website** — Blade templates at `/` (home, contact, hours, terms, etc.)
- **Online Order App** — React SPA at `/order/*` (built from `/apps/online-order-web`)
- **Other apps** — POS, Admin Dashboard, KDS, Delivery (not relevant to this task)

**Domain**: Everything runs on the same domain (e.g., `bakeandgrill.mv`).

---

## Current Authentication Problem

### Problem 1: Two Separate Login Systems
- The **main Blade website** has its own login via `CustomerPortalController` (`/customer/login`). It stores auth in **Laravel sessions** (`session(['customer_id' => ...])`)
- The **React order app** has its own login via `CustomerAuthController` API (`/api/auth/customer/otp/*`). It stores auth in **localStorage** (`online_token`)
- A customer who logs in on the main website is NOT logged in on the order app, and vice versa. They have to log in TWICE — once on each.

### Problem 2: OTP SMS Every Single Login (Expensive)
- Currently, customers must verify via SMS OTP **every time** they log in — both on the main site and order app
- There is NO password-based login. The `Customer` model has no `password` column
- SMS costs money per message (Dhiraagu SMS provider). This adds up fast

### Problem 3: No Profile Setup Flow
- Customers are auto-created via `firstOrCreate` on OTP verification with minimal data (just phone)
- There's no structured first-time flow to collect name, email, and set a password

---

## What to Build

### Part A: Unified Cookie-Based Authentication (Single Login for Both Apps)

**Goal**: Customer logs in once, stays logged in across both the Blade site AND the React order app.

**Approach**: Switch from token-in-localStorage to **Sanctum SPA cookie authentication** for customers. Since both apps are on the same domain, a shared session cookie works perfectly.

#### Backend Changes:

1. **Update `config/sanctum.php`**:
   - Set `stateful` domains to include your production domain and localhost for dev
   - Example: `'stateful' => explode(',', env('SANCTUM_STATEFUL_DOMAINS', 'localhost,localhost:5173,bakeandgrill.mv'))`

2. **Update `config/cors.php`**:
   - Set `'supports_credentials' => true`
   - Set `'allowed_origins'` to include the app domains

3. **Update `config/session.php`**:
   - Make sure `'domain'` is set to the root domain (e.g., `.bakeandgrill.mv`) so the cookie is shared across all paths
   - `'same_site' => 'lax'` is fine since everything is same-domain

4. **Refactor `CustomerPortalController::verifyOtp()`** (`/backend/app/Http/Controllers/CustomerPortalController.php`):
   - After OTP verification, use `Auth::guard('web')->login($customer)` to start a proper Laravel session for the customer
   - Remove the manual `session(['customer_id' => ...])` calls — let Laravel's auth system handle it
   - Still create a Sanctum token as fallback if needed, but the primary auth mechanism should be the session cookie

5. **Refactor `CustomerAuthController::verifyOtp()`** (`/backend/app/Http/Controllers/Api/Auth/CustomerAuthController.php`):
   - Also call `Auth::guard('web')->login($customer)` to set the session
   - Still return the token in the response for backward compatibility during transition
   - The React app will eventually use cookie auth instead of the token

6. **Add a new API endpoint `POST /api/auth/customer/login`** for phone+password login:
   ```php
   // In CustomerAuthController or a new controller
   public function passwordLogin(Request $request)
   {
       $request->validate([
           'phone' => ['required', 'string', new MaldivesPhone()],
           'password' => 'required|string|min:6',
       ]);

       $phone = $this->normalizePhone($request->phone);
       $customer = Customer::where('phone', $phone)->first();

       if (!$customer || !$customer->password || !Hash::check($request->password, $customer->password)) {
           throw ValidationException::withMessages([
               'phone' => ['Invalid phone number or password.'],
           ]);
       }

       Auth::guard('web')->login($customer);
       $request->session()->regenerate();

       $token = $customer->createToken('customer-' . $customer->phone, ['customer'])->plainTextToken;
       $customer->update(['last_login_at' => now()]);

       return response()->json([
           'message' => 'Login successful',
           'token' => $token,
           'customer' => [...],
       ]);
   }
   ```

7. **Add a customer auth check endpoint `GET /api/auth/customer/check`**:
   - This lets the React app check if the user is already authenticated via session cookie (e.g., they logged in on the Blade site)
   - Returns customer data if session is active, 401 if not
   - The React app calls this on mount to skip the login flow

8. **Update the `EnsureCustomerToken` middleware** (`/backend/app/Http/Middleware/EnsureCustomerToken.php`):
   - It should accept BOTH cookie-based session auth AND bearer token auth
   - Check `Auth::guard('web')->user()` first (session cookie), then fall back to Sanctum token

9. **Update the Customer auth guard** — make sure the `Customer` model works with Laravel's web guard:
   - The `Customer` model already uses `Illuminate\Auth\Authenticatable` trait and implements `AuthenticatableContract` — good
   - Add a custom guard in `config/auth.php`:
     ```php
     'guards' => [
         'customer' => [
             'driver' => 'session',
             'provider' => 'customers',
         ],
     ],
     'providers' => [
         'customers' => [
             'driver' => 'eloquent',
             'model' => App\Models\Customer::class,
         ],
     ],
     ```

#### Frontend Changes (React Order App — `/apps/online-order-web`):

10. **Update API client** to include credentials:
    - In the shared API client, add `credentials: 'include'` (fetch) or `withCredentials: true` (axios) to all requests
    - This sends the session cookie with every API call

11. **Update `AuthBlock.tsx`** (`/apps/online-order-web/src/components/AuthBlock.tsx`):
    - On component mount, first call `GET /api/auth/customer/check` to see if user is already logged in via session cookie
    - If yes, skip login entirely and proceed to order
    - If no, show the login form (phone+password for returning users, OTP for new users)

12. **Remove token-only dependency**:
    - Keep `localStorage` token as a fallback/cache, but the primary auth should be the session cookie
    - Update any auth checks that only look at `localStorage.getItem('online_token')` to also check session status

---

### Part B: Smart OTP — First-Time Only + Password Login

**Goal**: OTP is only sent for first-time registration and password resets. Returning customers log in with phone + password (free, no SMS cost).

#### Backend Changes:

1. **Create a new migration** to add `password` and `is_profile_complete` to the `customers` table:
   ```php
   Schema::table('customers', function (Blueprint $table) {
       $table->string('password')->nullable()->after('email');
       $table->boolean('is_profile_complete')->default(false)->after('password');
   });
   ```

2. **Update the `Customer` model** (`/backend/app/Models/Customer.php`):
   - Add `password` and `is_profile_complete` to `$fillable`
   - Add `password` to `$hidden` array (never expose in API responses)
   - Add `is_profile_complete` to `$casts` as boolean
   - Add the `password` cast: `'password' => 'hashed'` (Laravel 12 auto-hashes on set)

3. **Create `POST /api/auth/customer/check-phone`** endpoint:
   - Accepts a phone number
   - Returns `{ exists: true, has_password: true }` or `{ exists: false, has_password: false }`
   - The frontend uses this to decide whether to show the password field or OTP flow
   - Rate limit this to prevent phone enumeration (throttle:10,1)

4. **Create `POST /api/auth/customer/login`** endpoint (phone + password):
   - Validates phone + password
   - Returns token + customer data (same format as `verifyOtp`)
   - Sets session cookie too (for unified auth)
   - Rate limit: 5 attempts per 5 minutes per phone

5. **Modify the existing `verifyOtp()` response** in both controllers:
   - After OTP verification, check if `$customer->is_profile_complete` is false
   - Include `is_profile_complete: false` in the response so the frontend knows to show the setup screen
   - Include `is_new_customer: $customer->wasRecentlyCreated` in the response

6. **Create `POST /api/customer/complete-profile`** endpoint (protected, customer auth required):
   ```php
   public function completeProfile(Request $request)
   {
       $request->validate([
           'name' => 'required|string|max:100',
           'email' => 'nullable|email|max:100',
           'password' => 'required|string|min:6|confirmed',
       ]);

       $customer = $request->user();
       $customer->update([
           'name' => $request->name,
           'email' => $request->email,
           'password' => Hash::make($request->password),
           'is_profile_complete' => true,
       ]);

       return response()->json([
           'message' => 'Profile completed successfully',
           'customer' => [...],
       ]);
   }
   ```

7. **Create `POST /api/customer/change-password`** endpoint (protected):
   ```php
   public function changePassword(Request $request)
   {
       $request->validate([
           'current_password' => 'required|string',
           'password' => 'required|string|min:6|confirmed',
       ]);

       $customer = $request->user();

       if (!Hash::check($request->current_password, $customer->password)) {
           throw ValidationException::withMessages([
               'current_password' => ['Current password is incorrect.'],
           ]);
       }

       $customer->update(['password' => Hash::make($request->password)]);

       return response()->json(['message' => 'Password changed successfully']);
   }
   ```

8. **Create `POST /api/auth/customer/forgot-password`** endpoint (public):
   - Accepts phone number, sends OTP
   - After OTP verification via a new `POST /api/auth/customer/reset-password` endpoint, allows setting a new password
   - This is the ONLY time OTP is sent for returning customers (rare, low cost)

9. **Update `POST /api/auth/customer/otp/request`** — add a `purpose` field:
   - `purpose: 'register'` — for new customers (default)
   - `purpose: 'reset_password'` — for forgot password flow
   - Reject OTP requests for customers who already have a password and are trying to "register" (they should use password login)

#### Frontend Changes (React Order App):

10. **Rewrite `AuthBlock.tsx`** with a multi-step flow:
    ```
    Step 1: Enter phone number
            ↓ Call POST /api/auth/customer/check-phone
            ↓
    Step 2a (existing customer with password): Show password field + "Forgot password?" link
    Step 2b (new customer OR no password): Send OTP → verify OTP
            ↓
    Step 3 (if is_profile_complete === false): Show profile setup form
            - Name (required)
            - Email (optional)
            - Password (required, with confirm)
            - Submit → POST /api/customer/complete-profile
            ↓
    Step 4: Authenticated → proceed to ordering
    ```

11. **Add a "Forgot password?" flow** in the auth UI:
    - Triggers OTP send with `purpose: 'reset_password'`
    - After OTP verification, shows password reset form
    - Calls `POST /api/auth/customer/reset-password`

12. **Add profile/account page** in the order app (or update existing if there is one):
    - Show customer name, phone, email
    - "Change password" button → current password + new password form
    - "Edit profile" for name/email updates

#### Blade Website Changes:

13. **Update `/customer/login` Blade view** (`resources/views/customer/login.blade.php`):
    - Same multi-step flow as React: phone → password or OTP → profile setup if needed
    - Update `CustomerPortalController` accordingly with the same logic

14. **Update the `CustomerPortalController`**:
    - Add `passwordLogin()` method for phone+password via form POST
    - Add `completeProfile()` method for the Blade-based profile setup
    - Modify `verifyOtp()` to redirect to profile setup page if `is_profile_complete === false`

---

### Part C: Guest Ordering (Not Logged In)

**Goal**: Allow customers to place orders without logging in, using OTP only at checkout to verify their phone for order tracking.

This is OPTIONAL and lower priority. If implemented:

1. Allow browsing menu and adding to cart without auth
2. At checkout, require phone number + OTP verification (one-time for that order)
3. Don't require password setup for guest orders — just verify phone and place order
4. If the customer already has an account, prompt them to log in with password instead

---

## File Reference (Key Files to Modify)

### Backend:
| File | Purpose |
|------|---------|
| `backend/app/Models/Customer.php` | Add `password`, `is_profile_complete` fields |
| `backend/app/Http/Controllers/Api/Auth/CustomerAuthController.php` | Add password login, modify OTP flow |
| `backend/app/Http/Controllers/CustomerPortalController.php` | Add password login for Blade, unified session |
| `backend/app/Http/Middleware/EnsureCustomerToken.php` | Accept both session + token auth |
| `backend/config/sanctum.php` | Add stateful domains |
| `backend/config/cors.php` | Enable credentials |
| `backend/config/session.php` | Set cookie domain for sharing |
| `backend/config/auth.php` | Add customer guard + provider |
| `backend/routes/api.php` | New customer auth routes |
| `backend/routes/web.php` | Update customer portal routes |

### Frontend:
| File | Purpose |
|------|---------|
| `apps/online-order-web/src/components/AuthBlock.tsx` | Complete rewrite — multi-step auth flow |
| `apps/online-order-web/src/api.ts` (or similar) | Add `credentials: 'include'`, new API calls |

### New Files to Create:
| File | Purpose |
|------|---------|
| `backend/database/migrations/xxxx_add_password_to_customers_table.php` | Migration for password + is_profile_complete |
| `backend/resources/views/customer/complete-profile.blade.php` | Blade profile setup page |

---

## New API Routes Summary

```php
// Public (no auth)
POST /api/auth/customer/check-phone       → { exists, has_password }
POST /api/auth/customer/login              → Phone + password login
POST /api/auth/customer/otp/request        → (existing, add purpose field)
POST /api/auth/customer/otp/verify         → (existing, add is_profile_complete in response)
POST /api/auth/customer/forgot-password    → Send OTP for password reset
POST /api/auth/customer/reset-password     → Verify OTP + set new password

// Protected (customer auth required)
GET  /api/auth/customer/check              → Check if session is active
POST /api/customer/complete-profile        → First-time name/email/password setup
POST /api/customer/change-password         → Change existing password
```

---

## Authentication Flow Diagram (After Changes)

```
Customer visits bakeandgrill.mv
         ↓
Clicks "Order Now" → goes to /order/
         ↓
React app mounts → calls GET /api/auth/customer/check
         ↓
┌─── Session cookie exists? ───┐
│ YES                          │ NO
│ → Already logged in          │ → Show login form
│ → Skip to menu               │
│                              ↓
│                    Enter phone number
│                    POST /api/auth/customer/check-phone
│                              ↓
│               ┌── has_password? ──┐
│               │ YES               │ NO (new customer)
│               ↓                   ↓
│         Show password        Send OTP (SMS cost: 1 msg)
│         field                Verify OTP
│               ↓                   ↓
│         POST /login          POST /otp/verify
│         (no SMS cost)             ↓
│               ↓              is_profile_complete === false?
│               │                   ↓ YES (first time)
│               │              Show profile setup:
│               │              - Name (required)
│               │              - Email (optional)
│               │              - Password (required)
│               │              POST /complete-profile
│               ↓                   ↓
└───────────── AUTHENTICATED ──────┘
               ↓
         Session cookie set
         Both Blade & React apps authenticated
         ↓
         Browse menu & place order
```

---

## Security Considerations

1. **Rate limit `check-phone`** to prevent phone enumeration attacks (10 req/min per IP)
2. **Rate limit password login** to prevent brute force (5 attempts/5 min per phone)
3. **Hash passwords** with bcrypt (Laravel's default via `Hash::make()`)
4. **Never expose** `password` or `is_profile_complete` in public API responses — add to `$hidden`
5. **CSRF protection** — Sanctum SPA mode handles this automatically via `X-XSRF-TOKEN` header
6. **Session fixation** — call `$request->session()->regenerate()` after login
7. **Password requirements** — minimum 6 characters (keep it simple for a restaurant app, not a bank)
8. The **`check-phone` endpoint** intentionally reveals if a phone exists. This is acceptable for this use case (restaurant loyalty, not a sensitive app). If concerned, always return a generic response and let the password/OTP step determine existence.

---

## Testing Checklist

- [ ] New customer: phone → OTP → profile setup → password set → logged in on both Blade + React
- [ ] Returning customer: phone → password → logged in (no OTP, no SMS cost)
- [ ] Login on Blade site → navigate to /order/ → already logged in (no re-auth)
- [ ] Login on React app → navigate to Blade site → already logged in (no re-auth)
- [ ] Forgot password: phone → OTP → new password → can login with new password
- [ ] Change password: logged in → change password → old password stops working
- [ ] Logout: clears session + token → both Blade + React require re-auth
- [ ] Rate limiting works on all auth endpoints
- [ ] OTP still works in dev mode (hint shown)
- [ ] Existing customers without passwords can still log in via OTP (backward compat)
