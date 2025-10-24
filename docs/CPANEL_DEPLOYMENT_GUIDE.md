# cPanel Deployment Guide for Bake & Grill POS

## Overview

This guide walks you through deploying the Bake & Grill POS system to your cPanel hosting.

**Domain**: bakeandgrill.mv  
**Hosting**: cPanel-based shared/VPS hosting  
**Access**: cPanel dashboard + (optional) SSH

---

## Prerequisites Checklist

### Hosting Requirements

**Minimum Specifications**:
- ✅ PHP 8.2 or higher
- ✅ MySQL 8.0 or higher (or MariaDB 10.6+)
- ✅ 2GB RAM minimum (4GB recommended)
- ✅ 20GB storage minimum
- ✅ SSL certificate (Let's Encrypt via cPanel)
- ⚠️ Node.js 18+ (for print proxy - optional)
- ⚠️ SSH access (highly recommended)

**Check Your cPanel**:
1. Login to cPanel
2. Go to **"Select PHP Version"** → should show PHP 8.2+
3. Go to **"MySQL® Databases"** → note version
4. Check available disk space

---

## Step-by-Step Deployment

### Phase 1: Domain & SSL Setup

#### 1.1 Point Domain to Hosting

**If domain and hosting are separate**:

In your domain registrar (e.g., Dhiraagu Domain Services):
1. Go to DNS settings
2. Add/update A record:
   ```
   Type: A
   Name: @
   Value: [Your cPanel server IP]
   TTL: 3600
   ```
3. Add www subdomain:
   ```
   Type: A
   Name: www
   Value: [Your cPanel server IP]
   TTL: 3600
   ```

**Wait 1-24 hours for DNS propagation**

---

#### 1.2 Install SSL Certificate

**Option A: Let's Encrypt (Free - Recommended)**

1. cPanel → **"SSL/TLS Status"**
2. Find your domain
3. Click **"Run AutoSSL"**
4. Wait 2-5 minutes
5. Verify: https://bakeandgrill.mv should show 🔒

**Option B: Manual SSL**

If AutoSSL fails:
1. cPanel → **"SSL/TLS"**
2. Click **"Manage SSL sites"**
3. Upload certificate files (if you have them)

---

### Phase 2: Database Setup

#### 2.1 Create MySQL Database

1. cPanel → **"MySQL® Database Wizard"**
2. **Step 1**: Create database
   ```
   Database Name: bakeandgrill_pos
   ```
3. **Step 2**: Create user
   ```
   Username: bakeandgrill_user
   Password: [Generate strong password - save it!]
   ```
4. **Step 3**: Add user to database
   - Check: **"ALL PRIVILEGES"**
5. Click **"Next Step"**

**Save these credentials**:
```
DB_HOST=localhost
DB_DATABASE=yourusername_bakeandgrill_pos
DB_USERNAME=yourusername_bakeandgrill_user
DB_PASSWORD=[password you generated]
```

Note: cPanel adds your username prefix automatically

---

#### 2.2 Import Database Schema

**Option A: Via phpMyAdmin**

1. cPanel → **"phpMyAdmin"**
2. Select your database (`yourusername_bakeandgrill_pos`)
3. Click **"Import"** tab
4. Choose file: Upload your SQL dump
5. Click **"Go"**

**Option B: Via Command Line (if SSH available)**

```bash
mysql -u yourusername_bakeandgrill_user -p yourusername_bakeandgrill_pos < database.sql
```

---

### Phase 3: Laravel Backend Deployment

#### 3.1 Upload Laravel Files

**Option A: Via File Manager**

1. cPanel → **"File Manager"**
2. Navigate to **"public_html"** (or your domain's document root)
3. Create folder structure:
   ```
   public_html/
   ├── api/          (Laravel application - upload here)
   └── public/       (Will be the web root)
   ```
4. Upload Laravel files:
   - Compress your `api` folder locally as `api.zip`
   - Upload to cPanel
   - Right-click → **"Extract"**

**Option B: Via FTP**

1. Use FileZilla or any FTP client
2. Connect with cPanel FTP credentials
3. Upload entire `api` folder to `public_html/`

**Option C: Via Git (Best - if SSH available)**

```bash
cd public_html
git clone https://github.com/ampilarey/Bakeandgrill.git .
cd api
composer install --optimize-autoloader --no-dev
```

---

#### 3.2 Configure Laravel Environment

1. cPanel → **"File Manager"**
2. Navigate to `public_html/api/`
3. Find `.env.example`
4. Copy it and rename to `.env`
5. Edit `.env` with your settings:

```env
APP_NAME="Bake & Grill POS"
APP_ENV=production
APP_KEY=
APP_DEBUG=false
APP_URL=https://bakeandgrill.mv

LOG_CHANNEL=stack
LOG_LEVEL=error

DB_CONNECTION=mysql
DB_HOST=localhost
DB_PORT=3306
DB_DATABASE=yourusername_bakeandgrill_pos
DB_USERNAME=yourusername_bakeandgrill_user
DB_PASSWORD=your_database_password

BROADCAST_DRIVER=log
CACHE_DRIVER=file
FILESYSTEM_DISK=local
QUEUE_CONNECTION=database
SESSION_DRIVER=file
SESSION_LIFETIME=120

# BML Payment Gateway
BML_MERCHANT_ID=your_merchant_id
BML_API_KEY=your_api_key
BML_API_SECRET=your_api_secret
BML_MODE=production

# SMS Provider (Update with your actual provider)
SMS_DRIVER=log
SMS_FROM=BakeAndGrill

# Sanctum
SANCTUM_STATEFUL_DOMAINS=bakeandgrill.mv,www.bakeandgrill.mv
SESSION_DOMAIN=.bakeandgrill.mv
```

---

#### 3.3 Generate Application Key

**Via SSH** (if available):
```bash
cd public_html/api
php artisan key:generate
```

**Via cPanel Terminal** (if available):
1. cPanel → **"Terminal"**
2. Run same commands above

**Manually** (if no SSH):
1. Go to https://generate-random.org/laravel-key-generator
2. Generate key
3. Copy the key
4. Edit `.env` file
5. Set: `APP_KEY=base64:YourGeneratedKeyHere`

---

#### 3.4 Set File Permissions

**Via SSH**:
```bash
cd public_html/api
chmod -R 755 storage bootstrap/cache
chown -R username:username storage bootstrap/cache
```

**Via cPanel File Manager**:
1. Right-click `storage` folder → **"Change Permissions"**
2. Set to `755` (rwxr-xr-x)
3. Check: **"Recurse into subdirectories"**
4. Repeat for `bootstrap/cache`

---

#### 3.5 Run Migrations

**Via SSH**:
```bash
cd public_html/api
php artisan migrate --force
php artisan db:seed --force
```

**Via cPanel PHP Selector** (if SSH not available):
1. Create file: `public_html/migrate.php`
2. Add this code:
```php
<?php
require __DIR__ . '/api/vendor/autoload.php';
$app = require_once __DIR__ . '/api/bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->call('migrate', ['--force' => true]);
$kernel->call('db:seed', ['--force' => true]);
echo "Migrations complete!";
```
3. Visit: https://yourdomain.com/migrate.php
4. Delete the file after running!

---

#### 3.6 Setup Document Root

**Change web root to Laravel's public folder**:

1. cPanel → **"Domains"** → Select your domain
2. Click **"Manage"**
3. Change **"Document Root"** from:
   ```
   /home/username/public_html
   ```
   To:
   ```
   /home/username/public_html/api/public
   ```
4. Save changes

**OR create .htaccess redirect** (if can't change root):

Create file: `public_html/.htaccess`
```apache
<IfModule mod_rewrite.c>
    RewriteEngine On
    RewriteRule ^(.*)$ api/public/$1 [L]
</IfModule>
```

---

#### 3.7 Configure PHP Settings

1. cPanel → **"Select PHP Version"**
2. Click **"Switch to PHP Options"**
3. Set these values:

```ini
max_execution_time = 300
max_input_time = 300
max_input_vars = 3000
memory_limit = 256M
post_max_size = 100M
upload_max_filesize = 100M
```

4. Click **"Save"**

---

### Phase 4: React Frontend Deployment

#### 4.1 Build React App Locally

On your development machine:

```bash
cd web
npm install
npm run build
```

This creates a `dist/` folder with static files.

---

#### 4.2 Upload Frontend Files

**Option A: Via cPanel File Manager**

1. Compress `web/dist` folder → `frontend.zip`
2. cPanel → **"File Manager"**
3. Navigate to `public_html/api/public/`
4. Create folder: `app` (or keep files in root)
5. Upload and extract `frontend.zip`

**Option B: Via FTP**

1. Upload entire `dist` folder contents to:
   ```
   public_html/api/public/
   ```

**Final structure**:
```
public_html/api/public/
├── index.html          (React app entry)
├── assets/
│   ├── index-abc123.js
│   └── index-def456.css
└── ...                 (other static files)
```

---

### Phase 5: Queue Worker Setup

Laravel queues need a worker running continuously.

**Option A: Via Cron Jobs** (Recommended for cPanel)

1. cPanel → **"Cron Jobs"**
2. Add new cron job:
   ```
   * * * * * cd /home/username/public_html/api && php artisan schedule:run >> /dev/null 2>&1
   ```
3. This runs every minute

4. Update `.env`:
   ```env
   QUEUE_CONNECTION=database
   ```

5. In your Laravel app, process queue in schedule:
   ```php
   // app/Console/Kernel.php
   protected function schedule(Schedule $schedule)
   {
       $schedule->command('queue:work --stop-when-empty')
                ->everyMinute();
   }
   ```

**Option B: Via Supervisor** (if VPS with root access)

Better for production, but requires root access.

---

### Phase 6: Print Proxy Setup (Optional)

**If you need the RAW9100 print proxy**:

#### 6.1 Check Node.js Availability

1. cPanel → **"Setup Node.js App"** (if available)
2. OR check via SSH: `node --version`

#### 6.2 Deploy Print Proxy

**If Node.js available**:

```bash
cd public_html
mkdir print-proxy
cd print-proxy
git clone [your-repo] .
npm install --production
npm run build
```

**If Node.js NOT available**:

- Use ePOS driver only (Epson direct connection)
- OR run print proxy on separate server/computer on LAN

---

### Phase 7: Testing & Verification

#### 7.1 Test Backend API

Visit: `https://bakeandgrill.mv/api/health`

Expected response:
```json
{
  "status": "ok",
  "timestamp": "2025-10-17T..."
}
```

#### 7.2 Test Frontend

Visit: `https://bakeandgrill.mv`

Should see login page.

#### 7.3 Test Database Connection

Via SSH:
```bash
cd public_html/api
php artisan tinker
>>> DB::connection()->getPdo();
```

Should return PDO object without errors.

#### 7.4 Test Login

1. Go to: `https://bakeandgrill.mv`
2. Try demo credentials:
   - Email: `owner@bakeandgrill.mv`
   - Password: `password123`

---

### Phase 8: Security Hardening

#### 8.1 Disable Directory Listing

Create/update `public_html/api/public/.htaccess`:

```apache
Options -Indexes

<IfModule mod_rewrite.c>
    RewriteEngine On
    RewriteCond %{REQUEST_FILENAME} !-f
    RewriteCond %{REQUEST_FILENAME} !-d
    RewriteRule ^ index.php [L]
</IfModule>
```

#### 8.2 Protect Sensitive Files

Add to `.htaccess`:

```apache
# Deny access to .env
<Files .env>
    Order allow,deny
    Deny from all
</Files>

# Deny access to storage
RedirectMatch 403 ^/storage/
```

#### 8.3 Enable HTTPS Redirect

Add to top of `.htaccess`:

```apache
# Force HTTPS
RewriteEngine On
RewriteCond %{HTTPS} off
RewriteRule ^(.*)$ https://%{HTTP_HOST}%{REQUEST_URI} [L,R=301]
```

#### 8.4 Set Security Headers

Add to `.htaccess`:

```apache
# Security Headers
Header set X-Content-Type-Options "nosniff"
Header set X-Frame-Options "SAMEORIGIN"
Header set X-XSS-Protection "1; mode=block"
Header set Referrer-Policy "strict-origin-when-cross-origin"
```

---

### Phase 9: Backup Configuration

#### 9.1 Enable cPanel Backups

1. cPanel → **"Backup"**
2. Click **"Generate/Download a Full Website Backup"**
3. Set to download to **"Home Directory"**
4. Schedule weekly backups

#### 9.2 Setup Automated Backups

**Database Backup Cron**:

1. Create script: `/home/username/backup-db.sh`
```bash
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
mysqldump -u yourusername_bakeandgrill_user -p'yourpassword' \
  yourusername_bakeandgrill_pos > \
  /home/username/backups/db_backup_$DATE.sql

# Keep only last 7 days
find /home/username/backups -name "db_backup_*.sql" -mtime +7 -delete
```

2. Make executable:
```bash
chmod +x /home/username/backup-db.sh
```

3. Add cron job (daily at 2 AM):
```
0 2 * * * /home/username/backup-db.sh >> /home/username/backup.log 2>&1
```

---

### Phase 10: Monitoring Setup

#### 10.1 Setup Error Logging

1. Create log directory:
```bash
mkdir -p /home/username/logs
```

2. Update `.env`:
```env
LOG_CHANNEL=daily
LOG_LEVEL=error
```

3. Laravel will create daily log files in `storage/logs/`

#### 10.2 Monitor Disk Space

Add to cron:
```
0 0 * * * df -h | mail -s "Disk Space Report" youremail@example.com
```

#### 10.3 Setup Uptime Monitoring

Use free service:
- **UptimeRobot**: https://uptimerobot.com
- Monitor: `https://bakeandgrill.mv/api/health`
- Alert via email/SMS if down

---

## Common cPanel Issues & Solutions

### Issue 1: 500 Internal Server Error

**Cause**: File permissions or .htaccess issue

**Solution**:
```bash
chmod -R 755 storage bootstrap/cache
```

Check `.htaccess` syntax

---

### Issue 2: Database Connection Failed

**Cause**: Wrong credentials or database not created

**Solution**:
1. Verify database exists in cPanel
2. Check `.env` credentials match cPanel
3. Test connection: `php artisan tinker`

---

### Issue 3: Composer Not Found

**Cause**: Composer not installed on shared hosting

**Solution**:
1. Install locally, upload vendor folder
2. OR use cPanel Terminal:
```bash
php -r "copy('https://getcomposer.org/installer', 'composer-setup.php');"
php composer-setup.php --install-dir=/home/username/bin --filename=composer
export PATH=$PATH:/home/username/bin
```

---

### Issue 4: Node.js Not Available

**Cause**: Shared hosting may not support Node

**Solution**:
- Use ePOS driver only (no Node proxy needed)
- OR contact hosting support to enable Node.js
- OR upgrade to VPS

---

### Issue 5: Queue Jobs Not Running

**Cause**: No background worker

**Solution**:
- Use cron-based queue (see Phase 5)
- OR use sync driver for testing:
```env
QUEUE_CONNECTION=sync
```

---

## Production Checklist

Before going live:

- [ ] Domain pointed to hosting (DNS propagated)
- [ ] SSL certificate installed and active
- [ ] Database created and migrated
- [ ] `.env` configured correctly
- [ ] File permissions set (755)
- [ ] Composer dependencies installed
- [ ] React app built and uploaded
- [ ] Queue worker running (cron)
- [ ] Backups automated
- [ ] HTTPS redirect enabled
- [ ] Security headers set
- [ ] Error logging enabled
- [ ] Uptime monitoring active
- [ ] Test login works
- [ ] Test creating order
- [ ] Test payment flow
- [ ] Test SMS sending
- [ ] Test printer connection

---

## Ongoing Maintenance

### Daily
- Check error logs
- Monitor disk space
- Verify backups completed

### Weekly
- Review sales reports
- Check queue job status
- Update dependencies (if needed)

### Monthly
- Full security audit
- Performance review
- Update SSL certificate (auto-renews)

---

## Getting Help

### cPanel Support
- **Your Hosting Provider**: Contact via their support
- **cPanel Documentation**: https://docs.cpanel.net

### Application Support
- **Developer**: [Your contact]
- **GitHub Issues**: https://github.com/ampilarey/Bakeandgrill/issues

### Emergency Contacts
- **Hosting Emergency**: [Provider phone]
- **Domain Registrar**: [Registrar phone]
- **BML Payment Support**: +960 333-0200

---

## Next Steps After Deployment

1. **Change Default Passwords**
   - Update all demo user passwords
   - Change database password
   - Update `.env` with new credentials

2. **Configure Business Settings**
   - Upload logo
   - Set business info
   - Configure tax rates
   - Setup printers
   - Add menu items

3. **Train Staff**
   - Schedule training session
   - Provide user guides
   - Create quick reference cards

4. **Monitor First Week**
   - Watch error logs daily
   - Check performance
   - Gather staff feedback
   - Make quick adjustments

---

**Deployment Complete!** 🎉

Your Bake & Grill POS is now live at: `https://bakeandgrill.mv`

---

**Last Updated**: October 17, 2025  
**Version**: 1.0  
**Deployment Type**: cPanel Shared/VPS Hosting

