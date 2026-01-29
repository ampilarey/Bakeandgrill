# Bake & Grill - Testing Plan

**Version:** 1.0  
**Last Updated:** January 27, 2026  
**Purpose:** Comprehensive testing strategy for all 37 steps

---

## Testing Philosophy

1. **Test After Each Step** - Verify functionality immediately
2. **Manual + Automated** - Both are important
3. **Offline Testing** - Critical for POS reliability
4. **Real Device Testing** - Test on actual tablets/devices
5. **Load Testing** - Simulate peak hours

---

## Step-by-Step Testing Guide

### STEP 1: Monorepo + Docker Scaffold

**Manual Tests:**
```bash
# Test Docker services
docker-compose up -d
docker-compose ps  # All services should be "Up"

# Test backend health
curl http://localhost:8000/api/health
# Expected: {"status":"ok","timestamp":"...","version":"1.0.0"}

# Test print-proxy health
curl http://localhost:3000/health
# Expected: {"status":"ok","timestamp":"...","version":"1.0.0"}

# Test React apps start
cd apps/pos-web && npm run dev  # Should start on port 3001
cd apps/kds-web && npm run dev  # Should start on port 3002
cd apps/online-order-web && npm run dev  # Should start on port 3003
```

**Checklist:**
- [ ] All Docker containers running
- [ ] PostgreSQL accepting connections
- [ ] Redis responding to commands
- [ ] Backend health endpoint returns 200
- [ ] Print-proxy health endpoint returns 200
- [ ] All React apps compile without errors

---

### STEP 2: Database Schema + Migrations

**Manual Tests:**
```bash
cd backend

# Run migrations
php artisan migrate:fresh --seed

# Check tables created
php artisan tinker
>>> DB::table('roles')->count();  # Should be 4
>>> DB::table('users')->count();  # Should be 4
>>> DB::table('printers')->count();  # Should be 3
>>> DB::table('restaurant_tables')->count();  # Should be 20
>>> DB::table('items')->count();  # Should be 6
```

**Automated Tests:**
```bash
# Test migrations can rollback
php artisan migrate:rollback
php artisan migrate

# Test seeders
php artisan db:seed --class=DatabaseSeeder
```

**Checklist:**
- [ ] All migrations run without errors
- [ ] All tables created with correct columns
- [ ] Foreign keys working
- [ ] Seeders create data successfully
- [ ] Demo users exist with PIN 1234
- [ ] Sample menu items created
- [ ] Printers seeded (.50, .51, .52)
- [ ] Tables seeded (T1-T20)

---

### STEP 3: Staff Auth (PIN) + RBAC

**API Tests:**
```bash
# Test PIN login
curl -X POST http://localhost:8000/api/auth/staff/pin-login \
  -H "Content-Type: application/json" \
  -d '{"pin":"1234","device_id":"test-device-001"}'

# Expected response with token

# Save the token, then test /auth/me
TOKEN="your-token-here"
curl http://localhost:8000/api/auth/me \
  -H "Authorization: Bearer $TOKEN"

# Test logout
curl -X POST http://localhost:8000/api/auth/logout \
  -H "Authorization: Bearer $TOKEN"
```

**Test Scenarios:**
1. **Valid PIN** - Should return token
2. **Invalid PIN** - Should return error
3. **Rate limiting** - Try 6 wrong PINs, should block
4. **Disabled device** - Should reject
5. **Token revocation** - Logout should invalidate token

**Checklist:**
- [ ] PIN login works with correct PIN
- [ ] PIN login fails with wrong PIN
- [ ] Rate limiting blocks after 5 failed attempts
- [ ] /auth/me returns user info
- [ ] Logout revokes token
- [ ] Device registration works
- [ ] Disabled devices are rejected

---

### STEP 4: Customer OTP Auth

**API Tests:**
```bash
# Request OTP
curl -X POST http://localhost:8000/api/auth/customer/otp/request \
  -H "Content-Type: application/json" \
  -d '{"phone":"+9607001234"}'

# Check logs for OTP code (development)
# Then verify OTP
curl -X POST http://localhost:8000/api/auth/customer/otp/verify \
  -H "Content-Type: application/json" \
  -d '{"phone":"+9607001234","otp":"123456"}'

# Test customer endpoints with token
TOKEN="customer-token-here"
curl http://localhost:8000/api/customer/me \
  -H "Authorization: Bearer $TOKEN"

curl http://localhost:8000/api/customer/orders \
  -H "Authorization: Bearer $TOKEN"
```

**Test Scenarios:**
1. **Valid phone** - Should send OTP
2. **Invalid phone format** - Should reject
3. **Rate limiting** - Max 3 OTP requests per hour
4. **OTP expiry** - OTP expires after 10 minutes
5. **Wrong OTP** - Max 5 attempts
6. **Customer creation** - New customer created on verify
7. **Existing customer** - Updates existing customer

**Checklist:**
- [ ] OTP request works
- [ ] OTP code generated (check logs)
- [ ] OTP verify works with correct code
- [ ] OTP verify fails with wrong code
- [ ] Rate limiting on OTP request (3/hour)
- [ ] Rate limiting on OTP verify (5 attempts)
- [ ] OTP expires after 10 minutes
- [ ] Customer created/updated
- [ ] Token returned on successful verify
- [ ] /customer/me works
- [ ] /customer/orders works

---

### STEP 5: Menu & Item Management

**API Tests:**
```bash
# Get all categories
curl http://localhost:8000/api/categories

# Get items
curl http://localhost:8000/api/items

# Get specific item
curl http://localhost:8000/api/items/1

# Barcode lookup
curl http://localhost:8000/api/items/barcode/1001

# Create item (with auth)
curl -X POST http://localhost:8000/api/items \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "category_id": 1,
    "name": "New Item",
    "price": 50.00,
    "sku": "TEST-001"
  }'
```

**Test Scenarios:**
1. **Category CRUD** - Create, read, update, delete
2. **Item CRUD** - Full CRUD operations
3. **Variant management** - Add/edit variants
4. **Modifier management** - Add/edit modifiers
5. **Barcode lookup** - Find item by barcode
6. **Enable/disable items** - Toggle availability
7. **Image upload** - Upload item images
8. **Price levels** - Multiple pricing (regular, happy hour)

**Checklist:**
- [ ] List categories works
- [ ] List items works
- [ ] Get item details works
- [ ] Barcode lookup works
- [ ] Create item works (admin)
- [ ] Update item works (admin)
- [ ] Delete item works (soft delete)
- [ ] Variants CRUD works
- [ ] Modifiers CRUD works
- [ ] Enable/disable items works
- [ ] Image upload works
- [ ] Price levels work

---

### STEP 6: POS PWA (MVP)

**Manual Tests:**

**PIN Login:**
1. Open http://localhost:3001
2. Enter PIN: 1234
3. Should see POS interface

**Category/Item Selection:**
1. See category grid
2. Click category
3. See items in that category
4. Click item
5. Item added to cart

**Modifiers:**
1. Click item with modifiers
2. Modifier modal appears
3. Select modifiers
4. Add to cart with modifiers

**Cart:**
1. View cart sidebar
2. Change quantities
3. Remove items
4. See totals update

**Barcode:**
1. Focus barcode input (or click barcode button)
2. Type/scan barcode: 1001
3. Item should be added to cart

**Order Types:**
1. Select Dine-in
2. Select Takeaway
3. Select Online Pickup

**Offline Mode:**
1. Disable network (Developer Tools → Network → Offline)
2. Create order
3. Should queue in IndexedDB
4. See sync indicator showing "Offline"
5. Enable network
6. Should auto-sync

**Checklist:**
- [ ] PIN login screen works
- [ ] Categories display correctly
- [ ] Items display with images
- [ ] Click item adds to cart
- [ ] Modifiers modal works
- [ ] Cart shows all items
- [ ] Quantity changes work
- [ ] Remove from cart works
- [ ] Totals calculate correctly
- [ ] Barcode input works
- [ ] Order type selection works
- [ ] Offline queue works (IndexedDB)
- [ ] Sync indicator shows status
- [ ] Auto-sync on reconnect
- [ ] PWA installable

---

### STEP 7: Orders + Split Payments

**API Tests:**
```bash
# Create order
curl -X POST http://localhost:8000/api/orders \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Device-Identifier: POS-001" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "takeaway",
    "device_identifier": "POS-001",
    "items": [
      {
        "item_id": 1,
        "variant_id": null,
        "quantity": 2,
        "modifiers": [1, 2]
      }
    ]
  }'

# Hold order
curl -X POST http://localhost:8000/api/orders/1/hold \
  -H "Authorization: Bearer $TOKEN"

# Resume order
curl -X POST http://localhost:8000/api/orders/1/resume \
  -H "Authorization: Bearer $TOKEN"

# Payments (split)
curl -X POST http://localhost:8000/api/orders/1/payments \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "payments": [
      {"method": "cash", "amount": 50.00},
      {"method": "card", "amount": 30.00}
    ],
    "print_receipt": true
  }'

# Search orders
curl "http://localhost:8000/api/orders/search?q=BG-" \
  -H "Authorization: Bearer $TOKEN"
```

**Test Scenarios:**
1. **Order creation** - Single item, multiple items
2. **Order numbering** - Sequential, daily reset
3. **Hold/resume** - Hold order, resume later
4. **Split payments** - Multiple payment methods
5. **Search** - By order number, table, phone
6. **Manager reopen** - Reopen completed order

**Checklist:**
- [ ] Create order works
- [ ] Order number generated correctly
- [ ] Hold order works
- [ ] Resume order works
- [ ] Split payment works
- [ ] Payment validation works
- [ ] Search orders works
- [ ] Manager can reopen orders
- [ ] Order totals correct
- [ ] Tax calculated correctly

---

### STEP 8: Table Management

**API Tests:**
```bash
# Open table (requires device identifier)
curl -X POST http://localhost:8000/api/tables/1/open \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Device-Identifier: POS-001" \
  -H "Content-Type: application/json" \
  -d '{"items":[{"item_id":1,"name":"Burger","quantity":1}]}'

# Add items to table order (requires device identifier)
curl -X POST http://localhost:8000/api/tables/1/orders/{order_id}/items \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Device-Identifier: POS-001" \
  -H "Content-Type: application/json" \
  -d '{"items":[{"item_id":2,"name":"Fries","quantity":1}]}'

# Close table
curl -X POST http://localhost:8000/api/tables/1/close \
  -H "Authorization: Bearer $TOKEN"

# Merge tables
curl -X POST http://localhost:8000/api/tables/merge \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"source_table_id": 1, "target_table_id": 2}'

# Split bill by items
curl -X POST http://localhost:8000/api/tables/1/split \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"order_id": 10, "item_ids": [1, 2]}'

# Split bill by amount
curl -X POST http://localhost:8000/api/tables/1/split \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"order_id": 10, "amount": 50.00}'
```

**Checklist:**
- [ ] Open table changes status to occupied
- [ ] Add items to table order works
- [ ] Close table completes order
- [ ] Merge tables combines orders
- [ ] Split by items creates new order
- [ ] Split by amount divides total
- [ ] Table status updates correctly

---

### STEP 9: Printing (ESC/POS)

**Manual Tests:**

**Print-Proxy:**
```bash
# Test print endpoint
curl -X POST http://localhost:3000/print \
  -H "Content-Type: application/json" \
  -d '{
    "printer_ip": "192.168.1.50",
    "printer_port": 9100,
    "type": "kitchen",
    "data": {
      "order_number": "BG-20260127-0001",
      "items": [{"name": "Burger", "quantity": 1}]
    }
  }'
```

**Laravel Print Jobs:**
```bash
# Create print job
curl -X POST http://localhost:8000/api/orders/1/print \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"type": "kitchen", "printer_id": 1}'

# Reprint order
curl -X POST http://localhost:8000/api/orders/1/reprint \
  -H "Authorization: Bearer $TOKEN"
```

**Test Scenarios:**
1. **Kitchen print** - Print to kitchen printer
2. **Bar print** - Print to bar printer
3. **Receipt print** - Print customer receipt
4. **Retry logic** - Printer offline, should queue
5. **Reprint** - Reprint from order history

**Checklist:**
- [ ] Print job created in database
- [ ] Print-proxy receives job
- [ ] ESC/POS rendering works
- [ ] TCP connection to printer
- [ ] Print job status updates
- [ ] Retry on failure
- [ ] Reprint works
- [ ] Print queue management

---

### STEP 10: KDS (Kitchen Display System)

**Manual Tests:**
1. Open http://localhost:3002 (KDS app)
2. Create orders from POS
3. Orders should appear on KDS
4. Test bump/recall
5. Test station filtering
6. Test sound alerts

**Test Scenarios:**
1. **Live orders** - New orders appear automatically
2. **Timers** - Order age shows correctly
3. **Status updates** - Change order status
4. **Bump** - Move order to top
5. **Recall** - Bring back completed order
6. **Filtering** - Filter by station (kitchen, bar)
7. **Sound** - Alert on new order

**Checklist:**
- [ ] KDS displays active orders
- [ ] Order cards show all details
- [ ] Timers counting correctly
- [ ] Status updates work
- [ ] Bump/recall functionality
- [ ] Station filter works
- [ ] Sound alerts play
- [ ] Real-time updates (polling or WebSocket)

---

### STEP 11: E-Receipts + Feedback

**Manual Tests:**
```bash
# Send receipt (staff)
curl -X POST http://localhost:8000/api/receipts/1/send \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"channel": "email", "recipient": "guest@example.com"}'

# Visit public receipt page
# Open: http://localhost:8000/receipts/{token}

# Fetch receipt JSON
curl http://localhost:8000/api/receipts/{token}

# Resend receipt (rate limited)
curl -X POST http://localhost:8000/api/receipts/{token}/resend

# Submit feedback
curl -X POST http://localhost:8000/api/receipts/{token}/feedback \
  -H "Content-Type: application/json" \
  -d '{"rating": 5, "comments": "Great food!"}'
```

**Test Scenarios:**
1. **Receipt generation** - HTML and PDF
2. **Public access** - Token-based access
3. **SMS sending** - Send receipt via SMS
4. **Email sending** - Send receipt via email
5. **Resend limits** - Max 3 resends per day
6. **Feedback form** - Submit rating and comments

**Checklist:**
- [ ] Receipt generation works
- [ ] PDF download works
- [ ] Public receipt page loads
- [ ] SMS sending works
- [ ] Email sending works
- [ ] Resend limits enforced
- [ ] Feedback form works
- [ ] Feedback saves to database

---

### STEP 12: Online Ordering + Customer Portal

**Manual Tests:**
1. Open http://localhost:3003
2. Browse menu
3. Add items to cart
4. Enter phone number
5. Verify OTP
6. Place order
7. View order status
8. Check customer portal

**Test Scenarios:**
1. **Menu browsing** - View categories and items
2. **Cart management** - Add/remove items
3. **OTP checkout** - Login with phone
4. **Order placement** - Create online order
5. **Order tracking** - Check order status
6. **Order history** - View past orders
7. **Reorder** - Quick reorder from history

**Checklist:**
- [ ] Menu displays correctly
- [ ] Cart functionality works
- [ ] OTP login works
- [ ] Order placement successful
- [ ] Order confirmation shown
- [ ] Order status updates
- [ ] Customer portal loads
- [ ] Order history displays
- [ ] Reorder functionality works
- [ ] Responsive design on mobile

---

### STEP 13: Inventory + Purchasing

**API Tests:**
```bash
# Get inventory items
curl http://localhost:8000/api/inventory/items \
  -H "Authorization: Bearer $TOKEN"

# Stock count
curl -X POST http://localhost:8000/api/inventory/stock-count \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "counts": [
      {"inventory_item_id": 1, "quantity": 100, "notes": "Monthly count"},
      {"inventory_item_id": 2, "quantity": 50}
    ]
  }'

# Low stock alert list
curl http://localhost:8000/api/inventory/low-stock \
  -H "Authorization: Bearer $TOKEN"

# Price history
curl http://localhost:8000/api/inventory/1/price-history \
  -H "Authorization: Bearer $TOKEN"

# Cheapest supplier
curl http://localhost:8000/api/inventory/1/cheapest-supplier \
  -H "Authorization: Bearer $TOKEN"

# Create purchase
curl -X POST http://localhost:8000/api/purchases \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "supplier_id": 1,
    "purchase_date": "2026-01-27",
    "items": [
      {"inventory_item_id": 1, "name": "Beans", "quantity": 10, "unit_cost": 5.00}
    ]
  }'

# Upload purchase receipt
curl -X POST http://localhost:8000/api/purchases/1/receipts \
  -H "Authorization: Bearer $TOKEN" \
  -F "receipt=@receipt.pdf"

# Import CSV
curl -X POST http://localhost:8000/api/purchases/import \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@purchases.csv"
```

**Test Scenarios:**
1. **Recipe deduction** - Stock deducted on order
2. **Stock ledger** - All movements tracked
3. **Stock count** - Physical count entry
4. **Valuation** - Stock value calculated
5. **Supplier CRUD** - Manage suppliers
6. **Purchase entry** - Create purchase orders
7. **Receipt upload** - Upload purchase receipts
8. **Price history** - Track price changes
9. **Cheapest supplier** - Identify best prices
10. **Reorder alerts** - Low stock notifications
11. **CSV import** - Bulk import purchases

**Checklist:**
- [ ] Recipe deduction works
- [ ] Stock movements logged
- [ ] Stock count works
- [ ] Valuation calculates correctly
- [ ] Supplier CRUD works
- [ ] Purchase creation works
- [ ] Receipt upload works
- [ ] Price history tracks changes
- [ ] Cheapest supplier logic works
- [ ] Reorder point alerts
- [ ] CSV import works
- [ ] Excel import works

---

### STEP 14: Reports + Cash Drawer

**API Tests:**
```bash
# X Report (current shift)
curl http://localhost:8000/api/reports/x-report \
  -H "Authorization: Bearer $TOKEN"

# Z Report (end of day)
curl "http://localhost:8000/api/reports/z-report?from=2026-01-01&to=2026-01-27" \
  -H "Authorization: Bearer $TOKEN"

# Sales summary
curl "http://localhost:8000/api/reports/sales-summary?from=2026-01-01&to=2026-01-27" \
  -H "Authorization: Bearer $TOKEN"

# Sales breakdown
curl "http://localhost:8000/api/reports/sales-breakdown?from=2026-01-01&to=2026-01-27" \
  -H "Authorization: Bearer $TOKEN"

# Inventory valuation
curl http://localhost:8000/api/reports/inventory-valuation \
  -H "Authorization: Bearer $TOKEN"

# Open shift
curl -X POST http://localhost:8000/api/shifts/open \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"opening_cash": 500.00}'

# Close shift
curl -X POST http://localhost:8000/api/shifts/1/close \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"closing_cash": 1200.00}'
```

**Test Scenarios:**
1. **X Report** - Current shift summary
2. **Z Report** - End of day report
3. **Sales by item** - Item performance
4. **Sales by category** - Category performance
5. **Sales by employee** - Staff performance
6. **Profit & margin** - Profitability analysis
7. **Tax reports** - Tax collected
8. **Refund reports** - Refund tracking
9. **Shift open/close** - Cash drawer management
10. **Cash in/out** - Cash movements
11. **Variance** - Cash count vs expected

**Checklist:**
- [ ] X report generates correctly
- [ ] Z report generates correctly
- [ ] Sales reports accurate
- [ ] Profit calculations correct
- [ ] Tax reports correct
- [ ] Refund reports work
- [ ] Inventory valuation correct
- [ ] Shift open works
- [ ] Shift close works
- [ ] Cash in/out records
- [ ] Variance calculation correct
- [ ] Report export (PDF/Excel)

---

### STEP 15: Hardening

**Security Tests:**
```bash
# Test rate limiting
# Make 100 requests rapidly
for i in {1..100}; do
  curl http://localhost:8000/api/items
done
# Should get rate limited

# Test SQL injection (should be prevented)
curl "http://localhost:8000/api/items?search='; DROP TABLE items;--"

# Test XSS (should be sanitized)
curl -X POST http://localhost:8000/api/items \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"name": "<script>alert('xss')</script>"}'
```

**Automated Tests:**
```bash
# Run all tests
php artisan test

# Run with coverage
php artisan test --coverage --min=80
```

**Performance Tests:**
```bash
# Load testing with Apache Bench
ab -n 1000 -c 10 http://localhost:8000/api/items

# Database query optimization
php artisan telescope:prune
# Check slow queries
```

**Checklist:**
- [ ] Rate limiting active on all endpoints
- [ ] SQL injection prevented
- [ ] XSS prevented
- [ ] CSRF protection active
- [ ] Input validation complete
- [ ] All endpoints have auth
- [ ] Audit logs complete
- [ ] Device enforcement working
- [ ] Unit tests pass (80%+ coverage)
- [ ] Integration tests pass
- [ ] E2E tests pass
- [ ] Load tests pass (100+ orders/min)
- [ ] Backup automation works
- [ ] Restore procedure tested

---

## Advanced Testing

### Offline Sync Testing

**Scenario 1: POS Offline During Order**
1. Start creating order
2. Disconnect network
3. Complete order
4. Check IndexedDB - order should be queued
5. Reconnect network
6. Order should sync automatically

**Scenario 2: Price Update While Offline**
1. POS offline
2. Admin updates item price
3. POS reconnects
4. POS should sync new prices

**Scenario 3: Conflict Resolution**
1. Two devices offline
2. Both edit same item
3. Both reconnect
4. System should handle conflict

**Checklist:**
- [ ] Orders queue offline
- [ ] Sync on reconnect
- [ ] Conflict resolution works
- [ ] Data integrity maintained
- [ ] No duplicate orders
- [ ] Price updates sync correctly

---

### Real-World Testing

**Peak Hour Simulation:**
1. Create 50+ orders in 10 minutes
2. Monitor system performance
3. Check database load
4. Verify printing keeps up
5. Check KDS responsiveness

**Multi-Device Testing:**
1. Run 3 POS devices simultaneously
2. Create orders from all devices
3. Verify no conflicts
4. Check order numbering
5. Test sync between devices

**Network Failure Testing:**
1. Simulate network outages
2. Verify offline functionality
3. Test recovery on reconnect
4. Check data consistency

**Checklist:**
- [ ] Handles 100+ orders/hour
- [ ] Multiple POS devices work
- [ ] Network failure handled gracefully
- [ ] Printer failures don't block POS
- [ ] Database handles concurrent requests
- [ ] No data loss

---

## Automated Test Suites

### Unit Tests
```bash
# Test business logic
php artisan test --testsuite=Unit
```

**Coverage:**
- Order calculations
- Tax calculations
- Stock deduction logic
- Price calculations
- Discount logic
- Recipe costing

### Feature/Integration Tests
```bash
# Test API endpoints
php artisan test --testsuite=Feature
```

**Coverage:**
- Authentication flows
- CRUD operations
- Business workflows
- Database operations
- Validation rules

### E2E Tests (Playwright)
```bash
# Run browser tests
npm run test:e2e
```

**Coverage:**
- Complete POS flow
- Order creation end-to-end
- Payment processing
- Offline sync
- Multi-step workflows

---

## Testing Checklist by Domain

### 🔐 Authentication
- [ ] Staff PIN login
- [ ] Customer OTP login
- [ ] Token refresh
- [ ] Logout
- [ ] Rate limiting
- [ ] Device management

### 🍔 Menu Management
- [ ] Category CRUD
- [ ] Item CRUD
- [ ] Variants
- [ ] Modifiers
- [ ] Price levels
- [ ] Barcode lookup

### 🛒 Orders & Payments
- [ ] Order creation
- [ ] Order modifications
- [ ] Hold/resume
- [ ] Split payments
- [ ] Refunds
- [ ] Search/recall

### 🪑 Table Management
- [ ] Open/close tables
- [ ] Merge tables
- [ ] Split bills
- [ ] Table status

### 🖨️ Printing
- [ ] Kitchen tickets
- [ ] Bar tickets
- [ ] Customer receipts
- [ ] Retry on failure
- [ ] Print queue

### 📺 Kitchen Display
- [ ] Order display
- [ ] Status updates
- [ ] Timers
- [ ] Station filtering
- [ ] Sound alerts

### 📦 Inventory
- [ ] Stock tracking
- [ ] Recipe deduction
- [ ] Stock counts
- [ ] Valuation
- [ ] Alerts

### 🛍️ Purchasing
- [ ] Supplier management
- [ ] Purchase orders
- [ ] Price tracking
- [ ] CSV import

### 📊 Reports
- [ ] X/Z reports
- [ ] Sales reports
- [ ] Profit reports
- [ ] Tax reports
- [ ] Cash drawer

### 👥 Customers
- [ ] OTP login
- [ ] Order history
- [ ] Loyalty points
- [ ] E-receipts

---

## Performance Benchmarks

### Target Metrics
- **API Response Time:** < 200ms (95th percentile)
- **Order Creation:** < 500ms
- **POS Load Time:** < 3 seconds
- **Offline Queue:** Handle 100+ queued orders
- **Database:** Handle 1000+ concurrent connections
- **Print Queue:** Process 50+ jobs/minute

### Load Testing Scenarios
```bash
# 100 concurrent users
ab -n 10000 -c 100 http://localhost:8000/api/items

# Create 100 orders
# Use k6 or Artillery for complex scenarios
```

---

## Test Data

### Demo Credentials
- **Owner PIN:** 1234 (owner@bakeandgrill.mv)
- **Admin PIN:** 1234 (admin@bakeandgrill.mv)
- **Manager PIN:** 1234 (manager@bakeandgrill.mv)
- **Cashier PIN:** 1234 (cashier@bakeandgrill.mv)

### Test Devices
- **Device ID:** test-pos-001
- **Device ID:** test-kds-001
- **Device ID:** test-mobile-001

### Test Customers
- **Phone:** +9607001234 (will receive OTP)
- **Phone:** +9607005678 (for testing)

### Test Printers
- **Kitchen:** 192.168.1.50:9100
- **Bar:** 192.168.1.51:9100
- **Counter:** 192.168.1.52:9100

---

## Regression Testing

After each new feature, retest:
1. Core POS flow (order creation)
2. Authentication (staff + customer)
3. Offline sync
4. Printing
5. Reports

---

## Bug Tracking

### Critical Bugs (Block release)
- System crashes
- Data loss
- Security vulnerabilities
- Payment processing failures

### High Priority (Fix before next phase)
- Incorrect calculations
- Sync failures
- Performance issues
- UX blockers

### Medium Priority (Fix in phase)
- UI inconsistencies
- Minor bugs
- Enhancement requests

### Low Priority (Future)
- Nice-to-have features
- UI polish
- Documentation updates

---

## Test Execution Schedule

### Daily (During Development)
- Unit tests on code changes
- API endpoint tests
- Manual testing of new features

### Weekly
- Integration test suite
- E2E test suite
- Performance testing
- Security scanning

### Before Each Phase
- Full regression suite
- Load testing
- Security audit
- User acceptance testing

### Before Production
- Complete test suite
- Performance benchmarks
- Security penetration testing
- Disaster recovery drill
- Backup/restore testing

---

## Testing Tools

### Backend
- **PHPUnit** - Unit & feature tests
- **Laravel Dusk** - Browser automation (optional)
- **Pest** - Alternative testing framework

### Frontend
- **Vitest** - Unit tests
- **React Testing Library** - Component tests
- **Playwright** - E2E tests

### API
- **Postman/Insomnia** - Manual API testing
- **Newman** - Automated Postman tests

### Load Testing
- **Apache Bench (ab)** - Simple load tests
- **k6** - Advanced load testing
- **Artillery** - Complex scenarios

### Monitoring
- **Laravel Telescope** - Debug & monitor
- **Sentry** - Error tracking
- **New Relic/DataDog** - APM (production)

---

**Document Version:** 1.0  
**Status:** Ready for systematic testing  
**Next:** Begin testing Steps 1-3, then continue implementation
