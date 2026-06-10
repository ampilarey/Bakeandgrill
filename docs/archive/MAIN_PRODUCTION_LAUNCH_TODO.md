# Main Production Launch — TODO
**Target:** https://bakeandgrill.mv (separate production server)  
**Current state:** All development done on UAT (test.bakeandgrill.mv). Production server not yet provisioned.  
**Prerequisite:** Complete UAT sign-off first. This checklist is for the later production go-live.

---

## A. Server Provisioning (Infrastructure — Owner Task)

- [ ] Provision a VPS or cPanel account on `sg-s2` (or equivalent) for `bakeandgrill.mv`
- [ ] Install PHP 8.2+, Composer, Node 20, MySQL/PostgreSQL, Redis, Nginx
- [ ] Create database: `bakegrill_prod` with strong password
- [ ] Set up Redis with authentication (`requirepass <strong_password>`)
- [ ] Set up SSL certificate for `bakeandgrill.mv` and `*.bakeandgrill.mv`
- [ ] Set up SSH key access for deployment
- [ ] Add `DEPLOY_HOST_PROD`, `DEPLOY_USER_PROD`, `DEPLOY_SSH_KEY_PROD` as GitHub secrets

---

## B. Environment Configuration (`.env` on production server)

Copy from `backend/.env.example` and update every value below:

### Core
```
APP_NAME="Bake & Grill"
APP_ENV=production
APP_KEY=<generate: php artisan key:generate>
APP_DEBUG=false
APP_URL=https://bakeandgrill.mv
```

### Database
```
DB_CONNECTION=pgsql
DB_HOST=127.0.0.1
DB_PORT=5432
DB_DATABASE=bakegrill_prod
DB_USERNAME=bakegrill
DB_PASSWORD=<strong random password>
```

### Session & Sanctum
```
SESSION_DRIVER=database
SESSION_SECURE_COOKIE=true
SESSION_DOMAIN=.bakeandgrill.mv
SANCTUM_STATEFUL_DOMAINS=bakeandgrill.mv,app.bakeandgrill.mv
```
> Remove `test.bakeandgrill.mv` from this list after cutover.

### Redis
```
REDIS_HOST=127.0.0.1
REDIS_PASSWORD=<strong random password>
REDIS_PORT=6379
QUEUE_CONNECTION=redis
CACHE_STORE=redis
```

### BML Payment (Production Credentials)
```
BML_BASE_URL=https://api.merchants.bankofmaldives.com.mv/public
BML_APP_ID=<from BML production dashboard>
BML_API_KEY=<from BML production dashboard>
BML_MERCHANT_ID=<from BML production dashboard>
BML_WEBHOOK_SECRET=<generate: openssl rand -hex 32; register in BML dashboard>
BML_AUTH_MODE=auto
BML_RETURN_URL=https://bakeandgrill.mv/payments/bml/return
BML_WEBHOOK_URL=https://bakeandgrill.mv/api/payments/bml/webhook
FRONTEND_ORDER_STATUS_URL=https://bakeandgrill.mv/orders
BML_ENVIRONMENT=production
BML_ENFORCE_SIGNATURE=true
```
> ⚠️ NEVER carry UAT credentials (`CHANGE_ME_*` values) to production.

### Tax
```
TAX_RATE_BP=800
TAX_INCLUSIVE=false
```
> Verify items in the admin menu also have `tax_rate=8.00`. If any items changed, this must still match.

### SMS (Dhiraagu)
```
DHIRAAGU_SMS_USERNAME=<real Dhiraagu credentials>
DHIRAAGU_SMS_PASSWORD=<real Dhiraagu credentials>
```

### Email
```
MAIL_MAILER=smtp
MAIL_HOST=<your SMTP host>
MAIL_PORT=587
MAIL_USERNAME=<smtp username>
MAIL_PASSWORD=<smtp password>
MAIL_ENCRYPTION=tls
MAIL_FROM_ADDRESS="noreply@bakeandgrill.mv"
MAIL_FROM_NAME="Bake & Grill"
```

### Frontend URLs (CORS)
```
FRONTEND_URL=https://bakeandgrill.mv
POS_URL=https://pos.bakeandgrill.mv
KDS_URL=https://kds.bakeandgrill.mv
DELIVERY_URL=https://driver.bakeandgrill.mv
ADMIN_URL=https://bakeandgrill.mv/admin
```

### Logging
```
LOG_STACK=daily
LOG_LEVEL=warning
```

### Error Monitoring
```
SENTRY_LARAVEL_DSN=<same DSN as UAT, or create separate production project>
SENTRY_TRACES_SAMPLE_RATE=0.1
```

---

## C. First Deploy Sequence (Manual — Do Not Auto-Deploy First Time)

Run these in order manually on the production server (`/home/bakeandgrill/public_html`):

```bash
cd /home/bakeandgrill/public_html

# 1. Pull code (first time: git clone https://github.com/ampilarey/Bakeandgrill.git .)
git pull origin main

# 2. Backend setup (first time only: cp .env.example .env && edit values)
cd backend
composer install --no-dev --optimize-autoloader
php artisan key:generate   # first time only
php artisan migrate --force
php artisan db:seed --class=PermissionSeeder   # first time only
php artisan storage:link --force
./scripts/prod-preflight.sh backend/.env
php artisan config:cache
php artisan route:cache
php artisan view:clear

# 3. Verify health + apps
cd ..
./scripts/post-deploy-smoke.sh production
```

Or use the all-in-one script after `.env` is configured:

```bash
./scripts/full-deploy.sh production
./scripts/prod-preflight.sh
```

---

## D. Queue Worker & Scheduler (Permanent Setup)

### Option A — systemd (recommended)
Create `/etc/systemd/system/bakegrill-queue.service`:
```ini
[Unit]
Description=Bake & Grill Queue Worker
After=network.target

[Service]
User=bakeandgrill
WorkingDirectory=/home/bakeandgrill/bakeandgrill.mv/backend
ExecStart=/usr/bin/php artisan queue:work redis --sleep=3 --tries=3 --max-time=3600
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

### Option B — crontab (simpler, matches current UAT setup)
```
* * * * * cd /home/bakeandgrill/bakeandgrill.mv/backend && php artisan schedule:run >> /dev/null 2>&1
* * * * * pgrep -f "queue:work redis" || cd /home/bakeandgrill/bakeandgrill.mv/backend && nohup php artisan queue:work redis --sleep=3 --tries=3 --max-time=3600 >> storage/logs/queue-worker.log 2>&1 &
```

---

## E. CI/CD GitHub Workflow (When Ready)

The current `ci.yml` deploys only to the test server.  
When production server is ready, add a second deploy job:

```yaml
deploy-production:
  name: Deploy (production — bakeandgrill.mv)
  runs-on: ubuntu-latest
  needs: [frontend, test, test-postgres, contract]
  if: github.ref == 'refs/heads/main' && github.event_name == 'push'
  environment: production   # requires manual approval in GitHub
  steps:
    - name: Deploy via SSH
      uses: appleboy/ssh-action@v1.0.3
      with:
        host: ${{ secrets.DEPLOY_HOST_PROD }}
        username: ${{ secrets.DEPLOY_USER_PROD }}
        key: ${{ secrets.DEPLOY_SSH_KEY_PROD }}
        script: |
          cd /home/bakeandgrill/bakeandgrill.mv \
          && git pull origin main \
          && cd backend \
          && composer install --no-dev --optimize-autoloader \
          && php artisan migrate --force \
          && php artisan storage:link --force \
          && php artisan config:cache \
          && php artisan route:cache \
          && php artisan view:clear \
          && php artisan queue:restart \
          && echo "Production deploy complete."
```

> Recommend using `environment: production` with required reviewers in GitHub settings for an approval gate.

---

## F. Post-Deploy Verification (After First Production Deploy)

Run these manually after first deploy to production:

- [ ] `GET https://bakeandgrill.mv/api/health` returns 200
- [ ] Admin login works (phone + password)
- [ ] Customer can browse menu and add to cart
- [ ] Checkout with **real BML production card** (small test amount)
- [ ] Order appears in admin
- [ ] KDS receives the order
- [ ] Customer receives confirmation SMS
- [ ] Staff receives new order SMS
- [ ] Receipt page loads
- [ ] Check Sentry for any errors in first 30 minutes
- [ ] Check `failed_jobs` table is empty: `php artisan tinker --execute="echo \App\Models\FailedJob::count();"`

---

## G. Security Hardening (Before Public Traffic)

- [ ] Confirm `APP_DEBUG=false` (never expose stack traces)
- [ ] Confirm `X-Forwarded-*` headers only from trusted proxy (nginx config)
- [ ] Confirm `SESSION_SECURE_COOKIE=true`
- [ ] No `CHANGE_ME_*` values in production `.env`
- [ ] Run `grep CHANGE_ME /home/bakeandgrill/bakeandgrill.mv/backend/.env` — must return empty
- [ ] Confirm `BML_ENFORCE_SIGNATURE=true`
- [ ] Redis not accessible on public network (firewall rule)
- [ ] DB not accessible on public network (firewall rule)

---

## H. Architecture Risks to Address Before Heavy Production Load

These were documented in audits but are safe to defer until after initial go-live:

| Risk | Priority | Why Deferred |
|---|---|---|
| Two competing order total calculation models (`OrderCreationService` vs `OrderTotalsCalculator`) | HIGH | Low traffic initially; architectural refactor |
| Promo per-user limit bypassable via concurrent unpaid orders | HIGH | Unlikely in low-volume Maldives restaurant |
| Delivery order total fields inconsistent after manual fee patch | MEDIUM | Delivery tested UAT first |
| Full refund does not restore variant-tracked stock | MEDIUM | Refund flow rare initially |
| Accounts payable/receivable unbounded queries | MEDIUM | Admin-only, low frequency |
| Analytics retention loads all orders into memory | MEDIUM | Low order volume initially |
| No Sentry alert for new error classes | MEDIUM | Sentry configured, alerts need setup |
| Job `$timeout` not set on all jobs | LOW | Documented; add in next sprint |

---

## I. Rollback Procedure

If a production deploy fails:

```bash
# On production server
cd /home/bakeandgrill/bakeandgrill.mv
git log --oneline -10   # find the last good commit hash
git checkout <hash>
cd backend
php artisan config:cache && php artisan route:cache && php artisan view:clear
php artisan queue:restart
```

For database rollback (if migration failed):
```bash
cd backend
php artisan migrate:rollback   # rolls back last migration batch
```

> ⚠️ Do not run `migrate:rollback` if customer orders exist on the table being rolled back. Use manual SQL instead.
