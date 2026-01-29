# Bake & Grill – Implementation Guide

**Version:** 1.0  
**Last Updated:** January 27, 2026  
**Status:** Planning Phase

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Step-by-Step Implementation](#step-by-step-implementation)
   - [Core Steps (1-15)](#core-steps-original-15-steps)
   - [Critical Enhancements (16-22)](#critical-enhancements-integrated-into-mvpphase-1)
   - [High Priority Features (23-31)](#high-priority-features-phase-2-3)
   - [Medium Priority Features (32-37)](#medium-priority-features-phase-4)
3. [Technical Specifications](#technical-specifications)
4. [Development Workflow](#development-workflow)
5. [Testing Strategy](#testing-strategy)
6. [Deployment Guide](#deployment-guide)
7. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Required Knowledge
- Laravel 12 framework
- React with TypeScript
- Node.js and Express
- PostgreSQL database
- Docker and Docker Compose
- RESTful API design
- PWA development
- ESC/POS printing protocol

### Required Tools
- Docker Desktop (or Docker + Docker Compose)
- Node.js 20+ and npm/yarn/pnpm
- PHP 8.5+
- Composer 2.x
- Git
- Code editor (VS Code recommended)

### System Requirements
- **Development**: 8GB RAM minimum, 16GB recommended
- **Production Server**: 4GB RAM minimum, 8GB+ recommended
- **Database**: PostgreSQL 15+
- **Redis**: 6.0+ (for caching and queues)

---

## Step-by-Step Implementation

### Implementation Overview

This guide covers **37 implementation steps** organized into phases:

**Core Steps (1-15)**: Original foundation and core POS functionality  
**Critical Enhancements (16-22)**: Essential features for competitive system (MVP/Phase 1)  
**High Priority Features (23-31)**: Customer experience and business intelligence (Phase 2-3)  
**Medium Priority Features (32-37)**: Operational excellence (Phase 4+)

See [PROJECT_OVERVIEW.md](PROJECT_OVERVIEW.md) for complete feature list and priorities.

---

### Core Steps (Original 15 Steps)

### STEP 0: Project Overview & Confirmation

**Objective**: Understand project scope and confirm architecture decisions.

**Deliverables**:
- ✅ Project documentation reviewed
- ✅ Architecture decisions confirmed
- ✅ Critical questions answered
- ✅ Team alignment on approach

**Checklist**:
- [ ] Review PROJECT_OVERVIEW.md
- [ ] Confirm database choice (PostgreSQL)
- [ ] Confirm deployment environment
- [ ] Clarify business rules (discounts, refunds, tax)
- [ ] Confirm payment methods
- [ ] Set up project repository

**No code changes** - Planning phase only.

---

### STEP 1: Monorepo + Docker Scaffold

**Objective**: Set up project structure and development environment.

#### Repository Structure

```
bake-grill-cafe/
├── backend/                 # Laravel 12 API
│   ├── app/
│   ├── bootstrap/
│   ├── config/
│   ├── database/
│   ├── public/
│   ├── resources/
│   ├── routes/
│   ├── tests/
│   ├── composer.json
│   └── Dockerfile
│
├── apps/
│   ├── pos-web/            # POS PWA
│   │   ├── src/
│   │   ├── public/
│   │   ├── package.json
│   │   └── vite.config.ts
│   │
│   ├── kds-web/           # Kitchen Display System
│   │   ├── src/
│   │   ├── public/
│   │   ├── package.json
│   │   └── vite.config.ts
│   │
│   └── online-order-web/  # Online Ordering + Customer Portal
│       ├── src/
│       ├── public/
│       ├── package.json
│       └── vite.config.ts
│
├── packages/
│   └── shared/            # Shared React components, types, utilities
│       ├── src/
│       ├── package.json
│       └── tsconfig.json
│
├── print-proxy/           # Node.js ESC/POS print server
│   ├── src/
│   ├── package.json
│   └── Dockerfile
│
├── docs/                  # Documentation
│   ├── PROJECT_OVERVIEW.md
│   ├── IMPLEMENTATION_GUIDE.md
│   └── SETUP.md
│
├── docker-compose.yml
├── docker-compose.prod.yml
├── .env.example
└── README.md
```

#### Docker Compose Setup

**docker-compose.yml** (Development):

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: bakegrill
      POSTGRES_USER: bakegrill
      POSTGRES_PASSWORD: ${DB_PASSWORD:-secret}
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U bakegrill"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    ports:
      - "8000:8000"
    volumes:
      - ./backend:/var/www/html
    environment:
      - DB_HOST=postgres
      - DB_DATABASE=bakegrill
      - DB_USERNAME=bakegrill
      - DB_PASSWORD=${DB_PASSWORD:-secret}
      - REDIS_HOST=redis
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    command: php artisan serve --host=0.0.0.0 --port=8000

  print-proxy:
    build:
      context: ./print-proxy
      dockerfile: Dockerfile
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=development
      - API_URL=http://backend:8000
    depends_on:
      - backend

volumes:
  postgres_data:
  redis_data:
```

#### Laravel Backend Setup

**Requirements**:
- Laravel 12
- PHP 8.5+
- Laravel Sanctum ^4.0
- PostgreSQL driver

**Installation Steps**:

```bash
cd backend
composer create-project laravel/laravel . --prefer-dist
composer require laravel/sanctum
php artisan vendor:publish --provider="Laravel\Sanctum\SanctumServiceProvider"
php artisan migrate
```

**Health Endpoint** (`routes/api.php`):

```php
Route::get('/health', function () {
    return response()->json([
        'status' => 'ok',
        'timestamp' => now()->toIso8601String(),
        'version' => '1.0.0',
    ]);
});
```

#### React Apps Setup

**Each React app** (pos-web, kds-web, online-order-web):

```bash
npm create vite@latest . -- --template react-ts
npm install
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
```

**Vite Config** (example for pos-web):

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@shared': path.resolve(__dirname, '../shared/src'),
    },
  },
  server: {
    port: 3001, // pos-web
    // port: 3002, // kds-web
    // port: 3003, // online-order-web
  },
});
```

**PWA Setup** (for each React app):

```bash
npm install -D vite-plugin-pwa
npm install workbox-window
```

#### Print Proxy Setup

**package.json**:

```json
{
  "name": "print-proxy",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "node-thermal-printer": "^4.4.0",
    "axios": "^1.6.0"
  },
  "devDependencies": {
    "@types/express": "^4.17.21",
    "@types/node": "^20.10.0",
    "tsx": "^4.7.0",
    "typescript": "^5.3.0"
  }
}
```

**Health Endpoint** (`src/index.ts`):

```typescript
import express from 'express';

const app = express();
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
  });
});

app.listen(3000, () => {
  console.log('Print proxy running on port 3000');
});
```

#### Deliverables Checklist

- [ ] Repository structure created
- [ ] Docker Compose file configured
- [ ] Laravel backend boots successfully
- [ ] Health endpoint responds: `GET /api/health`
- [ ] All React apps boot successfully
- [ ] Print proxy health endpoint works: `GET http://localhost:3000/health`
- [ ] `docs/SETUP.md` created with setup instructions
- [ ] `.env.example` files created for all services

**No business logic yet** - Just scaffolding.

---

### STEP 2: Database Schema + Migrations

**Objective**: Create complete database schema with migrations, models, enums, and seeders.

#### Database Tables

**Core Tables**:

1. **users** - Staff users
2. **roles** - RBAC roles
3. **devices** - Registered POS devices
4. **categories** - Menu categories
5. **subcategories** - Menu subcategories
6. **items** - Menu items/products
7. **variants** - Item variants (size, etc.)
8. **modifiers** - Item modifiers/add-ons
9. **item_modifier** - Pivot table
10. **tables** - Restaurant tables
11. **customers** - Customer records
12. **otp_verifications** - OTP storage
13. **orders** - Sales orders
14. **order_items** - Order line items
15. **order_item_modifiers** - Modifiers on order items
16. **payments** - Payment records
17. **payment_splits** - Split payment details
18. **inventory_items** - Inventory/stock items
19. **recipes** - Item recipes (BOM)
20. **recipe_items** - Recipe ingredients
21. **stock_movements** - Stock transaction log
22. **suppliers** - Supplier records
23. **purchases** - Purchase orders
24. **purchase_items** - Purchase line items
25. **purchase_receipts** - Receipt attachments
26. **refunds** - Refund records
27. **shifts** - Cashier shifts
28. **cash_movements** - Cash in/out transactions
29. **print_jobs** - Print job queue
30. **audit_logs** - System audit trail

#### Key Migrations Structure

**Example: users migration**:

```php
Schema::create('users', function (Blueprint $table) {
    $table->id();
    $table->string('name');
    $table->string('email')->unique()->nullable();
    $table->string('pin_hash'); // Hashed PIN
    $table->string('phone')->nullable();
    $table->foreignId('role_id')->constrained();
    $table->boolean('is_active')->default(true);
    $table->timestamp('last_login_at')->nullable();
    $table->timestamps();
    $table->softDeletes();
    
    $table->index('email');
    $table->index('role_id');
});
```

**Example: orders migration**:

```php
Schema::create('orders', function (Blueprint $table) {
    $table->id();
    $table->string('order_number')->unique();
    $table->enum('type', ['dine_in', 'takeaway', 'online_pickup']);
    $table->enum('status', ['pending', 'confirmed', 'preparing', 'ready', 'completed', 'cancelled', 'held']);
    $table->foreignId('table_id')->nullable()->constrained();
    $table->foreignId('customer_id')->nullable()->constrained();
    $table->foreignId('user_id')->constrained(); // Cashier
    $table->foreignId('device_id')->nullable()->constrained();
    $table->decimal('subtotal', 10, 2);
    $table->decimal('tax_amount', 10, 2)->default(0);
    $table->decimal('discount_amount', 10, 2)->default(0);
    $table->decimal('total', 10, 2);
    $table->text('notes')->nullable();
    $table->timestamp('completed_at')->nullable();
    $table->timestamps();
    $table->softDeletes();
    
    $table->index('order_number');
    $table->index('status');
    $table->index('type');
    $table->index('created_at');
    $table->index(['user_id', 'created_at']);
});
```

#### Enums

Create enums in `app/Enums/`:

- `OrderType.php`
- `OrderStatus.php`
- `PaymentMethod.php`
- `PaymentStatus.php`
- `StockMovementType.php`
- `UserRole.php`

#### Models

Create models with relationships:

- `User`, `Role`, `Device`
- `Category`, `Subcategory`, `Item`, `Variant`, `Modifier`
- `Table`, `Customer`, `Order`, `OrderItem`, `Payment`
- `InventoryItem`, `Recipe`, `StockMovement`
- `Supplier`, `Purchase`, `PurchaseItem`
- `Refund`, `Shift`, `CashMovement`, `PrintJob`, `AuditLog`

#### Seeders

**DatabaseSeeder** should create:

1. **Roles**: Owner, Admin, Manager, Cashier
2. **Demo Users**: One user per role with PIN `1234` (hashed)
3. **Printers**: Three printers (.50, .51, .52)
4. **Tables**: 10-20 tables (T1, T2, etc.)
5. **Sample Menu**:
   - Categories (Food, Drinks, Desserts)
   - Subcategories (Main Course, Appetizers, etc.)
   - Items with variants and modifiers
   - Sample inventory items
   - Sample recipes

#### Deliverables Checklist

- [ ] All migrations created and tested
- [ ] All models created with relationships
- [ ] All enums created
- [ ] Seeders populate demo data
- [ ] Database indexes optimized
- [ ] Foreign key constraints defined
- [ ] Soft deletes on critical tables
- [ ] Migration rollback tested

---

### STEP 3: Staff Auth (PIN) + RBAC

**Objective**: Implement PIN-based authentication and role-based access control.

#### PIN Authentication

**Security Requirements**:
- PINs must be hashed (use `Hash::make()`)
- Minimum 4 digits (configurable)
- Rate limiting: 5 attempts per 15 minutes
- Account lockout after 10 failed attempts
- PIN change requires current PIN verification

**Endpoint**: `POST /api/auth/staff/pin-login`

**Request**:
```json
{
  "pin": "1234",
  "device_id": "device-uuid-here"
}
```

**Response**:
```json
{
  "token": "sanctum-token",
  "user": {
    "id": 1,
    "name": "John Doe",
    "role": "cashier",
    "permissions": [...]
  }
}
```

#### Device Registration

**Endpoint**: `POST /api/devices/register`

**Request**:
```json
{
  "name": "POS-01",
  "identifier": "device-uuid",
  "type": "pos"
}
```

**Response**:
```json
{
  "id": 1,
  "name": "POS-01",
  "identifier": "device-uuid",
  "is_active": true
}
```

#### RBAC Implementation

**Roles**:
- **Owner**: Full access
- **Admin**: Full access except owner settings
- **Manager**: Sales, reports, inventory, staff management
- **Cashier**: POS operations, basic reports

**Policies** (Laravel Policies):

- `DiscountPolicy`: Who can apply discounts
- `RefundPolicy`: Who can process refunds
- `VoidPolicy`: Who can void orders
- `StockPolicy`: Who can adjust stock
- `CashPolicy`: Who can access cash drawer
- `PurchasePolicy`: Who can create purchases

**Middleware**: `CheckPermission` middleware for route protection.

#### Endpoints

- `POST /api/auth/staff/pin-login` - PIN login
- `POST /api/auth/logout` - Logout (revoke token)
- `GET /api/auth/me` - Get current user
- `POST /api/devices/register` - Register device
- `GET /api/devices` - List devices (admin)
- `PATCH /api/devices/{id}/disable` - Disable device

#### Deliverables Checklist

- [ ] PIN login endpoint working
- [ ] PIN hashing implemented
- [ ] Rate limiting active
- [ ] Device registration working
- [ ] Roles and permissions seeded
- [ ] Policies created and tested
- [ ] Middleware protecting routes
- [ ] Token revocation on logout

---

### STEP 4: Customer OTP Auth

**Objective**: Implement OTP-based customer authentication.

#### OTP Flow

1. Customer requests OTP via phone
2. System generates 6-digit OTP
3. OTP sent via SMS (or email fallback)
4. Customer verifies OTP
5. System creates/updates customer record
6. Returns Sanctum token

#### Rate Limiting

- **OTP Request**: 3 requests per phone per hour
- **OTP Verify**: 5 attempts per OTP code
- **OTP Expiry**: 10 minutes

#### Endpoints

**Request OTP**: `POST /api/auth/customer/otp/request`

```json
{
  "phone": "+9607001234"
}
```

**Verify OTP**: `POST /api/auth/customer/otp/verify`

```json
{
  "phone": "+9607001234",
  "otp": "123456"
}
```

**Response**:
```json
{
  "token": "sanctum-token",
  "customer": {
    "id": 1,
    "phone": "+9607001234",
    "name": "Ahmed",
    "email": null
  }
}
```

**Get Customer**: `GET /api/customer/me` (authenticated)

**Customer Orders**: `GET /api/customer/orders` (authenticated)

#### SMS Integration

Use SMS gateway (Twilio, AWS SNS, or local provider).

**Fallback**: Log OTP to file/logs in development.

#### Deliverables Checklist

- [ ] OTP request endpoint working
- [ ] OTP verification endpoint working
- [ ] Rate limiting implemented
- [ ] OTP expiry enforced
- [ ] Customer creation/update on verify
- [ ] Sanctum token issued
- [ ] SMS integration (or mock for dev)
- [ ] Customer endpoints protected

---

### STEP 5: Menu & Item Management

**Objective**: Implement CRUD for menu structure (categories, items, variants, modifiers).

#### Data Structure

```
Category
  └── Subcategory
      └── Item
          ├── Variants (Size: Small, Medium, Large)
          └── Modifiers (Add-ons: Extra cheese, etc.)
```

#### Endpoints

**Categories**:
- `GET /api/categories` - List all categories
- `POST /api/categories` - Create category (admin)
- `PATCH /api/categories/{id}` - Update category
- `DELETE /api/categories/{id}` - Delete category

**Items**:
- `GET /api/items` - List items (with filters)
- `GET /api/items/{id}` - Get item details
- `POST /api/items` - Create item
- `PATCH /api/items/{id}` - Update item
- `DELETE /api/items/{id}` - Delete item (soft)
- `GET /api/items/barcode/{barcode}` - Lookup by barcode

**Features**:
- Multiple price levels (regular, happy hour, etc.)
- Enable/disable items
- Tax per item (configurable)
- Image upload for items
- SKU and barcode support

#### Barcode Lookup

**Endpoint**: `GET /api/items/barcode/{barcode}`

Returns item with variants and modifiers.

#### Price Levels

Store in `item_price_levels` table:

```php
Schema::create('item_price_levels', function (Blueprint $table) {
    $table->id();
    $table->foreignId('item_id')->constrained();
    $table->string('level_name'); // 'regular', 'happy_hour', etc.
    $table->decimal('price', 10, 2);
    $table->time('start_time')->nullable();
    $table->time('end_time')->nullable();
    $table->timestamps();
});
```

#### Deliverables Checklist

- [ ] Category CRUD working
- [ ] Subcategory CRUD working
- [ ] Item CRUD working
- [ ] Variant management working
- [ ] Modifier management working
- [ ] Barcode lookup working
- [ ] Price levels implemented
- [ ] Image upload working
- [ ] Enable/disable items working
- [ ] Tax configuration per item

---

### STEP 6: POS PWA (MVP)

**Objective**: Build basic POS interface with offline support.

#### Core Features

1. **PIN Login Screen**
2. **Category/Item Selection**
3. **Modifier Selection**
4. **Cart Management**
5. **Barcode Scanner**
6. **Order Type Selection** (Dine-in, Takeaway, Online)
7. **Checkout Flow**
8. **Offline Queue** (IndexedDB)
9. **Sync Indicator**

#### UI Components

- Category grid/list
- Item grid with images
- Modifier selection modal
- Cart sidebar
- Barcode input field
- Order type selector
- Checkout modal
- Sync status indicator

#### Offline Implementation

**IndexedDB Schema**:

```typescript
interface OfflineQueue {
  id: string;
  action: 'create_order' | 'update_order' | 'sync_menu';
  data: any;
  timestamp: number;
  retries: number;
  status: 'pending' | 'syncing' | 'failed';
}
```

**Sync Strategy**:
1. Queue all API calls when offline
2. Show sync indicator
3. Auto-sync when online
4. Manual sync button
5. Show pending operations count

#### Service Worker

- Cache menu data
- Cache static assets
- Background sync for orders
- Offline fallback page

#### Deliverables Checklist

- [ ] PIN login screen working
- [ ] Category/item selection UI
- [ ] Modifier selection working
- [ ] Cart management working
- [ ] Barcode input functional
- [ ] Order type selection working
- [ ] Offline queue implemented (IndexedDB)
- [ ] Sync indicator showing status
- [ ] Service worker caching assets
- [ ] PWA installable

---

### STEP 7: Orders + Split Payments

**Objective**: Implement order creation, management, and split payment support.

#### Order Creation

**Endpoint**: `POST /api/orders`

**Request**:
```json
{
  "type": "dine_in",
  "table_id": 1,
  "items": [
    {
      "item_id": 1,
      "variant_id": 2,
      "quantity": 2,
      "modifiers": [3, 4],
      "notes": "No onions"
    }
  ],
  "notes": "Table 5"
}
```

**Response**: Order with order_number, totals, etc.

#### Order Numbering

Format: `BG-YYYYMMDD-XXXX` (e.g., `BG-20260127-0001`)

Reset daily or sequential.

#### Order Status Flow

```
pending → confirmed → preparing → ready → completed
                ↓
            cancelled
            held (can resume)
```

#### Hold/Resume Orders

**Hold**: `PATCH /api/orders/{id}/hold`
**Resume**: `PATCH /api/orders/{id}/resume`

#### Split Payments

**Endpoint**: `POST /api/orders/{id}/payments/split`

**Request**:
```json
{
  "splits": [
    {
      "method": "cash",
      "amount": 50.00
    },
    {
      "method": "card",
      "amount": 30.00
    }
  ]
}
```

#### Search & Recall

**Endpoint**: `GET /api/orders/search?q={query}`

Search by:
- Order number
- Table number
- Customer phone
- Date range

#### Manager Reopen

**Endpoint**: `PATCH /api/orders/{id}/reopen` (Manager+ only)

#### Deliverables Checklist

- [ ] Order creation endpoint working
- [ ] Order numbering implemented
- [ ] Order status management working
- [ ] Hold/resume functionality
- [ ] Split payments working
- [ ] Order search working
- [ ] Manager reopen working
- [ ] Order totals calculated correctly
- [ ] Tax and discounts applied

---

### STEP 8: Table Management

**Objective**: Implement dine-in table management.

#### Table Operations

**Open Table**: `POST /api/tables/{id}/open`
- Creates order with table_id
- Sets table status to "occupied"

**Add Items to Table**: `POST /api/orders/{id}/items`
- Adds items to existing table order

**Close Table**: `POST /api/tables/{id}/close`
- Completes order
- Sets table status to "available"
- Prints receipt

**Merge Tables**: `POST /api/tables/merge`
```json
{
  "from_table_id": 1,
  "to_table_id": 2
}
```

**Split Bill**:

1. **Split by Items**: `POST /api/orders/{id}/split-items`
   - Select items to move to new order

2. **Split by Amount**: `POST /api/orders/{id}/split-amount`
   - Split total amount between orders

#### Table Status

- `available` - Ready for customers
- `occupied` - Has active order
- `reserved` - Reserved (future)
- `cleaning` - Being cleaned

#### Deliverables Checklist

- [ ] Open table working
- [ ] Add items to table order
- [ ] Close table working
- [ ] Merge tables working
- [ ] Split by items working
- [ ] Split by amount working
- [ ] Table status tracking
- [ ] Table list view showing status

---

### STEP 9: Printing (ESC/POS)

**Objective**: Implement kitchen/bar/counter printing via Node.js print-proxy.

#### Print Proxy Implementation

**Receive Print Jobs**: `POST /print`

**Request**:
```json
{
  "printer_ip": "192.168.1.50",
  "printer_port": 9100,
  "type": "kitchen", // kitchen, bar, counter, receipt
  "data": {
    "order_number": "BG-20260127-0001",
    "items": [...],
    "notes": "..."
  }
}
```

**ESC/POS Rendering**:
- Use `node-thermal-printer` or `escpos` library
- Format receipt/kitchen ticket
- Send via TCP socket to printer

**Retry Queue**:
- Queue failed prints
- Retry with exponential backoff
- Dead letter queue after max retries

#### Laravel Print Job Creation

**Endpoint**: `POST /api/orders/{id}/print`

**Request**:
```json
{
  "type": "kitchen", // kitchen, bar, counter, receipt
  "printer_id": 1
}
```

**Print Job Queue**:
- Create `print_jobs` record
- Send to print-proxy
- Track status (queued, printing, completed, failed)

#### Printer Configuration

Store in `printers` table:
- IP address
- Port (default 9100)
- Type (kitchen, bar, counter)
- Station assignment
- Is active

#### Reprint Support

**Endpoint**: `POST /api/orders/{id}/reprint`

#### Deliverables Checklist

- [ ] Print proxy receives jobs
- [ ] ESC/POS rendering working
- [ ] TCP connection to printer working
- [ ] Retry queue implemented
- [ ] Laravel creates print jobs
- [ ] Print job status tracking
- [ ] Reprint functionality
- [ ] Printer health monitoring
- [ ] Error handling and logging

---

### STEP 10: KDS (Kitchen Display System)

**Objective**: Build kitchen/bar display interface for order management.

#### KDS Features

1. **Live Tickets Display**
   - Show active orders
   - Group by station (kitchen, bar, etc.)
   - Color coding by status

2. **Timers**
   - Order age timer
   - Target time alerts
   - Overdue highlighting

3. **Bump/Recall**
   - Bump order to top
   - Recall completed order

4. **Station Filter**
   - Filter by kitchen station
   - Multiple stations support

5. **Sound Alerts**
   - New order sound
   - Overdue order alert

#### Real-time Updates

**Option 1**: WebSocket (Laravel Echo + Pusher/Soketi)
**Option 2**: Polling (simpler, less real-time)
**Option 3**: Server-Sent Events (SSE)

**Recommended**: Start with polling, upgrade to WebSocket later.

#### Endpoints

- `GET /api/kds/orders` - Get active orders for KDS
- `PATCH /api/orders/{id}/status` - Update order status
- `POST /api/orders/{id}/bump` - Bump order
- `POST /api/orders/{id}/recall` - Recall order

#### KDS UI Layout

- Grid of order cards
- Each card shows:
  - Order number
  - Table number (if dine-in)
  - Items with modifiers
  - Timer
  - Status buttons
  - Notes

#### Deliverables Checklist

- [ ] KDS displays live orders
- [ ] Timers working
- [ ] Status updates working
- [ ] Bump/recall working
- [ ] Station filtering working
- [ ] Sound alerts working
- [ ] Real-time updates (polling or WebSocket)
- [ ] Full-screen KDS mode

---

### STEP 11: E-Receipts + Feedback

**Objective**: Implement digital receipts and customer feedback.

#### Receipt Generation

**Endpoint**: `GET /api/orders/{id}/receipt`

Returns:
- HTML receipt (for display)
- PDF receipt (for download/email)
- Receipt token (for public access)

#### Public Receipt Access

**URL**: `/receipt/{token}`

- Public page (no auth required)
- Shows receipt details
- Download PDF option
- Feedback form

#### SMS/Email Sending

**Endpoint**: `POST /api/orders/{id}/send-receipt`

**Request**:
```json
{
  "method": "sms", // or "email"
  "phone": "+9607001234",
  "email": "customer@example.com"
}
```

**Rate Limits**:
- 3 resends per order per day
- Prevent spam

#### Feedback Form

On receipt page:
- Rating (1-5 stars)
- Comments
- Submit feedback

**Endpoint**: `POST /api/orders/{id}/feedback`

#### Deliverables Checklist

- [ ] Receipt generation (HTML/PDF)
- [ ] Receipt token system
- [ ] Public receipt page
- [ ] SMS sending working
- [ ] Email sending working
- [ ] Resend limits enforced
- [ ] Feedback form working
- [ ] Feedback storage and viewing

---

### STEP 12: Online Ordering + Customer Portal

**Objective**: Build customer-facing online ordering and portal.

#### Online Ordering App

**Features**:
1. **Menu Browse**
   - Categories and items
   - Item details with images
   - Variants and modifiers selection

2. **Cart**
   - Add/remove items
   - Modify quantities
   - Apply promo codes (future)

3. **OTP Checkout**
   - Phone number input
   - OTP verification
   - Order placement

4. **Order Tracking**
   - Order status
   - Estimated ready time
   - Pickup instructions

#### Customer Portal

**Features**:
- Order history
- Receipt access
- Reorder functionality
- Profile management

#### Endpoints

**Public**:
- `GET /api/public/menu` - Public menu (no auth)
- `POST /api/public/orders` - Create order (OTP required)

**Authenticated**:
- `GET /api/customer/orders` - Order history
- `GET /api/customer/orders/{id}` - Order details
- `POST /api/customer/orders/{id}/reorder` - Reorder

#### Order Flow

1. Customer browses menu
2. Adds items to cart
3. Enters phone number
4. Receives OTP
5. Verifies OTP
6. Places order
7. Receives confirmation
8. Tracks order status
9. Picks up order

#### Deliverables Checklist

- [ ] Menu browsing working
- [ ] Cart functionality
- [ ] OTP checkout flow
- [ ] Order placement working
- [ ] Order tracking working
- [ ] Customer portal working
- [ ] Order history display
- [ ] Reorder functionality
- [ ] Responsive design

---

### STEP 13: Inventory + Purchasing (Excel Replacement)

**Objective**: Replace Excel-based inventory and purchasing system.

#### Inventory Management

**Features**:
1. **Recipe Management**
   - Define recipes (BOM) for items
   - Auto-deduct on order completion
   - Recipe cost calculation

2. **Stock Ledger**
   - All stock movements logged
   - Current stock levels
   - Stock history

3. **Stock Count**
   - Physical count entry
   - Variance calculation
   - Adjustment entries

4. **Valuation**
   - Current stock value
   - Cost method (FIFO, Average)
   - Valuation reports

#### Purchasing System

**Features**:
1. **Supplier Management**
   - Supplier CRUD
   - Contact information
   - Payment terms

2. **Purchase Entry**
   - Create purchase orders
   - Add purchase items
   - Receipt upload (images/PDFs)

3. **Price History**
   - Track price changes per supplier
   - Historical pricing

4. **Supplier Intelligence**
   - Cheapest supplier per item
   - Supplier comparison
   - Reorder point logic

5. **Import Functionality**
   - CSV/Excel import
   - Bulk purchase entry

#### Endpoints

**Inventory**:
- `GET /api/inventory/items` - List inventory items
- `POST /api/inventory/items` - Create inventory item
- `GET /api/inventory/items/{id}/stock` - Get stock level
- `POST /api/inventory/stock-count` - Stock count entry
- `GET /api/inventory/valuation` - Stock valuation

**Purchasing**:
- `GET /api/suppliers` - List suppliers
- `POST /api/purchases` - Create purchase
- `GET /api/purchases` - List purchases
- `POST /api/purchases/{id}/receipt` - Upload receipt
- `GET /api/purchases/import-template` - Download CSV template
- `POST /api/purchases/import` - Import purchases

#### Deliverables Checklist

- [ ] Recipe management working
- [ ] Auto-deduct on orders
- [ ] Stock ledger implemented
- [ ] Stock count functionality
- [ ] Stock valuation working
- [ ] Supplier CRUD working
- [ ] Purchase entry working
- [ ] Receipt upload working
- [ ] Price history tracking
- [ ] Cheapest supplier logic
- [ ] CSV/Excel import working
- [ ] Reorder point alerts

---

### STEP 14: Reports + Cash Drawer

**Objective**: Implement reporting and cash drawer management.

#### Reports

**X Report** (Current Shift):
- Sales summary
- Item sales
- Payment methods
- Tax summary
- Discounts

**Z Report** (End of Day):
- All X report data
- Cash drawer count
- Variance
- Shift summary

**Sales Reports**:
- By item
- By category
- By employee
- By date range
- By payment method

**Profit & Margin**:
- Gross profit
- Net profit
- Margin percentage
- Cost analysis

**Tax Reports**:
- Tax collected
- Tax by item
- Tax exemptions

**Refund Reports**:
- Refunds by date
- Refunds by reason
- Refund totals

**Inventory Valuation**:
- Current stock value
- Valuation by category
- Cost analysis

#### Cash Drawer

**Shift Management**:
- Open shift (with starting cash)
- Close shift (with ending cash)
- Shift history

**Cash Movements**:
- Cash in (add money)
- Cash out (remove money)
- Movement reasons
- Approval requirements

**Variance Report**:
- Expected cash vs actual
- Variance amount
- Variance reasons

#### Endpoints

**Reports**:
- `GET /api/reports/x` - X report
- `GET /api/reports/z` - Z report
- `GET /api/reports/sales` - Sales report
- `GET /api/reports/profit` - Profit report
- `GET /api/reports/tax` - Tax report
- `GET /api/reports/refunds` - Refund report
- `GET /api/reports/inventory` - Inventory valuation

**Cash Drawer**:
- `POST /api/shifts/open` - Open shift
- `POST /api/shifts/{id}/close` - Close shift
- `POST /api/shifts/{id}/cash-in` - Cash in
- `POST /api/shifts/{id}/cash-out` - Cash out
- `GET /api/shifts/{id}/variance` - Variance report

#### Deliverables Checklist

- [ ] X report working
- [ ] Z report working
- [ ] Sales reports working
- [ ] Profit reports working
- [ ] Tax reports working
- [ ] Refund reports working
- [ ] Inventory valuation report
- [ ] Shift open/close working
- [ ] Cash in/out working
- [ ] Variance calculation
- [ ] Report export (PDF/Excel)

---

### STEP 15: Hardening

**Objective**: Production readiness - security, testing, documentation.

#### Security Hardening

1. **Rate Limiting**
   - Per endpoint
   - Per IP
   - Per user
   - Configurable limits

2. **Input Validation**
   - All inputs validated
   - SQL injection prevention (Laravel ORM)
   - XSS prevention
   - CSRF protection

3. **Authentication**
   - Token expiration
   - Refresh tokens
   - Secure token storage

4. **Authorization**
   - All endpoints protected
   - Policies enforced
   - Role-based access

5. **Security Headers**
   - CORS configuration
   - HTTPS enforcement
   - Security headers (HSTS, etc.)

#### Audit Completeness

- All financial transactions logged
- All stock movements logged
- All user actions logged
- Immutable audit logs
- Audit log retention policy

#### Device Enforcement

- Device registration required
- Device status checking
- Disabled device blocking
- Device activity logging

#### Testing

**Unit Tests**:
- Business logic
- Calculations
- Validations

**Integration Tests**:
- API endpoints
- Database operations
- Authentication flows

**E2E Tests**:
- POS flow
- Order creation
- Payment processing
- Offline sync

**Performance Tests**:
- Load testing
- Stress testing
- Database query optimization

#### Documentation

1. **API Documentation**
   - OpenAPI/Swagger spec
   - Endpoint descriptions
   - Request/response examples

2. **User Guides**
   - Cashier manual
   - Manager guide
   - Admin guide
   - Customer portal guide

3. **Developer Documentation**
   - Setup guide
   - Architecture overview
   - Code structure
   - Contributing guidelines

4. **Deployment Guide**
   - Production setup
   - Environment configuration
   - Database migration
   - Backup procedures

#### Backup & Restore

- Automated daily backups
- Backup retention (30 days)
- Test restore procedures
- Offsite backup storage
- Point-in-time recovery

#### Deliverables Checklist

- [ ] Rate limiting configured
- [ ] Input validation complete
- [ ] Security headers set
- [ ] Audit logging complete
- [ ] Device enforcement working
- [ ] Unit tests written (80%+ coverage)
- [ ] Integration tests written
- [ ] E2E tests written
- [ ] API documentation complete
- [ ] User guides written
- [ ] Developer docs complete
- [ ] Deployment guide written
- [ ] Backup automation working
- [ ] Restore tested
- [ ] Performance optimized
- [ ] Security audit passed

---

### STEP 16: Promotions & Discounts System

**Objective**: Implement comprehensive promotion and discount management system.

#### Database Schema

**promotions** table:
- id, name, description
- type (percentage, fixed, buy_x_get_y, combo)
- discount_value, minimum_purchase
- applicable_items (JSON), applicable_categories
- customer_eligibility (all, new, vip)
- usage_limit_per_customer, usage_limit_total
- start_date, end_date
- is_active, promo_code (optional)

**promo_codes** table:
- id, promotion_id, code (unique)
- usage_count, max_usage
- expires_at

#### Features

1. **Promotion Types**:
   - Percentage discount (e.g., 20% off)
   - Fixed amount discount (e.g., $5 off)
   - Buy X Get Y free
   - Combo deals (bundle pricing)
   - Happy hour (time-based pricing)

2. **Promotion Rules**:
   - Minimum purchase requirement
   - Applicable to specific items/categories
   - Customer eligibility rules
   - Usage limits
   - Validity periods

3. **Promo Codes**:
   - Generate unique codes
   - Track usage
   - Expiry management

#### Endpoints

- `GET /api/promotions` - List active promotions
- `POST /api/promotions` - Create promotion (admin)
- `POST /api/promotions/{id}/apply` - Apply promotion to order
- `POST /api/promo-codes/validate` - Validate promo code
- `GET /api/promotions/{id}/usage` - Get promotion usage stats

#### POS Integration

- Show applicable promotions in cart
- Auto-apply best promotion
- Manual promotion selection
- Show savings amount

#### Deliverables Checklist

- [ ] Promotions table created
- [ ] Promotion CRUD working
- [ ] Promotion application logic
- [ ] Promo code system working
- [ ] POS integration complete
- [ ] Usage tracking working
- [ ] Promotion reports working

---

### STEP 17: Multi-Language Support

**Objective**: Implement multi-language support for Dhivehi, English, and other languages.

#### Implementation

1. **Backend Localization**:
   - Use Laravel localization
   - Language files for all text
   - Database translations for menu items

2. **Frontend Localization**:
   - React i18n library (react-i18next)
   - Language switcher component
   - Persist language preference

3. **Menu Items**:
   - Store translations in database
   - `item_translations` table:
     - item_id, locale, name, description

4. **Receipts**:
   - Generate receipts in customer's language
   - Multi-language receipt templates

#### Database Schema

**item_translations** table:
- id, item_id, locale (dv, en, ar, hi)
- name, description

**language_preferences** table:
- user_id/customer_id, preferred_language

#### Features

- Language switcher in UI
- Customer language preference
- Menu items in multiple languages
- Receipts in customer's language
- RTL support for Arabic

#### Deliverables Checklist

- [ ] Language files created (Dhivehi, English)
- [ ] Menu item translations working
- [ ] Language switcher in UI
- [ ] Receipts in multiple languages
- [ ] Customer language preference
- [ ] RTL support (if Arabic added)

---

### STEP 18: Payment Gateway Integration

**Objective**: Integrate payment gateways for card and digital wallet payments.

#### Payment Gateways

1. **Stripe Integration**:
   - Card payments
   - Digital wallets (Apple Pay, Google Pay)
   - Refund processing

2. **Local Payment Gateways** (Maldives):
   - Research local providers
   - Bank integration if available

3. **Payment Methods**:
   - Credit/debit cards
   - Digital wallets
   - QR code payments (if supported)

#### Database Schema

**payment_gateways** table:
- id, name, type, config (encrypted JSON)
- is_active, is_default

**payment_transactions** table:
- id, order_id, gateway_id
- transaction_id, amount, status
- gateway_response (JSON)
- processed_at

#### Implementation

1. **Payment Processing**:
   - Create payment intent
   - Process payment
   - Handle webhooks
   - Refund processing

2. **Security**:
   - PCI compliance considerations
   - Tokenization (don't store card numbers)
   - Secure API keys storage

#### Endpoints

- `POST /api/payments/process` - Process payment
- `POST /api/payments/refund` - Process refund
- `GET /api/payments/{id}` - Get payment status
- `POST /api/payments/webhook` - Payment webhook

#### Deliverables Checklist

- [ ] Payment gateway configured
- [ ] Card payment processing working
- [ ] Digital wallet support
- [ ] Refund processing working
- [ ] Webhook handling
- [ ] Payment security implemented
- [ ] Payment transaction logging

---

### STEP 19: Dashboard & KPIs

**Objective**: Create real-time dashboard with key performance indicators.

#### Dashboard Features

1. **Real-time Metrics**:
   - Today's sales
   - Orders in progress
   - Table occupancy
   - Low stock alerts
   - Active staff

2. **KPIs**:
   - Revenue (daily, weekly, monthly)
   - Average order value
   - Items sold
   - Customer count
   - Profit margin
   - Table turnover rate

3. **Visualizations**:
   - Sales charts (line, bar)
   - Revenue trends
   - Category performance
   - Hourly sales patterns

#### Endpoints

- `GET /api/dashboard/overview` - Dashboard summary
- `GET /api/dashboard/sales` - Sales data
- `GET /api/dashboard/kpis` - KPI metrics
- `GET /api/dashboard/alerts` - System alerts

#### Frontend

- Real-time dashboard (WebSocket or polling)
- Charts using Chart.js or Recharts
- Responsive design
- Auto-refresh

#### Deliverables Checklist

- [ ] Dashboard API endpoints working
- [ ] Real-time metrics displayed
- [ ] KPI calculations correct
- [ ] Charts and visualizations working
- [ ] Dashboard UI responsive
- [ ] Auto-refresh implemented

---

### STEP 20: Recipe Costing & Menu Engineering

**Objective**: Calculate recipe costs and provide menu engineering insights.

#### Recipe Costing

1. **Cost Calculation**:
   - Ingredient costs from purchases
   - Labor cost allocation
   - Overhead allocation
   - Total cost per item

2. **Margin Analysis**:
   - Gross margin per item
   - Contribution margin
   - Margin percentage

#### Menu Engineering

1. **Profitability Matrix**:
   - High popularity, high profit (Stars)
   - High popularity, low profit (Plow Horses)
   - Low popularity, high profit (Puzzles)
   - Low popularity, low profit (Dogs)

2. **Recommendations**:
   - Items to promote
   - Items to remove
   - Price optimization suggestions

#### Database Schema

**recipe_costs** table:
- id, item_id, ingredient_cost
- labor_cost, overhead_cost
- total_cost, calculated_at

**menu_engineering** table:
- id, item_id, popularity_score
- profitability_score, category
- recommendation, last_calculated

#### Endpoints

- `GET /api/items/{id}/cost` - Get item cost
- `POST /api/recipes/calculate-costs` - Recalculate all costs
- `GET /api/menu-engineering` - Get menu engineering matrix
- `GET /api/menu-engineering/recommendations` - Get recommendations

#### Deliverables Checklist

- [ ] Recipe costing calculation working
- [ ] Cost tracking per item
- [ ] Margin analysis working
- [ ] Menu engineering matrix
- [ ] Recommendations generated
- [ ] Cost reports working

---

### STEP 21: Low Stock Alerts & Auto-Reorder

**Objective**: Implement stock alerts and automatic reorder suggestions.

#### Alert System

1. **Alert Types**:
   - Low stock warning
   - Critical stock alert
   - Out of stock notification
   - Expiry date warnings

2. **Alert Channels**:
   - Dashboard alerts
   - Email notifications
   - SMS notifications (optional)
   - In-app notifications

#### Auto-Reorder Logic

1. **Reorder Point Calculation**:
   - Based on average daily usage
   - Lead time consideration
   - Safety stock buffer

2. **Reorder Suggestions**:
   - Suggested quantity
   - Recommended supplier
   - Estimated cost

#### Database Schema

**stock_alerts** table:
- id, inventory_item_id, alert_type
- threshold, current_stock
- is_active, notified_at

**reorder_suggestions** table:
- id, inventory_item_id
- suggested_quantity, recommended_supplier_id
- estimated_cost, generated_at

#### Endpoints

- `GET /api/inventory/alerts` - Get active alerts
- `GET /api/inventory/reorder-suggestions` - Get reorder suggestions
- `POST /api/inventory/{id}/set-reorder-point` - Set reorder point
- `POST /api/inventory/generate-suggestions` - Generate suggestions

#### Deliverables Checklist

- [ ] Stock alert system working
- [ ] Alert notifications (email/dashboard)
- [ ] Reorder point calculation
- [ ] Auto-reorder suggestions
- [ ] Supplier recommendations
- [ ] Expiry date tracking
- [ ] Alert management UI

---

### STEP 22: Tax Compliance & Reporting

**Objective**: Implement tax compliance features for Maldives (GST/VAT).

#### Tax Management

1. **Tax Configuration**:
   - Multiple tax rates
   - Tax-exempt items
   - Tax-inclusive vs tax-exclusive pricing
   - Tax categories

2. **Tax Calculation**:
   - Automatic tax calculation
   - Tax per item
   - Tax on discounts
   - Tax rounding rules

#### Tax Reporting

1. **Reports**:
   - Tax collected by period
   - Tax by item/category
   - Tax exemptions
   - Tax filing exports

2. **Compliance**:
   - Tax certificate generation
   - Audit trail for tax
   - Receipt tax information
   - Sequential receipt numbering

#### Database Schema

**tax_rates** table:
- id, name, rate, type (GST, VAT)
- is_active, effective_from, effective_to

**tax_exemptions** table:
- id, item_id, reason, exempt_from

**tax_reports** table:
- id, period_start, period_end
- total_tax_collected, tax_by_category (JSON)
- generated_at

#### Endpoints

- `GET /api/tax/rates` - Get tax rates
- `POST /api/tax/calculate` - Calculate tax for order
- `GET /api/tax/reports` - Get tax reports
- `POST /api/tax/export` - Export tax data

#### Deliverables Checklist

- [ ] Tax rates configured
- [ ] Tax calculation working
- [ ] Tax-exempt items support
- [ ] Tax reporting working
- [ ] Tax export functionality
- [ ] Receipt tax compliance
- [ ] Tax audit trail

---

### High Priority Features (Phase 2-3)

> **Note**: Detailed implementation steps for Steps 23-31 (Loyalty Program, Customer Analytics, Gift Cards, etc.) are documented in [ENHANCEMENTS_AND_MISSING_FEATURES.md](ENHANCEMENTS_AND_MISSING_FEATURES.md). These features should be implemented after the core system and critical enhancements are complete.

**Quick Reference for High Priority Features**:

- **Step 23**: Loyalty Program - Points system, tiers, rewards
- **Step 24**: Customer Analytics - CLV, visit frequency, segmentation
- **Step 25**: Order Status Notifications - SMS/Email/Push notifications
- **Step 26**: Customer Preferences & Notes - Allergies, regular orders
- **Step 27**: Gift Cards - Issuance, payment acceptance, balance management
- **Step 28**: Combo Deals - Bundle creation, pricing, POS integration
- **Step 29**: Advanced Sales Analytics - Trends, forecasting, item performance
- **Step 30**: Expense Tracking - Expense categories, reporting, budgeting
- **Step 31**: Export & Accounting Integration - QuickBooks, Xero, CSV exports

### Medium Priority Features (Phase 4+)

> **Note**: Steps 32-37 are documented in [ENHANCEMENTS_AND_MISSING_FEATURES.md](ENHANCEMENTS_AND_MISSING_FEATURES.md). Implement based on business needs.

**Quick Reference for Medium Priority Features**:

- **Step 32**: Table Reservations - Booking system, calendar management
- **Step 33**: Staff Scheduling & Time Tracking - Shift management, attendance
- **Step 34**: Waste & Spoilage Tracking - Waste recording, cost analysis
- **Step 35**: Order Modifications After Placement - Time limits, approval workflow
- **Step 36**: Waitlist Management - Queue system, notifications
- **Step 37**: Inventory Count Reconciliation - Count process, variance analysis

---

## Technical Specifications

### Database Schema Details

#### Key Indexes

**Performance Critical**:
- `orders.created_at` - For date range queries
- `orders.status` - For filtering active orders
- `order_items.order_id` - For order details
- `stock_movements.item_id, created_at` - For stock history
- `audit_logs.user_id, created_at` - For audit queries

#### Soft Deletes

Use soft deletes on:
- `users`
- `items`
- `orders`
- `customers`
- `suppliers`

#### Data Retention

- **Orders**: Keep indefinitely (or configurable)
- **Audit Logs**: 1 year minimum
- **Print Jobs**: 30 days
- **OTP Verifications**: 24 hours

### API Design Principles

1. **RESTful Conventions**
   - Use HTTP methods correctly
   - Resource-based URLs
   - Status codes appropriately

2. **Response Format**
   ```json
   {
     "data": {...},
     "meta": {...},
     "errors": [...]
   }
   ```

3. **Pagination**
   - Use Laravel pagination
   - Default 15 items per page
   - Configurable per endpoint

4. **Error Handling**
   - Consistent error format
   - Appropriate HTTP status codes
   - Error messages in response

### Frontend Architecture

#### State Management

**Option 1**: React Context + useReducer (simpler)
**Option 2**: Zustand (lightweight)
**Option 3**: Redux Toolkit (if complex state needed)

**Recommendation**: Start with Context, migrate if needed.

#### API Client

Create shared API client:
- Axios instance
- Request interceptors (auth token)
- Response interceptors (error handling)
- Retry logic for failed requests

#### Offline Queue

**Implementation**:
- IndexedDB for storage
- Queue manager service
- Auto-sync on connection restore
- Manual sync trigger
- Conflict resolution

### Print Proxy Architecture

#### Print Job Flow

1. Laravel creates print job
2. Sends to print-proxy via HTTP
3. Print-proxy queues job
4. Renders ESC/POS
5. Sends to printer via TCP
6. Updates status
7. Reports back to Laravel

#### Error Handling

- Connection failures → Retry queue
- Printer offline → Queue and alert
- Print failures → Dead letter queue
- Manual retry endpoint

---

## Development Workflow

### Git Workflow

**Branch Strategy**:
- `main` - Production-ready code
- `develop` - Integration branch
- `feature/*` - Feature branches
- `fix/*` - Bug fixes
- `step-*` - Step implementation branches

**Commit Convention**:
```
feat: Add order creation endpoint
fix: Fix PIN login rate limiting
docs: Update API documentation
test: Add order creation tests
```

### Code Standards

**PHP**:
- PSR-12 coding standard
- Laravel Pint for formatting
- Type hints where possible

**TypeScript/React**:
- ESLint configuration
- Prettier for formatting
- TypeScript strict mode

### Environment Setup

**Development**:
- Docker Compose for local services
- Hot reload for frontend
- Laravel Telescope for debugging

**Staging**:
- Production-like environment
- Test data
- Performance testing

**Production**:
- Optimized builds
- Caching enabled
- Monitoring active

---

## Testing Strategy

### Test Types

1. **Unit Tests**
   - Business logic
   - Calculations
   - Validations
   - Models

2. **Feature Tests**
   - API endpoints
   - Authentication
   - Authorization
   - Business flows

3. **Browser Tests**
   - POS flow
   - Order creation
   - Payment processing
   - Offline sync

### Test Coverage Goals

- **Backend**: 80%+ code coverage
- **Critical Paths**: 100% coverage
- **Frontend**: 70%+ coverage

### Testing Tools

- **PHPUnit** - Laravel backend tests
- **Pest** - Alternative PHP testing (optional)
- **Vitest** - Frontend unit tests
- **Playwright** - E2E browser tests

---

## Deployment Guide

### Production Checklist

**Server Setup**:
- [ ] Server provisioned (4GB+ RAM)
- [ ] PostgreSQL installed
- [ ] Redis installed
- [ ] Nginx/Apache configured
- [ ] SSL certificate installed
- [ ] Domain configured

**Application Deployment**:
- [ ] Code deployed
- [ ] Environment variables set
- [ ] Database migrated
- [ ] Composer dependencies installed
- [ ] NPM build completed
- [ ] Storage linked
- [ ] Queue workers running
- [ ] Cron jobs configured

**Monitoring**:
- [ ] Application monitoring (Sentry, etc.)
- [ ] Uptime monitoring
- [ ] Database monitoring
- [ ] Log aggregation

**Backup**:
- [ ] Automated backups configured
- [ ] Backup retention policy set
- [ ] Restore procedure tested

### Deployment Steps

1. **Prepare Server**
   ```bash
   # Install dependencies
   sudo apt update
   sudo apt install nginx postgresql redis
   ```

2. **Deploy Application**
   ```bash
   git clone repository
   cd backend
   composer install --optimize-autoloader --no-dev
   php artisan migrate --force
   php artisan config:cache
   php artisan route:cache
   php artisan view:cache
   ```

3. **Build Frontend**
   ```bash
   cd apps/pos-web
   npm install
   npm run build
   # Deploy dist/ to CDN or serve from Laravel
   ```

4. **Configure Services**
   - Nginx virtual host
   - Queue workers (Supervisor)
   - Cron jobs
   - Print proxy service

5. **Start Services**
   ```bash
   sudo systemctl start nginx
   sudo systemctl start postgresql
   sudo systemctl start redis
   sudo supervisorctl start queue-worker:*
   ```

---

## Troubleshooting

### Common Issues

**Issue**: Print proxy not connecting to printer
- **Check**: Printer IP and port
- **Check**: Network connectivity
- **Check**: Firewall rules
- **Solution**: Test TCP connection manually

**Issue**: Offline sync not working
- **Check**: Service worker registration
- **Check**: IndexedDB permissions
- **Check**: Sync queue status
- **Solution**: Clear cache and retry

**Issue**: Database connection errors
- **Check**: Database credentials
- **Check**: Database server status
- **Check**: Connection pool settings
- **Solution**: Verify .env configuration

**Issue**: Slow API responses
- **Check**: Database query performance
- **Check**: N+1 query problems
- **Check**: Cache configuration
- **Solution**: Add indexes, optimize queries

---

---

## Related Documentation

- **[PROJECT_OVERVIEW.md](PROJECT_OVERVIEW.md)** - Complete project overview and architecture
- **[ENHANCEMENTS_AND_MISSING_FEATURES.md](ENHANCEMENTS_AND_MISSING_FEATURES.md)** - Detailed feature specifications for Steps 23-37

---

**Document Version:** 1.1  
**Last Updated:** January 27, 2026  
**Status:** Planning Phase - Enhanced with Critical Features
