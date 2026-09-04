import { describe, expect, it } from "vitest";
import {
  giftCardTokenFromLink,
  looksLikeGiftCardLink,
  normalizeGiftCardInput,
} from "./giftCardInput";

/**
 * A gift card is delivered as an SMS link, and the code inside it is long
 * enough that transcribing it is where people give up. The checkout field
 * takes the link, the code, or a scan — all three end up as a plain code.
 */
describe("gift card input", () => {
  it("pulls the token out of a full SMS link", () => {
    const token = "a".repeat(40);
    expect(giftCardTokenFromLink(`https://bakeandgrill.mv/gift-cards/view/${token}`)).toBe(token);
  });

  it("takes a bare path, which is what some SMS clients leave behind", () => {
    const token = "b".repeat(32);
    expect(giftCardTokenFromLink(`/gift-cards/view/${token}`)).toBe(token);
  });

  it("ignores tracking junk appended after the token", () => {
    const token = "c".repeat(48);
    expect(giftCardTokenFromLink(`https://x.mv/gift-cards/view/${token}?utm=sms`)).toBe(token);
  });

  it("does not mistake a plain code for a link", () => {
    expect(giftCardTokenFromLink("ABCD-1234-EFGH-5678")).toBeNull();
    expect(looksLikeGiftCardLink("ABCD-1234-EFGH-5678")).toBe(false);
  });

  it("rejects a token too short to be one", () => {
    expect(giftCardTokenFromLink("https://x.mv/gift-cards/view/short")).toBeNull();
  });

  it("cleans up what a keyboard or a scanner adds", () => {
    // Phones capitalise, pastes carry whitespace, scanners add line endings.
    expect(normalizeGiftCardInput("  abcd-1234 \n")).toBe("ABCD-1234");
    expect(normalizeGiftCardInput("ab cd 12 34")).toBe("ABCD1234");
  });

  it("leaves an unrecognisable value for the server to reject", () => {
    // Better a real error message than a client-side guess at what was meant.
    expect(normalizeGiftCardInput("not a code")).toBe("NOTACODE");
  });
});
