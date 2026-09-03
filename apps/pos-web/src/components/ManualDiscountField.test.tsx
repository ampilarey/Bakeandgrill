import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { ManualDiscountField } from "./ManualDiscountField";

function Harness({
  initialAmount = "10",
  reasonRequired = true,
  maxPercent = 10,
  fieldError,
}: {
  initialAmount?: string;
  reasonRequired?: boolean;
  maxPercent?: number;
  fieldError?: string;
}) {
  const [amount, setAmount] = useState(initialAmount);
  const [reason, setReason] = useState<string | null>(null);
  const [note, setNote] = useState("");
  return (
    <ManualDiscountField
      discountAmount={amount}
      setDiscountAmount={setAmount}
      discountReason={reason}
      setDiscountReason={setReason}
      discountReasonNote={note}
      setDiscountReasonNote={setNote}
      discountFieldError={fieldError}
      discountControls={{
        manual_enabled: true,
        max_percent: maxPercent,
        max_fixed_mvr: 0,
        reason_required: reasonRequired,
        reasons: ["Loyal customer", "Staff meal"],
      }}
    />
  );
}

describe("ManualDiscountField", () => {
  it("shows reason chips when reason is required and discount > 0", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    expect(screen.getByTestId("discount-reason-picker")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Loyal customer" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Staff meal" }));
    expect(screen.getByRole("button", { name: "Staff meal" })).toBeInTheDocument();
    // Selected chip uses brand tint background.
    expect(screen.getByRole("button", { name: "Staff meal" }).getAttribute("style")).toContain(
      "rgb(254, 243, 232)",
    );
  });

  it("hides reason picker when discount is empty", () => {
    render(<Harness initialAmount="" />);
    expect(screen.queryByTestId("discount-reason-picker")).not.toBeInTheDocument();
  });

  it("shows cap hint when max_percent < 100", () => {
    render(<Harness maxPercent={10} />);
    expect(screen.getByText(/max 10%/)).toBeInTheDocument();
  });

  it("displays cap / reason error under the field", () => {
    render(
      <Harness fieldError="Discount exceeds the maximum allowed (10%)." />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Discount exceeds the maximum allowed (10%).",
    );
  });

  it("hides entirely when manual_enabled is false", () => {
    render(
      <ManualDiscountField
        discountAmount="5"
        setDiscountAmount={() => undefined}
        discountControls={{
          manual_enabled: false,
          max_percent: 100,
          max_fixed_mvr: 0,
          reason_required: false,
          reasons: [],
        }}
      />,
    );
    expect(screen.queryByTestId("manual-discount-field")).not.toBeInTheDocument();
  });
});

describe("manager code hint", () => {
  const controls = {
    manual_enabled: true, max_percent: 100, max_fixed_mvr: 0, reason_required: false, reasons: [],
    approval_required: true,
  };
  const field = (over: Record<string, unknown>) => (
    <ManualDiscountField
      discountAmount="10"
      setDiscountAmount={() => {}}
      discountControls={{ ...controls, ...over }}
    />
  );

  it("warns a cashier that a manager's code will be asked for", () => {
    render(field({ can_self_approve: false }));
    expect(screen.getByTestId("discount-needs-code")).toHaveTextContent("manager's code");
  });

  it("says nothing to someone who approves their own", () => {
    render(field({ can_self_approve: true }));
    expect(screen.queryByTestId("discount-needs-code")).toBeNull();
  });
});

describe("percent mode", () => {
  const controls = {
    manual_enabled: true, max_percent: 20, max_fixed_mvr: 0, reason_required: false, reasons: [],
    approval_required: true, can_self_approve: true,
  };

  function PctHarness({ subtotal, initial = "" }: { subtotal: number; initial?: string }) {
    const [amount, setAmount] = useState(initial);
    return (
      <>
        <ManualDiscountField discountAmount={amount} setDiscountAmount={setAmount} discountControls={controls} subtotal={subtotal} />
        <output data-testid="amount">{amount}</output>
      </>
    );
  }

  it("turns a typed percentage into MVR against the subtotal", async () => {
    const user = userEvent.setup();
    render(<PctHarness subtotal={150} />);

    await user.click(screen.getByRole("button", { name: "%" }));
    await user.type(screen.getByLabelText("Discount percent"), "10");

    expect(screen.getByTestId("amount")).toHaveTextContent("15.00");
    expect(screen.getByTestId("discount-equivalent")).toHaveTextContent("= MVR 15.00");
  });

  it("offers percent chips up to the cap, and a chip sets the amount in one tap", async () => {
    const user = userEvent.setup();
    render(<PctHarness subtotal={150} />);

    const chips = screen.getByTestId("discount-percent-chips");
    expect(chips).toHaveTextContent("5%10%15%20%");
    expect(chips).not.toHaveTextContent("25%");

    await user.click(screen.getByRole("button", { name: "20%" }));
    expect(screen.getByTestId("amount")).toHaveTextContent("30.00");
    expect(screen.getByLabelText("Discount percent")).toHaveValue("20");
  });

  it("keeps the percentage when the cart changes", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<PctHarness subtotal={150} />);
    await user.click(screen.getByRole("button", { name: "10%" }));
    expect(screen.getByTestId("amount")).toHaveTextContent("15.00");

    rerender(<PctHarness subtotal={200} />);
    // Same harness instance with a bigger subtotal: 10% is now MVR 20.
    expect(screen.getByTestId("amount")).toHaveTextContent("20.00");
  });

  it("shows what a typed MVR amount is as a percentage, and carries it across the toggle", async () => {
    const user = userEvent.setup();
    render(<PctHarness subtotal={150} initial="30" />);

    expect(screen.getByTestId("discount-equivalent")).toHaveTextContent("= 20.0% of MVR 150.00");

    await user.click(screen.getByRole("button", { name: "%" }));
    expect(screen.getByLabelText("Discount percent")).toHaveValue("20");
    expect(screen.getByTestId("amount")).toHaveTextContent("30.00");
  });
});
