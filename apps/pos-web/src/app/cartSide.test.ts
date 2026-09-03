/**
 * Which side of the menu the ticket sits on.
 *
 * Owner, 2026-09-03: "can u audit right left settings in pos. I don't see
 * much difference." There was none to see. The ticket is rendered BEFORE the
 * menu in PosShellLayout, so in a flex row with no `order` it is always on
 * the left — and the only rule the setting had was `order: -1` on the
 * ticket, which is where it already was. Every till showed the ticket on the
 * left whatever the cashier picked, while the button said "Right (default)".
 *
 * The fix is to state both columns' order rather than lean on the markup, so
 * this reads the stylesheet and holds it to that. A unit test cannot lay out
 * a flex row, but it can catch the shape of the bug: an order rule for one
 * side and nothing for the other.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(__dirname, "..", "index.css"), "utf8");

/** The declarations of every rule whose selector contains `needle`. */
function rulesFor(needle: string): string[] {
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter((m) => m[1].includes(needle))
    .map((m) => m[2]);
}

function orderOf(selector: string): string[] {
  return rulesFor(selector)
    .map((body) => /(?:^|;)\s*order:\s*([^;]+)/.exec(body)?.[1]?.trim())
    .filter((v): v is string => v !== undefined);
}

describe("the ticket's side is stated, not inherited from the markup", () => {
  it("orders both columns for the default (ticket left)", () => {
    // Both, or neither works: the ticket comes first in the DOM, so a rule
    // on one column alone cannot move the other.
    expect(orderOf(".pos-main--sales .pos-cart")).toContain("0");
    expect(orderOf(".pos-main--sales .pos-menu")).toContain("1");
  });

  it("orders both columns for the choice (ticket right)", () => {
    expect(orderOf(".pos-main--cart-right .pos-cart")).toContain("1");
    expect(orderOf(".pos-main--cart-right .pos-menu")).toContain("0");
  });

  it("no longer carries the rule that did nothing", () => {
    expect(css).not.toContain("pos-main--cart-left");
  });
});
