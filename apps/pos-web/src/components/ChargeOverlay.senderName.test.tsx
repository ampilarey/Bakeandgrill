import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ChargeOverlay } from "./ChargeOverlay";

/**
 * Owner, 2026-09-07. The bank statement names whoever sent a transfer, but a
 * walk-in order names nobody, so the Settlements page had nothing to match a
 * transfer on except the amount — and customers send the wrong amount. When
 * the cashier picks Transfer they can type the sender's name as it appears
 * in the customer's banking app; it travels with the payment as its
 * reference, and the settlement matcher reads it.
 */
describe("ChargeOverlay — sender's name on a transfer", () => {
  const base = { total: 35, submitting: false, onClose: () => undefined };
  const tenders = { cash: true, card: true, qr: true, digital_wallet: true, split: true };

  it("sends the typed sender's name with the transfer row", async () => {
    const onConfirm = vi.fn(async () => undefined);
    render(<ChargeOverlay {...base} onConfirm={onConfirm} allowedTenders={tenders} />);

    fireEvent.click(screen.getByRole("button", { name: "Transfer" }));
    fireEvent.change(screen.getByLabelText("Sender's name on the transfer"), { target: { value: "  Azlifa Ahmed " } });
    fireEvent.click(document.querySelector(".pos-charge-confirm")!);

    await vi.waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    expect(onConfirm).toHaveBeenCalledWith([{ method: "digital_wallet", amount: 35, reference: "Azlifa Ahmed" }]);
  });

  it("asks for no name on other tenders, and sends none when it is blank", async () => {
    const onConfirm = vi.fn(async () => undefined);
    render(<ChargeOverlay {...base} onConfirm={onConfirm} allowedTenders={tenders} />);

    fireEvent.click(screen.getByRole("button", { name: "Card" }));
    expect(screen.queryByLabelText("Sender's name on the transfer")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Transfer" }));
    expect(screen.getByLabelText("Sender's name on the transfer")).toBeInTheDocument();
    fireEvent.click(document.querySelector(".pos-charge-confirm")!);

    await vi.waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    expect(onConfirm).toHaveBeenCalledWith([{ method: "digital_wallet", amount: 35 }]);
  });
});
