import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { ReceiptActionsBanner } from "./ReceiptActionsBanner";

vi.mock("../api", () => ({
  getReceiptLink: vi.fn().mockResolvedValue({ link: "https://example.test/r/x" }),
  sendReceipt: vi.fn().mockResolvedValue({ link: "https://example.test/r/x" }),
}));

/**
 * FIX 9e — verify the post-settle credit-balance chip is rendered
 * only when the tender mix actually involved credit AND the server
 * returned a numeric balance. Older backends omit `credit_balance_mvr`
 * so the banner must degrade gracefully to the old copy.
 */
describe("ReceiptActionsBanner — credit balance (FIX 9e)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows 'balance now MVR X' when paidOnCredit + creditBalanceMvr", () => {
    render(
      <ReceiptActionsBanner
        orderId={101}
        customerPhone={null}
        paidOnCredit
        creditBalanceMvr={250.5}
        onDismiss={() => undefined}
      />,
    );

    expect(screen.getByText(/charged to credit account/i)).toBeTruthy();
    expect(screen.getByText(/balance now MVR 250\.50/i)).toBeTruthy();
  });

  it("shows 'balance now MVR X' when creditNote (partial split) + creditBalanceMvr", () => {
    render(
      <ReceiptActionsBanner
        orderId={102}
        customerPhone={null}
        paidOnCredit={false}
        creditNote="partially on credit (MVR 20.00)"
        creditBalanceMvr={120}
        onDismiss={() => undefined}
      />,
    );

    expect(screen.getByText(/partially on credit \(MVR 20\.00\)/i)).toBeTruthy();
    expect(screen.getByText(/balance now MVR 120\.00/i)).toBeTruthy();
  });

  it("omits the balance chip when the order didn't touch credit", () => {
    render(
      <ReceiptActionsBanner
        orderId={103}
        customerPhone={null}
        paidOnCredit={false}
        creditBalanceMvr={500}
        onDismiss={() => undefined}
      />,
    );

    expect(screen.queryByText(/balance now MVR/i)).toBeNull();
    expect(screen.getByText(/✓ Order #103/i)).toBeTruthy();
  });

  it("omits the balance chip when creditBalanceMvr is null (older backend)", () => {
    render(
      <ReceiptActionsBanner
        orderId={104}
        customerPhone={null}
        paidOnCredit
        creditBalanceMvr={null}
        onDismiss={() => undefined}
      />,
    );

    expect(screen.getByText(/charged to credit account/i)).toBeTruthy();
    expect(screen.queryByText(/balance now MVR/i)).toBeNull();
  });
});
