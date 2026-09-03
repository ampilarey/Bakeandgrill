/**
 * Discounts & rewards as a dialog with a number pad.
 *
 * Owner, 2026-09-03: "discount page is now available when clicked only. So
 * no need to keep too small. Can appear as pop up also. And can add a number
 * pad to enter the number if possible."
 */
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DiscountsModal } from "./DiscountsModal";
import { ManualDiscountField } from "./ManualDiscountField";
import { z } from "../theme";

const controls = {
  manual_enabled: true,
  max_percent: 100,
  max_fixed_mvr: 0,
  reason_required: false,
  reasons: [],
  approval_required: false,
  can_self_approve: true,
};

describe("DiscountsModal", () => {
  it("says what is applied, and closes from the ✕ and from Done", () => {
    const onClose = vi.fn();
    render(
      <DiscountsModal summary={["Discount MVR 15.00", "Points MVR 2.00"]} onClose={onClose}>
        <div data-testid="inner" />
      </DiscountsModal>,
    );

    expect(screen.getByTestId("discounts-modal-summary")).toHaveTextContent("Discount MVR 15.00 · Points MVR 2.00");
    expect(screen.getByTestId("inner")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Close discounts and rewards" }));
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("says so plainly when nothing is applied", () => {
    render(<DiscountsModal summary={[]} onClose={() => {}}><div /></DiscountsModal>);
    expect(screen.getByTestId("discounts-modal-summary")).toHaveTextContent("Nothing applied yet");
  });

  /**
   * Owner, 2026-09-03: "when numbers are entered, size changes. And when
   * gift code is clicked the popup screen [gets] v bigger." The body is the
   * scroller and the dialog carries the class that fixes its height on a
   * phone, so growing content moves what is inside it, not the dialog.
   */
  it("scrolls inside itself rather than growing with its content", () => {
    render(
      <DiscountsModal summary={[]} onClose={() => {}}>
        <div />
      </DiscountsModal>,
    );
    expect(screen.getByTestId("discounts-modal")).toHaveClass("pos-discounts-modal");
    const body = screen.getByTestId("discounts-modal-body");
    expect(body).toHaveStyle({ overflowY: "auto", flex: "1 1 auto" });
  });

  /** A gift card scanned from inside the dialog must not open the camera
   *  behind it. */
  it("sits below the scanner's layer", () => {
    render(<DiscountsModal summary={[]} onClose={() => {}}><div /></DiscountsModal>);
    const overlay = screen.getByRole("dialog");
    expect(Number(overlay.style.zIndex)).toBeLessThan(z.modal);
  });
});

describe("The discount number pad", () => {
  function renderField(over: Record<string, unknown> = {}) {
    const setDiscountAmount = vi.fn();
    const view = render(
      <ManualDiscountField
        numpad
        discountAmount=""
        setDiscountAmount={setDiscountAmount}
        discountControls={controls}
        subtotal={200}
        {...over}
      />,
    );
    return { setDiscountAmount, view };
  }

  it("types the amount on the pad instead of a keyboard", () => {
    const { setDiscountAmount } = renderField();
    // No inline field to pop an iPad keyboard.
    expect(screen.queryByLabelText("Discount amount")).toBeNull();

    const pad = screen.getByTestId("discount-numpad");
    fireEvent.click(within(pad).getByRole("button", { name: "Digit 2" }));
    expect(setDiscountAmount).toHaveBeenLastCalledWith("2");
    expect(within(pad).getByLabelText("Amount in MVR")).toBeInTheDocument();
  });

  it("switches the pad to percent, and works out what that comes to", () => {
    renderField();
    fireEvent.click(within(screen.getByRole("group", { name: "Discount as" })).getByRole("button", { name: "%" }));

    const pad = screen.getByTestId("discount-numpad");
    expect(within(pad).getByLabelText("Amount in %")).toBeInTheDocument();
    fireEvent.click(within(pad).getByRole("button", { name: "Digit 1" }));
    fireEvent.click(within(pad).getByRole("button", { name: "Digit 0" }));
    expect(screen.getByTestId("discount-equivalent")).toHaveTextContent("= MVR 20.00");
  });

  /** The keys must not shuffle under the thumb as the line above the chips
   *  comes and goes on each digit. */
  it("holds the equivalent line's row open so nothing below the pad jumps", () => {
    const { view } = renderField();
    expect(screen.getByTestId("discount-equivalent")).toHaveTextContent("");

    view.rerender(
      <ManualDiscountField
        numpad
        discountAmount="20"
        setDiscountAmount={() => {}}
        discountControls={controls}
        subtotal={200}
      />,
    );
    expect(screen.getByTestId("discount-equivalent")).toHaveTextContent("= 10.0% of MVR 200.00");
  });

  it("keeps the quick percent chips — faster than typing for the usual ones", () => {
    renderField();
    fireEvent.click(within(screen.getByTestId("discount-percent-chips")).getByRole("button", { name: "25%" }));
    expect(screen.getByTestId("discount-equivalent")).toHaveTextContent("= MVR 50.00");
  });

  it("falls back to a read-only field on a locked ticket", () => {
    renderField({ disabled: true, discountAmount: "15.00" });
    expect(screen.queryByTestId("discount-numpad")).toBeNull();
    expect(screen.getByLabelText("Discount amount")).toBeDisabled();
  });
});
