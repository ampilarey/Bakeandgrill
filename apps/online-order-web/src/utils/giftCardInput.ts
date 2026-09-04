/**
 * Turn whatever the customer gave us into a gift-card code.
 *
 * Gift cards arrive by SMS as a link — `/gift-cards/view/<token>` — and the
 * code inside it is long enough that transcribing it is where people give up.
 * So the field accepts three things and says so:
 *
 *   1. the code itself, typed or pasted;
 *   2. the whole SMS link, pasted — the token is exchanged for the code by the
 *      same public endpoint the link itself opens;
 *   3. a scan, on a device whose browser can read a barcode (see useGiftCardScan).
 *
 * Everything ends up as a plain code, so the rest of checkout is unchanged.
 */

/** The view token in a gift-card link, if this is one. */
export function giftCardTokenFromLink(input: string): string | null {
  const text = input.trim();
  if (text === "") return null;

  // Match the path whether it arrived as a full URL, a bare path, or with the
  // tracking junk an SMS client sometimes appends.
  const match = /\/gift-cards\/view\/([A-Za-z0-9]{32,64})/.exec(text);

  return match ? match[1] : null;
}

/**
 * Normalise a typed or scanned value to the code shape the API expects.
 *
 * Scanners and keyboards both introduce noise: a barcode may carry a URL, a
 * paste may carry surrounding whitespace, and phones like to capitalise. What
 * they cannot do is invent a code, so anything unrecognisable is returned
 * trimmed and uppercased for the server to reject with a real message.
 */
export function normalizeGiftCardInput(input: string): string {
  return input.trim().replace(/\s+/g, "").toUpperCase();
}

/** True when this looks like something to exchange rather than to send as-is. */
export function looksLikeGiftCardLink(input: string): boolean {
  return giftCardTokenFromLink(input) !== null;
}
