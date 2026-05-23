import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { CashInput } from "./CashInput";

function Harness({ initial = "1.08" }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  return <CashInput value={value} onChange={setValue} />;
}

describe("CashInput numpad", () => {
  it("replaces a pre-filled exact amount on the first digit press", async () => {
    const user = userEvent.setup();
    render(<Harness initial="1.08" />);

    await user.click(screen.getByRole("button", { name: "Digit 5" }));

    expect(screen.getByLabelText("Amount in MVR")).toHaveValue("5");
  });

  it("appends digits while the amount is still being edited", async () => {
    const user = userEvent.setup();
    render(<Harness initial="5" />);

    await user.click(screen.getByRole("button", { name: "Digit 0" }));

    expect(screen.getByLabelText("Amount in MVR")).toHaveValue("50");
  });
});
