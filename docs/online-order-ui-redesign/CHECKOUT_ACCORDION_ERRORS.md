# Checkout Accordion Error Mapping

When form validation or API errors occur at checkout, the relevant accordion is
automatically force-opened so the user immediately sees the problem without having
to guess which section to expand.

The mapping is implemented as `ERROR_TO_ACCORDION` in
`apps/online-order-web/src/pages/CheckoutPage.tsx`, applied via a `useEffect`
that watches `errors`, `zoneError`, `promoError`, `giftCardError`,
`friendReferralError`, and `globalError`.

## Field error → accordion id

| `errors` field key | Accordion id | Notes |
|---|---|---|
| `address_line1` | `fulfillment` | Street address for delivery |
| `island` | `fulfillment` | Island / atoll for delivery |
| `contact_name` | `fulfillment` | Recipient name for delivery |
| `contact_phone` | `fulfillment` | Recipient phone for delivery |

## Banner error → accordion id

| Error variable | Accordion id | Notes |
|---|---|---|
| `zoneError` | `fulfillment` | Zone eligibility check on island blur |
| `promoError` | `discounts` | Promo code invalid/expired |
| `giftCardError` | `discounts` | Gift card invalid/empty |
| `friendReferralError` | `discounts` | Friend referral code invalid |
| `globalError` | *(none)* | Sign-in or submission error — shown as banner in `StickyCtaBar.above` |

## Priority

Field errors take priority over banner errors. If multiple field errors exist,
the first match in `ERROR_TO_ACCORDION` key order wins. `zoneError` is checked
next, then promo/gift-card/referral errors.
