import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DiscountApprovalModal } from "./DiscountApprovalModal";

describe("DiscountApprovalModal", () => {
  it("renders title and subtitle", () => {
    render(
      <DiscountApprovalModal
        onConfirm={vi.fn()}
        onResend={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByRole("dialog", { name: "Enter approval code" })).toBeInTheDocument();
    expect(screen.getByText("Enter approval code")).toBeInTheDocument();
    expect(screen.getByText("Code sent to the manager.")).toBeInTheDocument();
  });

  it("submits the 4-digit code via Confirm", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    render(
      <DiscountApprovalModal
        onConfirm={onConfirm}
        onResend={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Digit 1" }));
    await user.click(screen.getByRole("button", { name: "Digit 2" }));
    await user.click(screen.getByRole("button", { name: "Digit 3" }));
    await user.click(screen.getByRole("button", { name: "Digit 4" }));
    await user.click(screen.getByRole("button", { name: "Confirm" }));

    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalledWith("1234");
    });
  }, 10_000);

  it("shows server 4xx message verbatim", () => {
    render(
      <DiscountApprovalModal
        error="Invalid code."
        onConfirm={vi.fn()}
        onResend={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Invalid code.");
  });

  it("calls Resend and Cancel", async () => {
    const user = userEvent.setup();
    const onResend = vi.fn();
    const onCancel = vi.fn();
    render(
      <DiscountApprovalModal
        onConfirm={vi.fn()}
        onResend={onResend}
        onCancel={onCancel}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Resend" }));
    expect(onResend).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
