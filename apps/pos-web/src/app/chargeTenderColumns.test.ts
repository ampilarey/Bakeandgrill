/**
 * The tender row must not depend on `:has()`.
 *
 * Owner, 2026-09-04: "again after updating when I click any amount it changes
 * to credit and get stuck" — on the iPhone, with the iPad fine throughout.
 *
 * That split was the clue. The phone stylesheet said `repeat(4)` with a
 * `.pos-charge-tenders:has(.pos-charge-credit-inline)` rule bumping it to five
 * when Credit joined the row. `:has()` needs Safari 15.4. On an older iPhone
 * the rule is simply ignored — but `.pos-charge-credit-inline` is still shown,
 * so a fifth chip went into a four-column grid.
 *
 * Measured in Chromium at 390px with every `:has()` rule stripped, which is
 * exactly what such a browser does:
 *
 *     with :has()      Credit  y233–273  x311–380   (in the row)
 *     without :has()   Credit  y279–319  x 10– 98   (wrapped, second row)
 *
 * Wrapped, Credit sits directly above the amount chips — so a tap meant for an
 * amount lands on Credit, which switches the tender and fires a credit fetch.
 * The iPad never saw it because its Safari understands `:has()`.
 *
 * The count now comes from the component, which knows how many chips it is
 * rendering. This holds the stylesheet to that: no column count in CSS, and no
 * `:has()` deciding layout on the Charge screen.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** Comments explain the history and may name the old selectors — strip them. */
const css = readFileSync(join(__dirname, "..", "index.css"), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "");

describe("Charge tender row", () => {
  it("does not use :has() to decide the column count", () => {
    expect(css).not.toMatch(/:has\(\.pos-charge-credit-inline\)/);
  });

  it("leaves grid-template-columns to the component", () => {
    // Any !important column count in CSS would beat the inline value and put
    // us straight back into the wrap.
    const rules = css.match(/\.pos-charge-tenders\s*\{[^}]*\}/g) ?? [];
    expect(rules.length, "the tender row rule went missing").toBeGreaterThan(0);
    for (const rule of rules) {
      expect(rule, `a CSS column count would override the component:\n${rule}`)
        .not.toMatch(/grid-template-columns/);
    }
  });

  it("still shows Credit inline on phones", () => {
    // The layout the owner asked to keep — Credit as a chip in the row.
    expect(css).toMatch(/\.pos-charge-credit-inline \{\s*display: inline-flex !important;/);
  });

  it("uses :has() nowhere else on the Charge screen", () => {
    const chargeRules = (css.match(/[^{}]*:has\([^)]*\)[^{}]*\{/g) ?? [])
      .filter((r) => /pos-charge/.test(r));
    expect(chargeRules, `Charge still leans on :has():\n${chargeRules.join("\n")}`).toEqual([]);
  });
});
