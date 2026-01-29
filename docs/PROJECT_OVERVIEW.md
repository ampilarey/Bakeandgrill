# Bake & Grill – Café Operating System

## Project Overview

**Project Name:** Bake & Grill – Café Operating System

**Purpose:** Build a full café system that replaces:
- Loyverse POS (Free + Pro)
- Excel-based inventory & purchasing
- Separate online ordering tools

## System Requirements

The system must support:
- Dine-in, Takeaway, and Online Pickup
- Offline-first POS
- Reliable LAN kitchen printing
- Purchasing + supplier intelligence
- Customer e-receipts and portal
- Promotions & discounts system
- Multi-language support (Dhivehi, English, and more)
- Payment gateway integration (cards, digital wallets)
- Real-time dashboard & KPIs
- Recipe costing & menu engineering
- Low stock alerts & auto-reorder
- Tax compliance & reporting
- Loyalty program
- Gift cards
- Customer analytics
- Order notifications
- Advanced reporting & analytics

## Core Principles

1. **Offline-first for POS** - Orders must work without internet
2. **Laravel is the main backend** - Laravel 12 + PHP 8.5
3. **React PWA for POS, KDS, Online Ordering**
4. **Printing handled by separate Node.js print-proxy** - ESC/POS TCP 9100
5. **Server is the source of truth** - Clients queue offline actions
6. **All money and stock operations must be auditable**
7. **Prefer simplicity and reliability over fancy UI**

## High-Level Architecture

### Laravel API
- Orders, Inventory, Purchasing, Reports, Auth
- Main backend framework: Laravel 12
- PHP version: 8.5

### React Apps (PWA)
- **POS PWA** - For cashiers
- **KDS** - Kitchen/bar display system
- **Online Ordering + Customer Portal** - Customer-facing application

### Node.js Print-Proxy
- Receives print jobs from Laravel
- Sends ESC/POS to LAN printers
- TCP port 9100

## Key Domains

1. **POS & Sales**
   - Order processing
   - Payment handling (Cash, Card, Digital Wallets, Gift Cards)
   - Payment gateway integration
   - Receipt generation
   - Split payments
   - Order modifications
   - Promotions & discounts system
   - Combo deals / meal bundles

2. **Tables & Dine-in Flow**
   - Table management
   - Dine-in order routing
   - Table reservations
   - Waitlist management
   - Table merging and splitting

3. **Kitchen Display & Printing**
   - KDS interface
   - Kitchen printer integration
   - Order status tracking
   - Real-time order updates
   - Station filtering

4. **Customers, OTP Login, E-receipts**
   - Customer authentication via OTP
   - Digital receipt delivery (SMS/Email)
   - Customer portal access
   - Customer preferences & notes
   - Allergies and dietary restrictions
   - Order history
   - Loyalty program (points, tiers, rewards)
   - Customer analytics (CLV, visit frequency)

5. **Inventory**
   - Recipe management
   - Recipe costing & menu engineering
   - Stock tracking
   - Inventory valuation
   - Low stock alerts & auto-reorder
   - Expiry date tracking
   - Waste & spoilage tracking
   - Batch/lot tracking (optional)
   - Inventory count reconciliation

6. **Purchasing & Suppliers**
   - Supplier management
   - Purchase order processing
   - Supplier intelligence (cheapest supplier, price history)
   - Receipt upload and storage
   - CSV/Excel import
   - Replaces Excel-based system

7. **Reports, Cash Drawer, Staff**
   - Financial reports (X/Z reports, sales, profit, tax)
   - Cash drawer management
   - Staff management and permissions
   - Staff scheduling & time tracking
   - Performance tracking
   - Dashboard & KPIs
   - Advanced sales analytics
   - Customer analytics
   - Expense tracking
   - Export & accounting integration

8. **Promotions & Marketing**
   - Promotion engine (percentage, fixed, buy X get Y)
   - Promo codes
   - Happy hour pricing
   - Daily specials
   - Seasonal promotions
   - Email marketing integration
   - SMS marketing
   - Social media integration (optional)

9. **Gift Cards & Loyalty**
   - Gift card issuance and management
   - Gift card payment acceptance
   - Loyalty points system
   - Tier levels (Bronze, Silver, Gold, Platinum)
   - Points redemption
   - Rewards program

10. **Multi-Language & Localization**
    - Dhivehi language support (primary)
    - English language support
    - Additional languages (Arabic, Hindi for tourism)
    - Multi-currency display (MVR, USD)
    - Exchange rate management
    - RTL support for Arabic

11. **Order Notifications & Communication**
    - Order status notifications (SMS/Email/Push)
    - Order confirmation alerts
    - Ready for pickup notifications
    - Reservation reminders
    - Multi-channel notifications

12. **Compliance & Legal**
    - Tax compliance (GST/VAT for Maldives)
    - Tax reporting and filing exports
    - Receipt compliance (required fields, sequential numbering)
    - Data privacy & GDPR compliance
    - Audit trail for all transactions
    - Data retention policies

## What NOT To Do

- ❌ Do not use browser Bluetooth printing
- ❌ Do not over-engineer table floor plans
- ❌ Do not mix backend and frontend concerns
- ❌ Do not add features not explicitly requested
- ❌ Do not break offline POS flow

## Technical Stack

### Backend
- **Framework:** Laravel 12
- **PHP Version:** 8.5
- **Database:** PostgreSQL 15+
- **Cache/Queue:** Redis 7+

### Frontend
- **Framework:** React
- **Type:** Progressive Web App (PWA)
- **Applications:**
  - POS PWA
  - KDS (Kitchen Display System)
  - Online Ordering Portal

### Printing
- **Technology:** Node.js print-proxy
- **Protocol:** ESC/POS
- **Connection:** TCP port 9100
- **Network:** LAN-based

## Architecture Principles

### Offline-First Design
- POS must function without internet connection
- Offline actions are queued locally
- Synchronization occurs when connection is restored
- Server remains the source of truth

### Separation of Concerns
- Backend (Laravel) handles business logic and data
- Frontend (React) handles user interface
- Print-proxy (Node.js) handles printer communication
- Clear boundaries between components

### Auditability
- All financial transactions must be logged
- All stock movements must be traceable
- Complete audit trail for compliance

### Reliability Over Features
- Prioritize system stability
- Simple, maintainable code
- Avoid unnecessary complexity
- Focus on core functionality

## Integration Points

1. **Laravel API ↔ React PWA**
   - RESTful API communication
   - Authentication/authorization
   - Data synchronization

2. **Laravel API ↔ Node.js Print-Proxy**
   - Print job queue
   - Print status feedback

3. **React PWA ↔ Local Storage**
   - Offline data caching
   - Action queue storage
   - Sync state management

4. **Node.js Print-Proxy ↔ LAN Printers**
   - ESC/POS protocol
   - TCP/IP connection (port 9100)
   - Print job execution

## Deployment Considerations

- Server deployment for Laravel API
- PWA deployment (can be served from Laravel or CDN)
- Node.js print-proxy deployment (LAN-accessible)
- Database setup and configuration
- Network configuration for printer access

## Future Considerations

- System designed for expansion
- Modular architecture allows feature additions
- Maintains compatibility with existing Laravel foundation
- Ready for production deployment

---

## Step-by-Step Implementation Plan

The project follows an enhanced implementation approach with critical features integrated:

### Core Steps (Original 15 Steps)
1. **Step 0** - Project Overview & Confirmation
2. **Step 1** - Monorepo + Docker Scaffold
3. **Step 2** - Database Schema + Migrations
4. **Step 3** - Staff Auth (PIN) + RBAC
5. **Step 4** - Customer OTP Auth
6. **Step 5** - Menu & Item Management
7. **Step 6** - POS PWA (MVP)
8. **Step 7** - Orders + Split Payments
9. **Step 8** - Table Management
10. **Step 9** - Printing (ESC/POS)
11. **Step 10** - KDS
12. **Step 11** - E-Receipts + Feedback
13. **Step 12** - Online Ordering + Customer Portal
14. **Step 13** - Inventory + Purchasing (Excel Replacement)
15. **Step 14** - Reports + Cash Drawer
16. **Step 15** - Hardening

### Critical Enhancements (Integrated into MVP/Phase 1)
17. **Step 16** - Promotions & Discounts System
18. **Step 17** - Multi-Language Support (Dhivehi + English)
19. **Step 18** - Payment Gateway Integration
20. **Step 19** - Dashboard & KPIs
21. **Step 20** - Recipe Costing & Menu Engineering
22. **Step 21** - Low Stock Alerts & Auto-Reorder
23. **Step 22** - Tax Compliance & Reporting

### High Priority Features (Phase 2-3)
24. **Step 23** - Loyalty Program
25. **Step 24** - Customer Analytics
26. **Step 25** - Order Status Notifications
27. **Step 26** - Customer Preferences & Notes
28. **Step 27** - Gift Cards
29. **Step 28** - Combo Deals
30. **Step 29** - Advanced Sales Analytics
31. **Step 30** - Expense Tracking
32. **Step 31** - Export & Accounting Integration

### Medium Priority Features (Phase 4+)
33. **Step 32** - Table Reservations
34. **Step 33** - Staff Scheduling & Time Tracking
35. **Step 34** - Waste & Spoilage Tracking
36. **Step 35** - Order Modifications After Placement
37. **Step 36** - Waitlist Management
38. **Step 37** - Inventory Count Reconciliation

---

## Analysis & Recommendations

### ✅ Strengths of the Plan

1. **Clear Step-by-Step Approach** - Well-structured incremental development
2. **Monorepo Architecture** - Good for code sharing and consistency
3. **Docker Setup** - Ensures consistent development environment
4. **Comprehensive Database Schema** - Covers all major domains
5. **Separation of Concerns** - Clear boundaries between components
6. **Offline-First Design** - Critical for POS reliability

### 🔧 Critical Recommendations

#### 1. **Monorepo Structure Enhancements**
- **Shared Code Library**: Create `packages/shared/` for common React components, utilities, and types
- **API Client Library**: Shared TypeScript API client for all React apps to ensure consistency
- **Version Management**: Use workspace protocol in package.json for internal dependencies
- **Build Pipeline**: Consider Turborepo or Nx for efficient builds and caching

#### 2. **Database Considerations**
- **Database Choice**: PostgreSQL is excellent (mentioned in Step 1) - recommend explicitly documenting this
- **Indexing Strategy**: Plan indexes for:
  - Orders by date, status, table_id
  - Items by barcode, SKU
  - Stock movements by item_id, date
  - Audit logs by user_id, action, timestamp
- **Soft Deletes**: Use Laravel soft deletes for critical tables (orders, items, customers) for audit trail
- **Data Retention**: Define policies for old orders, audit logs, print jobs
- **Connection Pooling**: Configure PgBouncer or similar for production

#### 3. **Offline-First Implementation Details**
- **Conflict Resolution Strategy**: Define how to handle:
  - Simultaneous edits to same order
  - Stock changes while offline
  - Price updates during offline period
- **Sync Priority**: Implement priority queue (orders > stock updates > menu sync)
- **Data Versioning**: Use timestamps or version numbers for optimistic locking
- **Sync Status UI**: Clear indicators for:
  - Last successful sync
  - Pending operations count
  - Sync errors requiring attention
- **Partial Sync**: Allow syncing critical data (menu, prices) even if full sync fails

#### 4. **Authentication & Security**
- **PIN Security**: 
  - Hash PINs (don't store plaintext)
  - Implement PIN change mechanism
  - Rate limit PIN attempts
  - Lock account after failed attempts
- **Token Management**:
  - Implement token refresh strategy
  - Set appropriate token expiration
  - Handle token refresh during offline mode
- **Device Registration**:
  - Track device fingerprints
  - Allow device revocation
  - Limit devices per user if needed
- **Session Management**: 
  - Implement session timeout for security
  - Auto-logout on inactivity (configurable per role)

#### 5. **Printing System Enhancements**
- **Error Handling**:
  - Retry logic with exponential backoff
  - Dead letter queue for failed prints
  - Manual retry mechanism in UI
- **Printer Health Monitoring**:
  - Health check endpoint per printer
  - Alert when printer is offline
  - Queue management when printer is down
- **Fallback Mechanisms**:
  - Queue prints when printer unavailable
  - Manual print trigger from KDS
  - Print to file option for debugging
- **Print Job Status**: 
  - Track print job status (queued, printing, completed, failed)
  - Allow reprint from order history
  - Print job history for troubleshooting

#### 6. **Redis Usage Clarification**
- **Document Redis Usage**:
  - Session storage (if using Redis sessions)
  - Queue backend (Laravel queues)
  - Cache for menu, prices, stock levels
  - Real-time data for KDS (WebSocket pub/sub)
  - Rate limiting storage

#### 7. **Missing Critical Components**

**Error Handling & Logging**:
- Centralized error logging (Sentry, Loggly, or Laravel Log)
- Structured logging with context
- Error alerting for critical failures
- Log rotation and retention policies

**Monitoring & Observability**:
- Health check endpoints for all services
- Application performance monitoring (APM)
- Database query monitoring
- Print proxy status monitoring
- Uptime monitoring

**Backup & Disaster Recovery**:
- Automated database backups (daily/hourly)
- Backup retention policy
- Test restore procedures
- Offsite backup storage
- Point-in-time recovery capability

**Testing Strategy**:
- Unit tests for critical business logic
- Integration tests for API endpoints
- E2E tests for POS flow
- Offline sync testing
- Print proxy testing
- Load testing for peak hours

**CI/CD Pipeline**:
- Automated testing on commits
- Staging environment deployment
- Production deployment process
- Rollback procedures
- Database migration strategy

**Localization & Internationalization**:
- Dhivehi language support (mentioned in original project)
- Multi-language menu items
- Currency formatting (MVR - Maldivian Rufiyaa)
- Date/time formatting (Maldives timezone: MVT, UTC+5)
- Number formatting

**Performance Optimization**:
- API response caching strategy
- Database query optimization
- Frontend code splitting
- Image optimization and CDN
- Lazy loading for large datasets

**Security Hardening**:
- Input validation and sanitization
- SQL injection prevention (Laravel ORM handles this)
- XSS prevention
- CSRF protection
- API rate limiting per endpoint
- CORS configuration
- HTTPS enforcement
- Security headers

**Payment Processing** (if applicable):
- PCI compliance considerations
- Payment gateway integration (if not cash-only)
- Payment method validation
- Refund processing security

#### 8. **Data Migration Considerations**
- **From Loyverse**: Plan for exporting data (if possible)
- **From Excel**: CSV import functionality (mentioned in Step 13)
- **Data Validation**: Ensure data integrity during import
- **Rollback Plan**: Ability to revert migrations if issues occur

#### 9. **Development Workflow**
- **Environment Variables**: Document all required .env variables
- **Local Development**: Docker Compose setup for easy onboarding
- **Code Standards**: ESLint, Prettier, PHP CS Fixer configurations
- **Git Workflow**: Branch strategy, commit conventions
- **Documentation**: Inline code documentation, API documentation

#### 10. **Production Readiness Checklist**
- Environment configuration
- Database optimization
- Caching strategy
- Queue workers configuration
- Logging setup
- Monitoring setup
- Backup automation
- SSL certificates
- Domain configuration
- Performance testing
- Security audit
- User training materials

### 📋 Additional Considerations

#### Business Logic Clarifications Needed:
1. **Discounts**: 
   - Maximum discount percentage per role
   - Manager approval required threshold
   - Discount types (percentage, fixed amount, item-level)

2. **Refunds**:
   - Time limit for refunds
   - Manager approval requirements
   - Partial refunds support
   - Refund to original payment method

3. **Stock Management**:
   - Negative stock allowed? (backorders)
   - Low stock alerts
   - Automatic reorder triggers
   - Stock valuation method (FIFO, LIFO, Average)

4. **Tax Handling**:
   - Tax rates (GST/VAT in Maldives)
   - Tax-inclusive vs tax-exclusive pricing
   - Tax exemptions
   - Tax reporting

5. **Multi-Currency**:
   - Support for USD (common in Maldives tourism)
   - Exchange rate management
   - Currency conversion at checkout

6. **Order Modifications**:
   - Can items be removed after order placed?
   - Can items be added to existing order?
   - Modification time limits
   - Modification audit trail

#### Technical Decisions Needed:
1. **Real-time Updates**: 
   - WebSockets for KDS updates?
   - Polling fallback?
   - Server-Sent Events (SSE) alternative?

2. **File Storage**:
   - Image storage (local, S3, CDN)
   - Receipt PDF storage
   - Purchase receipt storage

3. **Queue System**:
   - Laravel queues for async jobs
   - Queue driver (Redis, Database)
   - Failed job handling

4. **API Versioning**:
   - Version strategy (URL, header)
   - Backward compatibility policy

5. **PWA Features**:
   - Service worker update strategy
   - Offline asset caching
   - Background sync API usage

### 🎯 Implementation Priority Recommendations

**Phase 1 (MVP - Core POS + Critical Features)**:
- Steps 1-7: Foundation + Basic POS functionality
- Steps 16-22: Critical enhancements (Promotions, Multi-language, Payment Gateway, Dashboard, Recipe Costing, Low Stock Alerts, Tax Compliance)
- Critical for immediate business needs and competitive system

**Phase 2 (Operations + Customer Experience)**:
- Steps 8-10: Tables, Printing, KDS
- Steps 23-28: High priority customer features (Loyalty, Analytics, Notifications, Preferences, Gift Cards, Combo Deals)
- Essential for daily operations and customer retention

**Phase 3 (Business Intelligence)**:
- Steps 13-14: Inventory, Purchasing, Reports
- Steps 29-31: Advanced analytics and integrations
- Replaces Excel workflows and provides business insights

**Phase 4 (Operational Excellence)**:
- Steps 32-37: Medium priority features (Reservations, Scheduling, Waste Tracking, etc.)
- Enhances operational efficiency

**Phase 5 (Production Hardening)**:
- Step 15: Security, Testing, Documentation
- Production readiness and ongoing maintenance

### 📝 Documentation Requirements

1. **API Documentation**: OpenAPI/Swagger specification
2. **Database Schema**: ERD diagrams
3. **Architecture Diagrams**: System architecture, data flow
4. **User Guides**: 
   - Cashier training manual
   - Manager/admin guide
   - Customer portal guide
5. **Developer Documentation**:
   - Setup guide
   - Contributing guidelines
   - Code architecture
6. **Deployment Guide**: Production deployment steps
7. **Troubleshooting Guide**: Common issues and solutions

---

## Related Documentation

- **[IMPLEMENTATION_GUIDE.md](IMPLEMENTATION_GUIDE.md)** - Detailed step-by-step implementation guide
- **[ENHANCEMENTS_AND_MISSING_FEATURES.md](ENHANCEMENTS_AND_MISSING_FEATURES.md)** - Comprehensive list of missing features and enhancements to make the system complete

---

**Document Version:** 1.1  
**Last Updated:** January 27, 2026  
**Status:** Planning Phase - Enhanced with Recommendations
