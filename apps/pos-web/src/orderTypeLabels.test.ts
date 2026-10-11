import { describe, expect, it } from "vitest";
import {
  isCustomerAppOrder,
  orderOriginBadge,
  orderTypeKey,
  orderTypeTone,
  posOrderTypeEmoji,
  posOrderTypeLabel,
} from "./orderTypeLabels";
import { palette } from "./theme";

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

/**
 * Owner, 2026-10-11: "add more visual colors to differentiate between order
 * type in pos". One colour per type, readable, and never the brand rust that
 * means "selected" on the till.
 */
describe("orderTypeTone", () => {
  const luminance = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const contrast = (a: string, b: string) => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };

  it("gives the till's labels and the server's slugs the same colour", () => {
    expect(orderTypeKey("Dine-in")).toBe(orderTypeKey("dine_in"));
    expect(orderTypeKey("Takeaway")).toBe(orderTypeKey("takeaway"));
    expect(orderTypeKey("Pickup")).toBe(orderTypeKey("online_pickup"));
    expect(orderTypeKey("Delivery")).toBe(orderTypeKey("delivery"));
  });

  it("gives each of the four types its own colour, apart from the brand rust", () => {
    const solids = ["dine_in", "takeaway", "online_pickup", "delivery"].map((t) => orderTypeTone(t).solid.toLowerCase());
    expect(new Set(solids).size).toBe(4);
    expect(solids).not.toContain(palette.primary.toLowerCase());
    expect(solids).not.toContain(orderTypeTone("catering").solid.toLowerCase());
  });

  it("keeps catering, wholesale and anything unknown neutral", () => {
    expect(orderTypeKey("catering")).toBe("other");
    expect(orderTypeKey("wholesale")).toBe("other");
    expect(orderTypeKey(null)).toBe("other");
  });

  it("is readable: white on the chip, the dark text on the light badge", () => {
    for (const t of ["dine_in", "takeaway", "online_pickup", "delivery", "catering"]) {
      const tone = orderTypeTone(t);
      expect(contrast("#ffffff", tone.solid), `${t} chip`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(tone.tint, tone.ink), `${t} badge`).toBeGreaterThanOrEqual(4.5);
    }
  });
});
