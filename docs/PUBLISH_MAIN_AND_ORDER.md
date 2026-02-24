# Publishing the Main Website and Online Order (Laravel + data + images)

This guide covers publishing **both** the main Bake & Grill website (Blade) and the **online order app** from the Laravel backend, with menu data and cafe images.

---

## What gets published

| Part | Where it lives | URL (example) |
|------|----------------|---------------|
| **Main website** | Laravel Blade views, routes, `public/` | `https://yoursite.com/` (home, menu, contact, etc.) |
| **Online order app** | Built React app in `backend/public/order/` | `https://yoursite.com/order/` |
| **Data** | MySQL/MariaDB via Laravel migrations + seeders | API at `https://yoursite.com/api/` |
| **Images** | `backend/public/images/cafe/` | Served at `https://yoursite.com/images/cafe/...` |

The order app is built **once** and copied into Laravel’s `public/order/`. It uses the **same origin** for the API (`/api`), so no `VITE_API_BASE_URL` is needed when both site and API are on the same domain.

---

## 1. Build and copy the order app (local)

From the **repo root**:

```bash
./scripts/publish.sh
```

This will:

1. Build `apps/online-order-web` for production (API base = `/api`).
2. Copy the build output into `backend/public/order/`.

If you don’t use the script, do it manually:

```bash
cd apps/online-order-web
npm ci
npm run build
# Copy dist/* to backend/public/order/
rm -rf ../../backend/public/order/*
cp -R dist/. ../../backend/public/order/
```

---

## 2. Deploy the Laravel backend

Upload (or deploy) the **entire `backend/`** folder to your server, including:

- `app/`, `config/`, `database/`, `public/`, `resources/`, `routes/`, etc.
- `public/images/cafe/` (all menu images)
- `public/order/` (the built order app from step 1)

Ensure the **document root** of your domain points to `backend/public/` (or your host’s equivalent, e.g. `public_html` with contents of `public/`).

---

## 3. Environment and data on the server

1. **Create `.env`** (copy from `.env.example`) and set at least:
   - `APP_URL=https://yoursite.com`
   - `DB_*` (database credentials)
   - Any other keys (e.g. SMS, mail) you need.

2. **Install PHP dependencies**
   ```bash
   cd /path/to/backend
   composer install --no-dev --optimize-autoloader
   ```

3. **Run migrations**
   ```bash
   php artisan migrate --force
   ```

4. **Load menu data and images**
   - **Fresh install:** run the full menu seeder (creates categories + items from CSV, assigns local images):
     ```bash
     php artisan db:seed --class=ImportMenuSeeder
     ```
   - **Existing DB (only update item images):** run the sync command:
     ```bash
     php artisan menu:sync-item-images
     ```

5. **Storage link** (if you use storage for thumbs or other files):
   ```bash
   php artisan storage:link
   ```

6. **Caches (optional but recommended)**
   ```bash
   php artisan config:cache
   php artisan route:cache
   php artisan view:clear
   ```

---

## 4. Verify

- **Main site:** open `https://yoursite.com/` and `https://yoursite.com/menu` — menu and cafe images should load.
- **Online order:** open `https://yoursite.com/order/` — the app should load and use `/api` for menu and orders.
- **Images:** items with local cafe photos should show images from `https://yoursite.com/images/cafe/...`.

---

## 5. Re-publishing after changes

- **Only order app (React) changed:** run `./scripts/publish.sh` again, then re-upload `backend/public/order/` (or redeploy backend).
- **Only Laravel/Blade/backend changed:** re-upload the backend (or redeploy); no need to rebuild the order app unless you changed it.
- **New menu images:** add files under `backend/public/images/cafe/`, update `ImportMenuSeeder::LOCAL_ITEM_IMAGES` if needed, run `php artisan menu:sync-item-images`, then redeploy.

---

## Optional: Custom API URL for the order app

If the order app is served from a **different domain** than the API, set the API base at **build time**:

```bash
cd apps/online-order-web
VITE_API_BASE_URL=https://api.yoursite.com/api npm run build
```

Then copy `dist/` to `backend/public/order/` as above (or deploy that build to the other domain).
