# Subdomain Setup + Redirect from Main Domain

Use a **subdomain** for the new site now. Redirect the **main domain** to the subdomain. Later, when the site is ready, move it to the main domain.

---

## Step 1: Create the subdomain (cPanel)

1. Log in to **cPanel**.
2. Go to **Domains** → **Subdomains** (or **Create a New Domain** / **Subdomain**).
3. Create a subdomain, for example:
   - **Subdomain:** `app` or `new` or `staging`
   - **Domain:** `bakeandgrill.mv` (your main domain)
   - **Resulting URL:** `app.bakeandgrill.mv` (or `new.bakeandgrill.mv`, etc.)
4. Set **Document Root** to the folder for this subdomain.  
   Example: `public_html/app` or `app.bakeandgrill.mv` (cPanel often creates something like `public_html/app` or a folder with the subdomain name).
5. Click **Create**.

**Note the folder path** cPanel gives you (e.g. `/home/username/public_html/app` or `/home/username/app.bakeandgrill.mv`). You will upload the zip there.

---

## Step 2: Upload and extract the backend zip

1. In **File Manager**, go to the **subdomain’s document root folder** (from Step 1).
2. **Upload** `backend-publish.zip` into that folder.
3. **Extract** the zip (right‑click → Extract or use “Extract” in File Manager).
4. After extraction you should see a folder named **`backend`** (with `app`, `config`, `database`, `public`, `vendor`, etc. inside).

---

## Step 3: Point the subdomain to Laravel’s public folder

The subdomain must serve the **contents** of `backend/public`, not the `backend` folder itself.

**Option A – Change document root (recommended)**  
1. In cPanel go to **Domains** → **Domains** (or **Subdomains**).
2. Find your subdomain (e.g. `app.bakeandgrill.mv`) and click **Manage** or the pencil icon.
3. Change **Document Root** to the **public** folder inside backend.  
   Examples (use the path cPanel shows for your account):
   - `public_html/app/backend/public`
   - Or: `app.bakeandgrill.mv/backend/public`  
   So the document root ends with **`/backend/public`**.
4. Save.

**Option B – Move contents (if you can’t change document root)**  
1. Inside the subdomain folder you have `backend/public/` (with `index.php`, `order/`, `images/`, etc.).
2. Move **everything inside** `backend/public/` up into the subdomain’s document root (so `index.php`, `order/`, `images/` are directly in the doc root).
3. Then in the **parent** of the doc root, move `backend/app`, `backend/config`, `backend/database`, etc. so they sit **next to** the doc root (same level as `public`).  
   This is trickier; Option A is simpler if your host allows changing the document root.

Use **Option A** if possible.

---

## Step 4: Redirect main domain to subdomain

So that **bakeandgrill.mv** and **www.bakeandgrill.mv** send visitors to **app.bakeandgrill.mv** (or whatever subdomain you used):

**In cPanel:**  
1. Go to **Domains** → **Redirects** (or **Redirects** in the main menu).
2. Create a redirect:
   - **Type:** Permanent (301)
   - **From:** `bakeandgrill.mv` (and optionally add another for `www.bakeandgrill.mv`)
   - **To:** `https://app.bakeandgrill.mv` (your subdomain URL)
3. Save.

**Or with .htaccess (if the main domain’s document root is different from the subdomain):**  
In the **main domain’s** document root (e.g. `public_html` for bakeandgrill.mv), create or edit `.htaccess`:

```apache
RewriteEngine On
RewriteCond %{HTTP_HOST} ^(www\.)?bakeandgrill\.mv$ [NC]
RewriteRule ^(.*)$ https://app.bakeandgrill.mv/$1 [R=301,L]
```

Replace `app.bakeandgrill.mv` with your subdomain if different.

---

## Step 5: Laravel setup on the subdomain

In the **backend** folder on the server (via SSH or cPanel Terminal):

1. Copy `.env.example` to `.env` and edit:
   - `APP_URL=https://app.bakeandgrill.mv` (your subdomain)
   - `DB_DATABASE`, `DB_USERNAME`, `DB_PASSWORD` (your database)
2. Run:
   ```bash
   php artisan key:generate
   php artisan migrate --force
   php artisan db:seed --class=ImportMenuSeeder
   php artisan storage:link
   php artisan config:cache
   php artisan route:cache
   ```

Now the **main domain** redirects to the **subdomain**, and the subdomain serves the new Laravel site (main site + order app).

---

## Later: Move to main domain

When you’re ready to serve the site on the main domain:

1. **Remove** the redirect (delete the cPanel redirect or the .htaccess redirect rules).
2. **Option A – Same server:**  
   - Move or copy the Laravel app (the same `backend` folder you use on the subdomain) to the main domain’s document root, with document root set to `.../backend/public`, **or**  
   - Change the main domain’s document root to point to the same `backend/public` folder the subdomain uses (if you want one copy of the app).
3. **Option B – New location:**  
   Upload/extract the backend zip under the main domain’s folder, set document root to `backend/public`, run the same Laravel commands (`.env`, `APP_URL=https://bakeandgrill.mv`, migrate, seed, etc.).
4. In Laravel `.env` set `APP_URL=https://bakeandgrill.mv` (no subdomain).
5. Clear config cache: `php artisan config:cache`.

---

## Quick checklist

- [ ] Create subdomain (e.g. `app.bakeandgrill.mv`).
- [ ] Upload `backend-publish.zip` to subdomain folder and extract.
- [ ] Set subdomain document root to `.../backend/public`.
- [ ] Create `.env`, set `APP_URL` and DB, run `key:generate`, `migrate`, `db:seed`, `storage:link`, `config:cache`, `route:cache`.
- [ ] Set 301 redirect from main domain to subdomain.
- [ ] Test: open main domain → should redirect to subdomain; subdomain shows new site.
