import { describe, expect, it } from "vitest";
import {
  isCustomerAppOrder,
  orderOriginBadge,
  posOrderTypeEmoji,
  posOrderTypeLabel,
} from "./orderTypeLabels";

/**
 * Origin is not fulfilment.
 *
 * A cashier picking "Pickup" on the till creates type `online_pickup`
 * (mapPosOrderType in hooks/useCart.ts). So `type` cannot answer "did a
 * customer place this?" — but both the Online tab's filter and this module
 * used to try, in two different and disagreeing ways.
 */
describe("isCustomerAppOrder", () => {
  it("trusts the server's answer when it has one", () => {
    expect(isCustomerAppOrder(7, true)).toBe(true);
    expect(isCustomerAppOrder(null, false)).toBe(false);
  });

  it("does not mistake an explicit false for 'not told'", () => {
    // The trap: `if (isCustomerPlaced)` would fall through to the user-id
    // guess here and answer true, contradicting the server.
    expect(isCustomerAppOrder(null, false)).toBe(false);
  });

  it("falls back to the cashier id on a payload that predates the flag", () => {
    expect(isCustomerAppOrder(null, undefined)).toBe(true);
    expect(isCustomerAppOrder(0, undefined)).toBe(true);
    expect(isCustomerAppOrder(4, undefined)).toBe(false);
  });
});

describe("orderOriginBadge", () => {
  it("marks every ticket, whatever the fulfilment type", () => {
    // The old label only distinguished online_pickup. A customer delivery and
    // a phoned-in one both read "🛵 Delivery" with nothing between them.
    expect(orderOriginBadge(null, true).tone).toBe("online");
    expect(orderOriginBadge(4, false).tone).toBe("staff");
  });

  it("names the cashier when there is one", () => {
    const badge = orderOriginBadge(4, false, "Sara");
    expect(badge.label).toBe("Staff · Sara");
    expect(badge.title).toContain("Sara");
  });

  it("still says Staff when the name did not come through", () => {
    expect(orderOriginBadge(4, false, null).label).toBe("Staff");
  });

  it("explains itself on hover rather than relying on the word alone", () => {
    expect(orderOriginBadge(null, true).title).toBe(
      "Placed by the customer in the ordering app",
    );
  });
});

describe("posOrderTypeLabel", () => {
  it("separates a staff pickup from a customer one", () => {
    expect(posOrderTypeLabel("online_pickup", 4, false)).toBe("Pickup");
    expect(posOrderTypeLabel("online_pickup", null, true)).toBe("Online Pickup");
  });

  it("leaves the other fulfilment names alone — origin is the badge's job", () => {
    expect(posOrderTypeLabel("delivery", null, true)).toBe("Delivery");
    expect(posOrderTypeLabel("delivery", 4, false)).toBe("Delivery");
    expect(posOrderTypeLabel("dine_in", null, true)).toBe("Dine-in");
    expect(posOrderTypeLabel("takeaway", 4, false)).toBe("Takeaway");
  });

  it("returns null for a missing type rather than inventing one", () => {
    expect(posOrderTypeLabel(null)).toBeNull();
    expect(posOrderTypeLabel(undefined)).toBeNull();
  });

  it("passes an unknown type through instead of swallowing it", () => {
    expect(posOrderTypeLabel("catering", 4, false)).toBe("catering");
  });
});

describe("posOrderTypeEmoji", () => {
  it("distinguishes the two pickups", () => {
    expect(posOrderTypeEmoji("online_pickup", null, true)).toBe("📦");
    expect(posOrderTypeEmoji("online_pickup", 4, false)).toBe("🥡");
  });

  it("keeps one glyph per fulfilment type elsewhere", () => {
    expect(posOrderTypeEmoji("delivery", null, true)).toBe("🛵");
    expect(posOrderTypeEmoji("dine_in", 4, false)).toBe("🍽");
    expect(posOrderTypeEmoji("nonsense", null, null)).toBe("📋");
  });
});
