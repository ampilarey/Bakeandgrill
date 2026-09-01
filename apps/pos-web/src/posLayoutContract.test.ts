/**
 * The layout rules the till depends on, asserted against the stylesheet.
 *
 * These are not decoration. The shell used to be `min-height: 100dvh`, which
 * let the document grow past the screen once the menu had enough tiles —
 * every `flex: 1; min-height: 0` beneath it then had no ceiling to flex
 * against, the tile grid's own scroller never engaged, and the page scrolled
 * instead, carrying the cart and the Charge button off the bottom. Owner,
 * 2026-09-01.
 *
 * jsdom does no layout, so a render test cannot catch that. Reading the
 * declarations can, and this is the file somebody would edit to reintroduce
 * it.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(__dirname, 'index.css'), 'utf8');

/** The declarations inside one top-level rule, ignoring nested media blocks. */
function block(selector: string): string {
  const at = css.indexOf(`\n${selector} {`);
  expect(at, `${selector} not found in index.css`).toBeGreaterThan(-1);
  const start = css.indexOf('{', at);

  return css.slice(start + 1, css.indexOf('}', start));
}

describe('POS layout contract', () => {
  it('pins the shell to exactly one screen', () => {
    const shell = block('.pos-shell');

    // dvh is what makes it right on a phone, where the address bar changes
    // how much screen there is; vh is the fallback for browsers without it.
    expect(shell).toMatch(/height:\s*100dvh/);
    expect(shell).toMatch(/height:\s*100vh/);
    expect(shell).not.toMatch(/min-height:/);
  });

  it('stops the page itself scrolling', () => {
    expect(block('.pos-shell')).toMatch(/overflow:\s*hidden/);
  });

  it('locks the sales pane so the cart cannot scroll away', () => {
    expect(block('.pos-main--sales')).toMatch(/overflow:\s*hidden/);
  });

  it('still lets the back-office panes scroll', () => {
    // Open tickets, shift, receiving and the wholesale panes carry no
    // scroller of their own — without this they would be clipped.
    expect(block('.pos-main')).toMatch(/overflow-y:\s*auto/);
  });

  it('keeps the cart body as the scroller and the footer fixed', () => {
    expect(block('.pos-cart-body')).toMatch(/overflow-y:\s*auto/);
    expect(block('.pos-cart-footer')).toMatch(/flex-shrink:\s*0/);
  });

  it('adds the home-indicator inset once, not once per nested box', () => {
    // The shell pads the screen edge. The cart sits in normal flow inside it,
    // and the dock bar inside that — when all three padded, the insets stacked
    // into a white band under the Charge row that only showed once the shell
    // stopped scrolling. Owner, 2026-09-01: "now there is lot of space".
    expect(block('.pos-shell')).toMatch(/padding-bottom:\s*var\(--pos-safe-bottom\)/);

    const phone = css.slice(css.indexOf('@media (max-width: 840px)'));
    const dockBar = phone.slice(
      phone.indexOf('.pos-cart.pos-cart--dock .pos-cart-dock-bar'),
    );
    expect(dockBar.slice(0, dockBar.indexOf('}'))).not.toMatch(/safe-area-inset-bottom/);
  });

  it('still pads the surfaces that escape the shell', () => {
    // Both are position: fixed, so the shell's padding does not reach them
    // and they have to carry the inset themselves.
    expect(block('.pos-charge')).toMatch(/padding-bottom:\s*var\(--pos-safe-bottom\)/);

    const phone = css.slice(css.indexOf('@media (max-width: 840px)'));
    const sheet = phone.slice(phone.indexOf('.pos-cart.pos-cart--sheet {'));
    const sheetBlock = sheet.slice(0, sheet.indexOf('}'));
    expect(sheetBlock).toMatch(/position:\s*fixed/);
    expect(sheetBlock).toMatch(/padding-bottom:\s*var\(--pos-safe-bottom\)/);
  });

  it('reserves half the home-indicator inset, on touch devices only', () => {
    // Owner, 2026-09-01: "still need to reduce the bottom padding 50% in ipad
    // and phone". Halving env() needs no breakpoint — a desktop browser
    // reports 0, so only a device with an indicator moves.
    expect(css).toMatch(
      /--pos-safe-bottom:\s*calc\(env\(safe-area-inset-bottom,\s*0px\)\s*\/\s*2\)/,
    );
  });

  it('keeps the Charge button a comfortable target on a phone', () => {
    // Trimmed to win back vertical space, but never below the 44px that
    // makes a touch target reliable.
    const phone = css.slice(css.indexOf('@media (max-width: 840px)'));
    const trimmed = phone.slice(phone.indexOf('.pos-cart-charge-btn'));
    const minHeight = /min-height:\s*(\d+)px/.exec(trimmed);

    expect(minHeight).not.toBeNull();
    expect(Number(minHeight?.[1])).toBeGreaterThanOrEqual(44);
  });
});
