# Security Policy — Bake & Grill

## Supported Versions

| Component | Supported |
|---|---|
| `backend` (Laravel 11) | ✅ |
| `apps/online-order-web` | ✅ |
| `apps/admin-dashboard` | ✅ |
| `apps/pos` | ✅ |
| `apps/kds` | ✅ |
| `print-proxy` | ✅ |

Only the latest version on the `main` branch is actively maintained.

---

## Reporting a Vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

Please report security issues privately:

- **Email:** hello@bakeandgrill.mv
- **Subject line:** `[SECURITY] <brief description>`
- **Response time:** We aim to acknowledge within 48 hours and issue a fix within 14 days for critical issues.

Please include:
- A clear description of the vulnerability
- Steps to reproduce
- The potential impact
- Any suggested fix (optional but appreciated)

We will credit researchers who report valid vulnerabilities, if desired.

---

## Responsible Disclosure

We ask that you:
- Give us reasonable time to respond before public disclosure
- Do not access or modify data that does not belong to you
- Do not disrupt live services (test against a local copy if possible)

---

## Security Architecture

### Authentication

- **Customers** authenticate via phone OTP. Sanctum tokens are issued and scoped to customer-facing routes only.
- **Staff** (POS, KDS, Admin) authenticate via a separate Sanctum token flow. Admin routes require the `admin` role; finance routes require `admin` or `finance`.
- **Print Proxy** is protected by a shared secret (`PRINT_PROXY_KEY`). It must not be exposed to the public internet.

### Payment Security

- All card payments are processed through **Bank of Maldives (BML) BankConnect**.
- Bake & Grill **does not store, process, or transmit cardholder data** (PCI-DSS scope is limited to BML's gateway).
- BML webhook signatures are verified using `BML_WEBHOOK_SECRET` via HMAC-SHA256.

### Rate Limiting

OTP endpoints are protected by Laravel's `throttle` middleware:
- `/api/auth/customer/otp/request` — 3 requests per 5 minutes per IP
- `/api/auth/customer/otp/verify` — 5 requests per 10 minutes per IP

### Secrets Management

All secrets are stored in `.env` files which are excluded from version control via `.gitignore`.
The `.env.example` files contain only placeholder values. **Never commit real credentials.**

Required secrets to generate before deployment:
```bash
# App key
php artisan key:generate

# Print proxy API key
openssl rand -hex 32

# BML webhook secret
openssl rand -hex 32
```

### Print Proxy

The print proxy (`print-proxy/`) should be:
- Bound to `127.0.0.1` (loopback) on a bare-metal or VPS deployment
- Bound to `0.0.0.0` **only** inside an isolated Docker network with external firewall rules
- Never exposed to the public internet directly

---

## Known Limitations

- **Stripe** is implemented as a secondary payment method; full PCI DSS compliance testing has not been completed.
- **Xero OAuth tokens** are stored in the database. Ensure the database is encrypted at rest on the production server.
- **Offline mode** uses idempotency keys but does not yet enforce expiry of stale keys; review `OfflineSyncController` before enabling at high scale.

---

## Dependency Security

```bash
# PHP
composer audit

# Node.js (all workspaces)
npm audit --workspaces
```

Review and address `high` or `critical` severity advisories before deployment.
