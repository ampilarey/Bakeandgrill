# Bake & Grill - Café Operating System

Full café management system replacing Loyverse POS and Excel-based inventory.

## Features

- **POS PWA** - Offline-first point of sale (Staff)
- **KDS** - Kitchen Display System for order tracking
- **Online Ordering** - Customer-facing order placement with OTP login
- **Inventory Management** - Recipe-based stock tracking and purchasing
- **Table Management** - Dine-in table operations, merge, split bills
- **Reporting** - Sales, inventory, cash drawer, X/Z reports
- **E-Receipts** - Email/SMS receipts with feedback
- **SMS Integration** - Dhiraagu SMS for OTP and promotions
- **Print Proxy** - ESC/POS thermal printing via TCP/IP

## Technology Stack

- **Backend**: Laravel 12 + PHP 8.5
- **Database**: PostgreSQL 15+
- **Cache/Queue**: Redis 7+
- **Frontend**: React + TypeScript + Vite + Tailwind CSS
- **Print**: Node.js Express proxy for ESC/POS
- **Auth**: Laravel Sanctum (staff PIN + customer OTP)
- **Local Dev**: Docker Compose

## Quick Start (Development)

```bash
# 1. Clone and install
git clone <repo-url>
cd Bake\&Grill

# 2. Start Docker services
docker compose up -d

# 3. Backend setup
cd backend
cp .env.example .env
# Edit .env with your secrets (see Production Setup below)
composer install
php artisan key:generate
php artisan migrate --seed
cd ..

# 4. Frontend apps
cd apps/online-order-web && npm install && cd ../..
cd apps/pos-web && npm install && cd ../..
cd apps/kds-web && npm install && cd ../..

# 5. Start dev servers
cd apps/online-order-web && npm run dev &
cd apps/pos-web && npm run dev &
cd apps/kds-web && npm run dev &

# Access:
# - Main website: http://localhost:8000
# - Online ordering: http://localhost:3003
# - POS: http://localhost:3001
# - KDS: http://localhost:3002
```

## Production Setup

### CRITICAL: Secrets Management

**NEVER commit the following files:**
- `.env` (any .env file anywhere in the repo)
- `backend/.env`
- Any file containing API keys, passwords, or secrets

**Required Environment Variables:**

#### Backend (backend/.env)
```env
# Application
APP_NAME="Bake & Grill"
APP_ENV=production
APP_KEY=base64:GENERATE_WITH_php_artisan_key:generate
APP_DEBUG=false  # MUST be false in production
APP_URL=https://your-domain.com

# Database (PostgreSQL)
DB_CONNECTION=pgsql
DB_HOST=127.0.0.1
DB_PORT=5432
DB_DATABASE=your_database
DB_USERNAME=your_user
DB_PASSWORD=STRONG_PASSWORD_HERE

# Redis
REDIS_HOST=127.0.0.1
REDIS_PASSWORD=STRONG_PASSWORD_HERE
REDIS_PORT=6379

# Session & Cache
SESSION_DRIVER=database
QUEUE_CONNECTION=redis
CACHE_STORE=redis

# Mail
MAIL_MAILER=smtp
MAIL_HOST=your-smtp-host
MAIL_PORT=587
MAIL_USERNAME=your-username
MAIL_PASSWORD=your-password
MAIL_FROM_ADDRESS=hello@your-domain.com

# SMS (Dhiraagu)
DHIRAAGU_API_URL=https://messaging.dhiraagu.com.mv/v1/api/sms
DHIRAAGU_SMS_USERNAME=your_dhiraagu_username
DHIRAAGU_SMS_PASSWORD=your_dhiraagu_password

# Print Proxy
PRINT_PROXY_URL=http://localhost:3000
PRINT_PROXY_KEY=GENERATE_RANDOM_32_CHAR_STRING

# Frontend URLs (for CORS)
FRONTEND_URL=https://order.your-domain.com
```

#### Print Proxy (print-proxy/.env)
```env
PORT=3000
PRINT_PROXY_KEY=SAME_AS_BACKEND
PRINTERS_JSON=[{"name":"kitchen","host":"192.168.1.50","port":9100},{"name":"bar","host":"192.168.1.51","port":9100}]
```

#### Online Ordering (apps/online-order-web/.env.production)
```env
VITE_API_BASE_URL=/api
```

### Secret Rotation

**Rotate these secrets regularly:**
1. `APP_KEY` - Generate with `php artisan key:generate`
2. `DB_PASSWORD` - Change in DB and .env
3. `REDIS_PASSWORD` - Change in Redis config and .env
4. `PRINT_PROXY_KEY` - Generate new random string, update both backend and print-proxy
5. `DHIRAAGU_SMS_PASSWORD` - Request from Dhiraagu support

**Never:**
- Store secrets in version control
- Share .env files via email/Slack
- Log secrets in application logs
- Expose secrets in error messages

### Deployment Checklist

Before deploying to production:

- [ ] `APP_DEBUG=false` in backend/.env
- [ ] `APP_ENV=production` in backend/.env
- [ ] Strong unique passwords for DB, Redis
- [ ] SSL certificate installed and HTTPS enforced
- [ ] All .env files excluded from git (verify with `git status`)
- [ ] CORS configured for your actual frontend domain
- [ ] Print proxy bound to internal network only (not 0.0.0.0)
- [ ] SMS credentials validated and working
- [ ] Database backups automated (see docs/BACKUP_RESTORE.md)
- [ ] Queue workers running (`php artisan queue:work`)
- [ ] Cron for scheduled tasks configured
- [ ] Test OTP flow end-to-end
- [ ] Test order placement end-to-end
- [ ] Test printing end-to-end

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────┐
│  React PWAs     │────→│  Laravel API     │────→│ PostgreSQL  │
│  (POS/KDS/Web)  │     │  (Sanctum Auth)  │     └─────────────┘
└─────────────────┘     └──────────────────┘
        │                       │
        │                       ↓
        │               ┌──────────────────┐
        └──────────────→│  Print Proxy     │
                        │  (Node TCP 9100) │
                        └──────────────────┘
```

## Security Model

- **Staff**: PIN-based login → Sanctum token with 'staff' ability
- **Customers**: OTP (SMS) login → Sanctum token with 'customer' ability
- **Devices**: Registered POS devices with active status check
- **Orders**: Server-side pricing, no client-provided prices accepted
- **Printing**: Whitelisted printers only, API key required

## Support & Documentation

See `docs/` folder for:
- `SETUP.md` - Detailed setup instructions
- `IMPLEMENTATION_GUIDE.md` - Feature documentation
- `TESTING_PLAN.md` - Testing procedures
- `BACKUP_RESTORE.md` - Database backup procedures
- `CPANEL_DEPLOYMENT_GUIDE.md` - cPanel deployment steps

## License

Proprietary - Bake & Grill Café © 2026
