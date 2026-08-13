# Order App Desktop Footer Verification Report

## Verification Status: PARTIALLY COMPLETED

### 1. Order App Footer (http://localhost:8000/order/) ✅

**Viewport**: 1440x900 (Desktop)  
**Status**: Successfully verified  
**Screenshot**: `order-local-desktop-footer.png`

#### Footer Structure Confirmed:

✅ **5 Columns Present:**
1. **Brand Column** (Left):
   - Logo: "Bake & Grill" with icon
   - Description: "Authentic Dhivehi cuisine, artisan pastries, and expertly grilled specialties — freshly made every day in the heart of Malé."
   - Thanks message: "Thanks for choosing Bake & Grill — see you soon."
   - **WhatsApp button** (green) ✅
   - **Viber button** ❌ MISSING (BUG FOUND - see below)
   - **Orange "Order Now" CTA button** ✅

2. **Quick Links Column**:
   - Home
   - Order Online
   - Catering & Events
   - Opening Hours
   - Contact Us

3. **Opening Hours Column**:
   - Weekly schedule for all days (Sun-Sat)
   - **"Today" indicator** on Thursday ✅
   - "Full hours →" link

4. **Location Column**:
   - Address: Kalaafaanu Hingun, Malé, Maldives
   - Near H. Sahara
   - "Get directions" link

5. **Contact Column**:
   - Phone: +960 912 0011
   - Email: admin@bakeandgrill.mv
   - **Legal links**: Privacy Policy, Terms, Refund Policy ✅

✅ **Trust Strip** (payment methods):
- "BML · Cards · Cash · MVR · Delivery across Malé & Hulhumalé"

✅ **Copyright Row**:
- "© 2026 Bake & Grill. All rights reserved · Malé, Maldives"

---

### 2. Main Website Footer (http://localhost:8000/) ❌

**Status**: UNABLE TO VERIFY - Website returns HTTP 500 Internal Server Error

The main website at `localhost:8000/` is currently not functioning, returning a "500 Internal Server Error". This prevented direct visual comparison of the two footers.

**Evidence**:
```
HTTP/1.1 500 Internal Server Error
```

However, based on code inspection of `/workspace/backend/resources/views/layout.blade.php` (lines 1775-1884), the website desktop footer (`.footer-desktop`) should have the identical 5-column structure.

---

## 🐛 CRITICAL BUG DISCOVERED: Viber Button Missing in Order App

### Issue
The Order App footer is **missing the Viber button** that should appear next to WhatsApp in the brand column.

### Root Cause
The `safePublicUrl()` utility function in `/workspace/apps/online-order-web/src/utils/safePublicUrl.ts` **does not recognize `viber:` protocol URLs**.

**Current safePublicUrl implementation (lines 8-10)**:
```typescript
if (/^https?:\/\/\S+$/i.test(trimmed)) return trimmed;
if (/^(mailto|tel):\S+$/i.test(trimmed)) return trimmed;
return null;  // ← viber: and whatsapp: are rejected here
```

**BrandFooter.tsx usage (line 118)**:
```typescript
const safeViberLink = safePublicUrl(viberLink);
// Returns null for 'viber://chat?number=9609120011'
```

**Conditional rendering (lines 245-254)**:
```typescript
{safeViberLink ? (
  <a href={safeViberLink} className="footer-viber">
    <ViberIcon />
    {t('home.footer_viber')}
  </a>
) : null}
```

Since `safeViberLink` is `null`, the Viber button is never rendered.

### Inconsistency
The `isExternalHref()` function in `footerNav.ts` (line 24) **correctly** recognizes both protocols:
```typescript
return /^(https?:|mailto:|tel:|viber:|whatsapp:)/i.test(url);
```

But `safePublicUrl()` does not, causing the Viber link to be filtered out.

### Expected Behavior
- Website footer (Blade template) **correctly shows both WhatsApp and Viber** buttons
- Order App footer **should show both** but only shows WhatsApp due to this bug
- Tests expect Viber to appear (WebsiteFooterTest.php lines 117-118, 124-125)

### Fix Required
Update `safePublicUrl.ts` to accept `viber:` and `whatsapp:` protocols:

```typescript
if (/^https?:\/\/\S+$/i.test(trimmed)) return trimmed;
if (/^(mailto|tel|viber|whatsapp):\S+$/i.test(trimmed)) return trimmed;  // ← Add viber|whatsapp
return null;
```

---

## Structural Comparison (Order App vs Website)

Based on code inspection and the verified Order App footer:

| Element | Order App (Actual) | Website (Code) | Match? |
|---------|-------------------|----------------|--------|
| 5-column layout | ✅ Yes | ✅ Yes | ✅ |
| Brand column with logo | ✅ Yes | ✅ Yes | ✅ |
| Orange Order Now CTA | ✅ Yes | ✅ Yes | ✅ |
| WhatsApp button | ✅ Yes | ✅ Yes | ✅ |
| Viber button | ❌ No (BUG) | ✅ Yes | ❌ |
| Quick Links column | ✅ Yes | ✅ Yes | ✅ |
| Opening Hours with "Today" | ✅ Yes | ✅ Yes | ✅ |
| Location column | ✅ Yes | ✅ Yes | ✅ |
| Contact with legal links | ✅ Yes | ✅ Yes | ✅ |
| Trust strip | ✅ Yes | ✅ Yes | ✅ |
| Copyright row | ✅ Yes | ✅ Yes | ✅ |

**Overall**: The Order App footer **structurally matches** the website footer design, except for the **missing Viber button** due to the `safePublicUrl()` bug.

---

## Recommendations

1. **Fix the safePublicUrl bug** immediately by adding `viber|whatsapp` to the regex pattern
2. **Fix the website 500 error** to enable proper visual testing
3. **Add unit tests** for `safePublicUrl()` to cover all expected protocol types
4. **Run the WebsiteFooterTest** to verify Viber appears correctly after the fix

---

## Files Affected

- `/workspace/apps/online-order-web/src/utils/safePublicUrl.ts` (bug location)
- `/workspace/apps/online-order-web/src/components/home/BrandFooter.tsx` (uses safePublicUrl)
- `/workspace/backend/resources/views/layout.blade.php` (website footer - works correctly)

---

**Verification Date**: August 13, 2026  
**Tester**: Automated verification agent
