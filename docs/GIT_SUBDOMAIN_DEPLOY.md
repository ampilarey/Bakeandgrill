# Connect Git to a New Subdomain and Re-Deploy

This guide explains how to point a **new subdomain** (e.g. `app.bakeandgrill.mv`) at a folder that uses **Git**, and how to **re-deploy** by pulling from the repo.

---

## Quick steps for test.bakeandgrill.mv

You created **test.bakeandgrill.mv**. Do this next:

1. **Note the folder** cPanel gave that subdomain (e.g. `public_html/test` or `test.bakeandgrill.mv`). Full path is usually:
   - `/home/YOUR_CPANEL_USER/public_html/test`  
   or  
   - `/home/YOUR_CPANEL_USER/test.bakeandgrill.mv`  
   Replace `YOUR_CPANEL_USER` with your cPanel username.

2. **SSH or cPanel Terminal** – go to that folder and clone (use your real path):
   ```bash
   cd /home/YOUR_CPANEL_USER/public_html/test
   # If the folder has files, empty it first or use a subfolder – then:
   git clone https://github.com/ampilarey/Bakeandgrill.git .
   git checkout main
   ```

3. **Set document root** in cPanel for **test.bakeandgrill.mv** to:
   ```text
   /home/YOUR_CPANEL_USER/public_html/test/backend/public
   ```
   (Domains → find test.bakeandgrill.mv → Manage → Document Root.)

4. **First-time setup** (in SSH/Terminal):
   ```bash
   cd /home/YOUR_CPANEL_USER/public_html/test/backend
   cp .env.example .env
   php artisan key:generate
   composer install --no-dev --optimize-autoloader
   php artisan migrate --force
   php artisan storage:link
   php artisan config:cache
   php artisan route:cache
   ```
   Edit `.env` (APP_URL=https://test.bakeandgrill.mv, DB_*, etc.) before or after the above.

5. **Re-deploy** later:
   ```bash
   cd /home/YOUR_CPANEL_USER/public_html/test
   git pull origin main
   cd backend
   composer install --no-dev --optimize-autoloader
   php artisan migrate --force
   php artisan config:cache
   php artisan route:cache
   php artisan view:clear
   ```

If your subdomain folder has a different name (e.g. `test.bakeandgrill.mv`), use that path instead of `public_html/test` in the commands above.

---

## Part 1: Create the subdomain and its folder (cPanel)

1. Log in to **cPanel**.
2. Go to **Domains** → **Subdomains** (or **Create a New Domain** / **Subdomain**).
3. Create the subdomain:
   - **Subdomain:** e.g. `app` or `order` or `new`
   - **Domain:** your main domain (e.g. `bakeandgrill.mv`)
   - **Document root:** note the path cPanel creates (e.g. `public_html/app` or `app.bakeandgrill.mv`).
4. Click **Create**.

**Write down the full path** to the subdomain’s document root, e.g.:
- `/home/yourusername/public_html/app`  
or  
- `/home/yourusername/app.bakeandgrill.mv`

You will clone the Git repo **into** this folder (or into a subfolder and then point the document root correctly).

---

## Part 2: Connect Git to the subdomain folder

You have two options: **clone into the subdomain root** or **clone into a subfolder**. Below is the usual way (clone so the repo root is inside the subdomain folder).

### Option A: Clone the repo into the subdomain folder (recommended)

1. In cPanel, open **Terminal** (or use **SSH**).
2. Go to the **parent** of the subdomain folder. Example:
   ```bash
   cd /home/yourusername/public_html
   ```
3. If the subdomain folder already exists and is **empty**, use it; otherwise create a folder for the repo:
   ```bash
   # If cPanel created "app" for app.bakeandgrill.mv:
   cd app
   # Or create and enter a folder:
   # mkdir -p app && cd app
   ```
4. Clone the repository (use your real repo URL and branch):
   ```bash
   git clone https://github.com/ampilarey/Bakeandgrill.git .
   ```
   The `.` at the end clones into the **current folder** (so you get `app/backend`, `app/apps`, etc., not `app/Bakeandgrill/...`).

   **If you use SSH:**
   ```bash
   git clone git@github.com:ampilarey/Bakeandgrill.git .
   ```
5. Check the branch:
   ```bash
   git branch
   git checkout main
   ```

**Result:** Your subdomain folder (e.g. `public_html/app`) now contains the full repo: `backend/`, `apps/`, `scripts/`, etc.

### Option B: Clone into a subfolder

If you prefer the repo in a subfolder (e.g. `public_html/app/repo`):

```bash
cd /home/yourusername/public_html/app
git clone https://github.com/ampilarey/Bakeandgrill.git repo
cd repo
git checkout main
```

Then the Laravel app is at `repo/backend/`. You would set the **document root** to `.../app/repo/backend/public` (see Part 3).

---

## Part 3: Set the document root to Laravel’s `public` folder

The subdomain must serve Laravel’s **public** directory, not the repo root.

1. In cPanel go to **Domains** → **Domains** or **Subdomains**.
2. Find your subdomain (e.g. `app.bakeandgrill.mv`) → **Manage** / edit.
3. Set **Document Root** to the `backend/public` path inside your clone:

   **If you used Option A** (repo root = subdomain folder):
   ```text
   /home/yourusername/public_html/app/backend/public
   ```
   **If you used Option B** (repo in `repo/`):
   ```text
   /home/yourusername/public_html/app/repo/backend/public
   ```

4. Save.

---

## Part 4: First-time setup on the server (after clone)

Run these **once** from the **backend** directory on the server (SSH or cPanel Terminal).

```bash
# Go to backend (adjust path if you used Option B)
cd /home/yourusername/public_html/app/backend
# Or: cd /home/yourusername/public_html/app/repo/backend

# Create .env from example
cp .env.example .env
# Edit .env with your production values (APP_KEY, DB_*, APP_URL, etc.)
# nano .env   or use cPanel File Manager

# Generate app key
php artisan key:generate

# Install PHP dependencies
composer install --no-dev --optimize-autoloader

# Run migrations
php artisan migrate --force

# (Optional) Seed roles and demo users
php artisan db:seed --force

# Storage link (for uploads)
php artisan storage:link

# Build and put the online order app into public/order (see Part 5)
# Then cache config and routes
php artisan config:cache
php artisan route:cache
php artisan view:clear
```

**Permissions:**

```bash
chmod -R 755 storage bootstrap/cache
# If your web server user is different, you may need:
# chown -R username:username storage bootstrap/cache
```

---

## Part 5: Build the online order app (first time and on deploy)

The order app (React) must be **built** and its output placed in `backend/public/order/`.

**On the server** (if Node.js is available):

```bash
cd /home/yourusername/public_html/app/apps/online-order-web
npm ci
npm run build
# Copy build into Laravel public
cp -R dist/* ../../backend/public/order/
```

**Or from your computer** (then deploy):

On your **local** machine, in the repo root:

```bash
./scripts/publish.sh
```

Then either:
- Commit the updated `backend/public/order/` and pull on the server, or  
- Upload only `backend/public/order/` (FTP/rsync) after each build.

Many setups do the build **locally** and commit `public/order/` so the server only needs `git pull` (see Part 6).

---

## Part 6: Re-deploy using Git (every time you update)

After the first-time setup, re-deploy by pulling and refreshing Laravel.

### On the server (SSH or cPanel Terminal)

1. Go to the **repo root** (subdomain folder where you cloned).
   ```bash
   cd /home/yourusername/public_html/app
   # Or: cd /home/yourusername/public_html/app/repo
   ```

2. Pull latest code.
   ```bash
   git pull origin main
   ```

3. Go to backend and update PHP dependencies (if composer.json changed).
   ```bash
   cd backend
   composer install --no-dev --optimize-autoloader
   ```

4. Run new migrations (if any).
   ```bash
   php artisan migrate --force
   ```

5. If the **order app** was rebuilt and committed in `backend/public/order/`, nothing else is needed for it.  
   If you build on the server instead, run again:
   ```bash
   cd ../apps/online-order-web
   npm ci
   npm run build
   cp -R dist/* ../../backend/public/order/
   cd ../../backend
   ```

6. Clear and cache.
   ```bash
   php artisan config:cache
   php artisan route:cache
   php artisan view:clear
   ```

### One-line deploy script (optional)

You can put the steps above in a script on the server, e.g. `~/deploy.sh`:

```bash
#!/usr/bin/env bash
set -e
REPO_ROOT="/home/yourusername/public_html/app"
cd "$REPO_ROOT"
git pull origin main
cd backend
composer install --no-dev --optimize-autoloader
php artisan migrate --force
php artisan config:cache
php artisan route:cache
php artisan view:clear
echo "Deploy done."
```

Make it executable: `chmod +x ~/deploy.sh`.  
Then to re-deploy: `~/deploy.sh` (or run it from cPanel **Cron** or after a GitHub webhook).

---

## Part 7: cPanel “Git Version Control” (alternative)

If your host has **cPanel Git Version Control**:

1. In cPanel → **Git Version Control** → **Create**.
2. **Repository path:** e.g. `public_html/app` (the subdomain folder).
3. **Repository URL:** `https://github.com/ampilarey/Bakeandgrill.git` (or your SSH URL).
4. Create, then use **Pull or Deploy** and deploy the **main** branch.

After that, you still must:

- Set the **document root** to `.../app/backend/public` (see Part 3).
- Do **first-time setup** (Part 4) and **order app build** (Part 5) once.
- For **re-deploy**, use “Pull or Deploy” in cPanel, then run the same backend commands (composer, migrate, cache) via SSH or a deploy script.

---

## Checklist summary

| Step | Action |
|------|--------|
| 1 | Create subdomain in cPanel; note document root path. |
| 2 | Clone repo into that folder (or subfolder). |
| 3 | Set subdomain document root to `.../backend/public`. |
| 4 | First time: `.env`, `composer install`, `migrate`, `storage:link`, build order app, cache. |
| 5 | Re-deploy: `git pull`, `composer install`, `migrate`, cache (and rebuild order app if you build on server). |

Use this flow to **connect Git to your new subdomain folder** and **re-deploy using Git** whenever you push changes.
