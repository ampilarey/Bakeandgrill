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
