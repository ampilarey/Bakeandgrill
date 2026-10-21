/**
 * Save ticket (owner, 2026-10-22): nobody types a name for a dine-in ticket,
 * which is named from the customer and the table or number; a takeaway keeps
 * an optional name box for the call-out.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SaveTicketModal } from "./SaveTicketModal";
import type { RestaurantTable } from "../types";

const tables = [
  { id: 1, name: "T1", status: "available", current_order_id: null, is_active: true },
  { id: 2, name: "T2", status: "occupied", current_order_id: 77, is_active: true },
  { id: 10, name: "No. 1", kind: "stand", status: "available", current_order_id: null, is_active: true },
  { id: 11, name: "No. 2", kind: "stand", status: "available", current_order_id: null, is_active: true },
] as unknown as RestaurantTable[];

const base = {
  attachedCustomer: null,
  tables,
  setSelectedTableId: () => {},
  setOrderType: () => {},
  onCancel: () => {},
};

describe("SaveTicketModal", () => {
  it("names a dine-in ticket for the cashier and says the till picked its number", async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    render(<SaveTicketModal {...base} orderType="Dine-in" selectedTableId={10} tableAuto onConfirm={onConfirm} />);
    expect(screen.queryByPlaceholderText(/For the call-out/)).toBeNull();
    expect(screen.getByTestId("save-ticket-name").textContent).toContain("Saved as No. 1");
    expect(screen.getByTestId("save-auto-table").textContent).toContain("No. 1 was picked by the till");
    fireEvent.click(screen.getByRole("button", { name: "Save ticket" }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith("No. 1", undefined, false));
  });

  it("lists tables and numbers apart, and says a number comes at payment when none is picked", () => {
    render(<SaveTicketModal {...base} orderType="Dine-in" selectedTableId={null} onConfirm={vi.fn()} />);
    expect(screen.getByRole("group", { name: "Tables" })).toBeTruthy();
    expect(screen.getByRole("group", { name: "Numbers" })).toBeTruthy();
    expect((screen.getByRole("option", { name: "T2" }) as HTMLOptionElement).disabled).toBe(true);
    expect(screen.getByTestId("save-no-table").textContent).toContain("One is given when it is saved or paid");
  });

  it("keeps an optional name box for a takeaway and saves without one", async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    render(<SaveTicketModal {...base} orderType="Takeaway" selectedTableId={null} onConfirm={onConfirm} />);
    const box = screen.getByPlaceholderText(/For the call-out/) as HTMLInputElement;
    fireEvent.change(box, { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Save ticket" }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalled());
    expect(String(onConfirm.mock.calls[0][0])).toMatch(/^Ticket /);

    fireEvent.change(box, { target: { value: "Aisha" } });
    fireEvent.click(screen.getByRole("button", { name: "Save ticket" }));
    await waitFor(() => expect(onConfirm).toHaveBeenLastCalledWith("Aisha", undefined, false));
  });
});
