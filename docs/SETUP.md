# Bake & Grill - Setup Guide

## Prerequisites

- Docker Desktop (or Docker + Docker Compose)
- Node.js 20+ and npm/yarn/pnpm
- PHP 8.5+ (for local development without Docker)
- Composer 2.x (for local development without Docker)
- Git

## Quick Start

### 1. Clone and Setup

```bash
cd /Users/vigani/Website/Bake\&Grill
cp .env.example .env
```

### 2. Start Docker Services

```bash
docker-compose up -d
```

This will start:
- PostgreSQL (port 5432)
- Redis (port 6379)
- Backend API (port 8000)
- Print Proxy (port 3000)

### 3. Setup Backend

```bash
cd backend
composer install
php artisan key:generate
php artisan migrate
```

### 4. Setup Frontend Apps

For each React app (pos-web, kds-web, online-order-web):

```bash
cd apps/pos-web
npm install
npm run dev
```

Repeat for `kds-web` and `online-order-web`.

## Device Registration

Staff order endpoints require a registered device. Register a device once:

```bash
curl -X POST http://localhost:8000/api/devices/register \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"POS 1","identifier":"POS-001","type":"pos","ip_address":"127.0.0.1"}'
```

POS requests should send `device_identifier` in the payload or `X-Device-Identifier` header.

### 5. Setup Print Proxy

```bash
cd print-proxy
npm install
npm run dev
```

## Development URLs

- **Backend API**: http://localhost:8000
- **API Health**: http://localhost:8000/api/health
- **POS App**: http://localhost:3001
- **KDS App**: http://localhost:3002
- **Online Ordering**: http://localhost:3003
- **Print Proxy**: http://localhost:3000/health

## Project Structure

```
bake-grill-cafe/
├── backend/              # Laravel 12 API
├── apps/
│   ├── pos-web/         # POS PWA
│   ├── kds-web/         # Kitchen Display System
│   └── online-order-web/ # Online Ordering
├── packages/
│   └── shared/          # Shared React components/types
├── print-proxy/          # Node.js ESC/POS print server
└── docs/                 # Documentation
```

## Troubleshooting

### Docker Issues

If services don't start:
```bash
docker-compose down
docker-compose up -d --build
```

### Database Connection

Ensure PostgreSQL is running:
```bash
docker-compose ps
```

Check backend logs:
```bash
docker-compose logs backend
```

### Port Conflicts

If ports are already in use, modify `docker-compose.yml` to use different ports.

## Next Steps

See [IMPLEMENTATION_GUIDE.md](IMPLEMENTATION_GUIDE.md) for detailed implementation steps.
