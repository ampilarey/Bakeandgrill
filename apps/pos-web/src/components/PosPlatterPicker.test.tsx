import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { PosPlatterPicker } from "./PosPlatterPicker";
import type { PlatterGroup, PlatterSelection } from "../types";

/**
 * Owner's audit, 2026-09-06, F2: the till could not sell a platter. It had no
 * picker and the order payload had no `children` field, so a cashier could tap
 * a platter, take money, and then be shown a server error they could do
 * nothing about.
 */

const groups: PlatterGroup[] = [
  {
    id: 10,
    name: "Pick your sides",
    rule_type: "exactly",
    min_count: 2,
    max_count: 2,
    sort_order: 0,
    items: [
      { item_id: 1, surcharge: 0, sort_order: 0, item: { id: 1, name: "Fried Rice", is_available: true } },
      { item_id: 2, surcharge: 15, sort_order: 1, item: { id: 2, name: "Garlic Naan", is_available: true } },
      { item_id: 3, surcharge: 0, sort_order: 2, item: { id: 3, name: "Chow Mein", is_available: false } },
    ],
  } as PlatterGroup,
];

function Harness({ onChange }: { onChange?: (s: PlatterSelection[]) => void } = {}) {
  const [selections, setSelections] = useState<PlatterSelection[]>([]);
  return (
    <PosPlatterPicker
      groups={groups}
      selections={selections}
      onChange={(next) => {
        setSelections(next);
        onChange?.(next);
      }}
    />
  );
}

describe("PosPlatterPicker", () => {
  it("shows each group with how many picks it needs", () => {
    render(<Harness />);

    expect(screen.getByText("Pick your sides")).toBeInTheDocument();
    expect(screen.getByText(/0 \/ 2 · Choose 2/)).toBeInTheDocument();
  });

  it("counts up as the cashier picks", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByLabelText("Add one Fried Rice"));

    expect(screen.getByText(/1 \/ 2 · Choose 2/)).toBeInTheDocument();
  });

  it("stops at the group's maximum", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByLabelText("Add one Fried Rice"));
    await user.click(screen.getByLabelText("Add one Fried Rice"));

    // Two of two: every + is now closed, including the other choices'.
    expect(screen.getByLabelText("Add one Fried Rice")).toBeDisabled();
    expect(screen.getByLabelText("Add one Garlic Naan")).toBeDisabled();
  });

  it("will not pick something the kitchen has 86'd", () => {
    render(<Harness />);

    expect(screen.getByLabelText("Add one Chow Mein")).toBeDisabled();
    expect(screen.getByText("Sold out")).toBeInTheDocument();
  });

  it("says what a surcharged choice costs", () => {
    render(<Harness />);

    expect(screen.getByText("+MVR 15.00")).toBeInTheDocument();
  });

  it("reports each pick with its group, quantity and surcharge", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    await user.click(screen.getByLabelText("Add one Garlic Naan"));

    expect(onChange).toHaveBeenLastCalledWith([
      expect.objectContaining({
        group_id: 10,
        item_id: 2,
        item_name: "Garlic Naan",
        quantity: 1,
        surcharge: 15,
      }),
    ]);
  });

  it("minus removes a pick again", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    await user.click(screen.getByLabelText("Add one Fried Rice"));
    await user.click(screen.getByLabelText("Remove one Fried Rice"));

    expect(onChange).toHaveBeenLastCalledWith([]);
    expect(screen.getByText(/0 \/ 2 · Choose 2/)).toBeInTheDocument();
  });
});
