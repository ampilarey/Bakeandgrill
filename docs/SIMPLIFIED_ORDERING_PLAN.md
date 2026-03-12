# Simplified Ordering System

## Clean, Single Flow:

### Regular Orders (Takeaway/Delivery)
1. Browse menu → Add to cart
2. Click cart → Checkout page
3. At checkout: Choose Takeaway OR Delivery
4. Fill details → Submit
5. Done!

### Event Pre-Orders (Bulk/Advance)
1. Dedicated "Event Orders" link
2. Separate form
3. Date selection
4. Bulk quantities
5. Manager approval

## Implementation:
- Main website handles everything
- One cart system (localStorage)
- Simple checkout form
- No React app complexity
- Clean separation

## Current Issues Fixed:
- Remove order type selection before browsing
- Cart works from any page
- Checkout shows cart properly
- Order type selected at checkout only
