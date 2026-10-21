import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ChargeOverlay } from "./ChargeOverlay";

/**
 * Wallet first (owner, 2026-10-21): a customer who asked, in the order app,
 * to pay from the wallet first finds the wallet tender picked when it covers
 * the ticket, with a line saying they asked. The cashier can still pick
 * another, and a tender being counted is never taken away.
 */
describe("Charge — wallet first", () => {
  const base = {
    total: 120,
    submitting: false,
    onClose: () => undefined,
    onConfirm: vi.fn(async () => undefined),
    allowedTenders: { cash: true, card: true, qr: true, digital_wallet: true, split: true },
  };

  it("picks the wallet when the customer asked for it and it covers the ticket", () => {
    render(<ChargeOverlay {...base} walletEligible walletAvailableMvr={500} walletFirst />);
    expect(screen.getByTestId("pos-charge-wallet-first")).toBeTruthy();
    expect(screen.queryByTestId("charge-quick-note-50"), "cash quick amounts stay away once the wallet is picked").toBeNull();
  });

  it("leaves cash alone when the wallet does not cover the ticket", () => {
    render(<ChargeOverlay {...base} walletEligible walletAvailableMvr={50} walletFirst />);
    expect(screen.queryByTestId("pos-charge-wallet-first")).toBeNull();
    expect(screen.getByTestId("charge-quick-note-50")).toBeTruthy();
  });

  it("does not pick the wallet for a customer who never asked", () => {
    render(<ChargeOverlay {...base} walletEligible walletAvailableMvr={500} />);
    expect(screen.queryByTestId("pos-charge-wallet-first")).toBeNull();
    expect(screen.getByTestId("charge-quick-note-50")).toBeTruthy();
  });

  it("picks it once the figures land, but never over a tender being counted", () => {
    const { rerender } = render(<ChargeOverlay {...base} walletEligible={false} walletAvailableMvr={0} walletFirst />);
    expect(screen.queryByTestId("pos-charge-wallet-first")).toBeNull();

    rerender(<ChargeOverlay {...base} walletEligible walletAvailableMvr={500} walletFirst />);
    expect(screen.getByTestId("pos-charge-wallet-first")).toBeTruthy();

    // The cashier goes back to cash and starts counting: the wallet is not forced on them again.
    const cash = Array.from(document.querySelectorAll("button")).find((b) => /^Cash$/i.test((b.textContent ?? "").trim()))!;
    expect(cash).toBeTruthy();
    fireEvent.click(cash);
    fireEvent.click(screen.getByTestId("charge-quick-note-50"));
    rerender(<ChargeOverlay {...base} walletEligible walletAvailableMvr={600} walletFirst />);
    expect(screen.queryByTestId("pos-charge-wallet-first")).toBeNull();
  });
});
