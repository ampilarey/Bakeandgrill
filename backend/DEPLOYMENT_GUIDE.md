# 🚀 Bake & Grill Laravel Opening Soon - Deployment Guide

## 📋 Overview

This Laravel project contains the "Opening Soon" page for bakeandgrill.mv. It's set up as a Laravel application so you can easily expand it later with the full POS system without needing additional setup.

## 📁 Project Structure

```
bakeandgrill-laravel/
├── app/
│   └── Http/Controllers/
│       └── OpeningSoonController.php    # Controller for opening soon page
├── public/
│   └── logo.svg                         # Logo file (accessible via URL)
├── resources/
│   └── views/
│       └── opening-soon.blade.php       # Main opening soon page template
├── routes/
│   └── web.php                          # Routes (main route points to opening soon)
└── .env                                 # Environment configuration
```

## 🎯 Current Setup

✅ **Laravel 12** with PHP 8.4+  
✅ **Opening Soon Page** integrated as main route  
✅ **Responsive Design** with countdown timer  
✅ **Logo Integration** via Laravel asset helper  
✅ **Ready for Expansion** - can add full POS system later  

## 🚀 Deployment to bakeandgrill.mv

### Method 1: cPanel Deployment

#### Step 1: Prepare Files
The entire Laravel project needs to be uploaded to your hosting.

#### Step 2: Upload via cPanel
1. **Zip the entire Laravel project**:
   ```bash
   cd /Users/vigani/Website
   zip -r bakeandgrill-laravel.zip bakeandgrill-laravel/
   ```

2. **Upload to cPanel**:
   - Login to your cPanel for bakeandgrill.mv
   - Go to **File Manager**
   - Upload `bakeandgrill-laravel.zip`
   - Extract it in your hosting root

#### Step 3: Configure Web Root
Set your domain's document root to:
```
/home/username/public_html/bakeandgrill-laravel/public/
```

#### Step 4: Environment Setup
1. **Copy environment file** in cPanel:
   ```bash
   cp .env.example .env
   ```

2. **Edit .env** with your settings:
   ```env
   APP_NAME="Bake & Grill"
   APP_ENV=production
   APP_KEY=base64:your_generated_key_here
   APP_DEBUG=false
   APP_URL=https://bakeandgrill.mv
   ```

3. **Generate application key**:
   ```bash
   php artisan key:generate
   ```

#### Step 5: Set Permissions
```bash
chmod -R 755 storage bootstrap/cache
chown -R username:username storage bootstrap/cache
```

### Method 2: Git Deployment

#### Step 1: Push to Git
```bash
cd /Users/vigani/Website/bakeandgrill-laravel
git init
git add .
git commit -m "Initial Laravel setup with opening soon page"
git remote add origin your-repository-url
git push -u origin main
```

#### Step 2: Deploy from Git
On your server:
```bash
git clone your-repository-url
cd bakeandgrill-laravel
composer install --optimize-autoloader --no-dev
cp .env.example .env
# Edit .env with production settings
php artisan key:generate
php artisan config:cache
php artisan route:cache
```

## ⚙️ Configuration

### Environment Variables (.env)
```env
APP_NAME="Bake & Grill"
APP_ENV=production
APP_KEY=base64:your_app_key
APP_DEBUG=false
APP_URL=https://bakeandgrill.mv

# Database (if needed later)
DB_CONNECTION=mysql
DB_HOST=localhost
DB_PORT=3306
DB_DATABASE=your_database
DB_USERNAME=your_username
DB_PASSWORD=your_password
```

### Laravel Routes (routes/web.php)
```php
<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\OpeningSoonController;

// Opening Soon Page - Main route
Route::get('/', [OpeningSoonController::class, 'index']);

// Future routes will be added here for the full POS system
```

## 🔧 Customization

### Update Opening Date
Edit the JavaScript in `resources/views/opening-soon.blade.php`:
```javascript
const openingDate = new Date('2025-03-01T00:00:00').getTime();
```

### Update Contact Information
Edit the contact section in `resources/views/opening-soon.blade.php`:
- Phone number
- Email address  
- Location

## 🎯 What You Get

When deployed, visitors to `https://bakeandgrill.mv` will see:

✅ **"Opening Soon"** heading  
✅ **Dhivehi text**: "އަސްލު ދިވެހި ރަހަ"  
✅ **Countdown timer** to opening date  
✅ **Custom logo** with baking theme  
✅ **Contact information**  
✅ **Mobile responsive** design  
✅ **Professional styling** with orange gradient  

## 🔮 Future Expansion

This Laravel setup makes it easy to add the full Bake & Grill POS system later:

1. **No additional setup needed** - Laravel is already configured
2. **Controllers ready** - Just add new controllers for POS features
3. **Database ready** - Run migrations when POS system is ready
4. **Routing ready** - Add new routes alongside the opening soon page
5. **Asset management** - Use Laravel's asset helpers for all resources

## 🚨 Troubleshooting

### Page shows Laravel error
- Check that document root points to `/public/` folder
- Ensure `.env` file exists and has correct settings
- Verify file permissions (755 for directories, 644 for files)

### Logo doesn't display
- Check that `logo.svg` exists in `public/` folder
- Verify asset helper is working: `{{ asset('logo.svg') }}`

### Countdown not working
- Check JavaScript console for errors
- Verify date format in opening date JavaScript

## Post-deploy configuration check

After `migrate`, `config:cache`, and before marking a production deploy complete:

```bash
cd backend
php artisan app:verify-production-config
```

Exits non-zero when `APP_DEBUG=true`, `TRUSTED_PROXIES` is unset or `*`, Sentry/backup/Redis settings are missing in production. See `docs/GO_LIVE_OPS.md` for the full required env table. CI runs this automatically on test and production SSH deploys.

## ✅ Pre-Deployment Checklist

- [ ] Laravel project structure intact
- [ ] `logo.svg` in `public/` folder  
- [ ] `.env` configured for production
- [ ] Application key generated
- [ ] File permissions set correctly
- [ ] Document root points to `public/` folder
- [ ] SSL certificate active
- [ ] Test opening soon page loads correctly

---

**Deployment Complete!** 🎉

Your Laravel-based "Opening Soon" page is ready for bakeandgrill.mv and prepared for future expansion with the full POS system.
