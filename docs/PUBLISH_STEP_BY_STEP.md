# Publish Guide: Main Website + Online Order (Step by Step)

Follow these steps **in order** to publish the main Bake & Grill website and the online order app with data and images.

---

## Part A: On your computer (before uploading)

### Step 1: Build the online order app

Open a terminal in the project folder (Bake&Grill) and run:

```bash
./scripts/publish.sh
```

**What it does:** Builds the React order app and copies it into `backend/public/order/`.

**If the script fails:** Do it manually:

```bash
cd apps/online-order-web
npm install
npm run build
```

Then copy everything from `apps/online-order-web/dist/` into `backend/public/order/` (replace existing files).

---

### Step 2: Check that images are in place

Make sure this folder exists and has your menu images:

```
backend/public/images/cafe/
```

You should see files like: `Bajiya.png`, `Kavaabu.png`, `Sausage.png`, `Water.png`, etc.

**If images are missing:** Add your PNG/JPEG files into `backend/public/images/cafe/`.

---

### Step 3: Prepare the backend folder for upload

The folder you will upload to the server is:

```
backend/
```

It must contain (among other things):

- `app/`
- `config/`
- `database/`
- `public/`  ← includes `public/order/` (order app) and `public/images/cafe/` (images)
- `resources/`
- `routes/`
- `vendor/`  ← run `composer install` inside `backend/` if you don’t have it
- `.env.example` (you will create `.env` on the server from this)

**Optional on your computer:** In `backend/` run `composer install --no-dev` so you have `vendor/` ready to upload. Or install on the server (Step 7).

---

## Part B: On the server (hosting)

### Step 4: Upload the backend folder

Upload the entire **backend** folder to your hosting (e.g. cPanel File Manager, FTP, or Git).

- **cPanel:** Upload to a folder such as `bakeandgrill` or `public_html/bakeandgrill` (or use the path your host gives for “document root”).
- **Important:** Note where you uploaded it. Example: `/home/username/bakeandgrill/`

---

### Step 5: Set the document root

Your domain (e.g. `https://bakeandgrill.mv`) must point to the **public** folder inside backend.

- **Correct:** Document root = `backend/public` (so the URL loads `backend/public/index.php`).
- **Wrong:** Document root = `backend` (Laravel will not run correctly).

**cPanel:** In “Domains” or “Addon Domains”, set “Document Root” to:

```
/home/username/bakeandgrill/public
```

(Use your real path and folder name.)

---

### Step 6: Create the `.env` file on the server

1. In the **backend** folder on the server, copy `.env.example` to `.env`:
   - File Manager: copy `.env.example` and rename the copy to `.env`
   - Or SSH: `cp .env.example .env`

2. Edit `.env` and set at least:

```env
APP_NAME="Bake & Grill"
APP_ENV=production
APP_KEY=
APP_DEBUG=false
APP_URL=https://bakeandgrill.mv

DB_CONNECTION=mysql
DB_HOST=localhost
DB_PORT=3306
DB_DATABASE=your_database_name
DB_USERNAME=your_database_user
DB_PASSWORD=your_database_password
```

Replace:

- `https://bakeandgrill.mv` with your real domain.
- `your_database_name`, `your_database_user`, `your_database_password` with the MySQL database details from your hosting (cPanel → MySQL® Databases).

3. Generate the application key (run in the backend folder on the server):

```bash
php artisan key:generate
```

If you don’t have SSH, use cPanel “Terminal” or “Run PHP Script” if your host offers it; otherwise generate a key locally with `php artisan key:generate` and put the same value in `APP_KEY=` in `.env` on the server.

---

### Step 7: Install PHP dependencies on the server

In the **backend** folder on the server run:

```bash
composer install --no-dev --optimize-autoloader
```

**If you don’t have SSH:** Upload the `vendor/` folder from your computer (after running `composer install --no-dev` in `backend/` locally).

---

### Step 8: Create the database and run migrations

1. **Create MySQL database and user** (if not done):
   - cPanel → MySQL® Databases → create database (e.g. `bakeandgrill`) and user, add user to database with “All Privileges”.

2. **Run migrations** (in the backend folder on the server):

```bash
php artisan migrate --force
```

This creates all tables (users, items, categories, orders, etc.).

---

### Step 9: Load menu data and images

**Option A – Fresh install (no menu data yet):**

```bash
php artisan db:seed --class=ImportMenuSeeder
```

This imports categories and items from the CSV and links them to your cafe images.

**Option B – Database already has items, only fix/update images:**

```bash
php artisan menu:sync-item-images
```

This updates `image_url` for items that have local cafe photos.

---

### Step 10: Create storage link (if you use storage for files)

Run once:

```bash
php artisan storage:link
```

---

### Step 11: Clear and cache config (recommended)

Run:

```bash
php artisan config:cache
php artisan route:cache
php artisan view:clear
```

---

## Part C: Check that everything works

### Step 12: Test the main website

1. Open: **https://yourdomain.com/**
   - You should see the home page.
2. Open: **https://yourdomain.com/menu**
   - You should see the menu with item images (from `public/images/cafe/`).

---

### Step 13: Test the online order app

1. Open: **https://yourdomain.com/order/**
2. You should see the order app (menu, categories, cart).
3. Check that item images load (same domain, so they use `/images/cafe/...` or the API).

---

### Step 14: If something is wrong

- **Blank page or 500 error:** Check `backend/storage/logs/laravel.log` on the server. Set `APP_DEBUG=true` in `.env` only temporarily to see errors, then set back to `false`.
- **Images not loading:** Confirm `backend/public/images/cafe/` was uploaded and that the document root is `backend/public`.
- **Order app blank:** Confirm you ran `./scripts/publish.sh` and uploaded the **new** `backend/public/order/` (with `index.html` and `assets/`).
- **Menu empty:** Run Step 9 again (ImportMenuSeeder or menu:sync-item-images).

---

## Quick checklist

- [ ] Step 1: Run `./scripts/publish.sh` (build order app)
- [ ] Step 2: Check `backend/public/images/cafe/` has images
- [ ] Step 3: Backend folder ready (with `vendor/` or plan to run composer on server)
- [ ] Step 4: Upload `backend/` to server
- [ ] Step 5: Document root = `backend/public`
- [ ] Step 6: Create `.env` from `.env.example`, set `APP_URL` and `DB_*`, run `php artisan key:generate`
- [ ] Step 7: Run `composer install --no-dev` (or upload `vendor/`)
- [ ] Step 8: Run `php artisan migrate --force`
- [ ] Step 9: Run `php artisan db:seed --class=ImportMenuSeeder` (or `menu:sync-item-images`)
- [ ] Step 10: Run `php artisan storage:link`
- [ ] Step 11: Run `config:cache`, `route:cache`, `view:clear`
- [ ] Step 12: Test main site (home + menu)
- [ ] Step 13: Test order app at `/order/`

Done.
