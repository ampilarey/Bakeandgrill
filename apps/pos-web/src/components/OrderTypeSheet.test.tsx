/**
 * The question a new ticket asks before its first item (owner, 2026-10-21):
 * only the types this person may ring, the tables for dine-in, and the same
 * sheet as the table reminder at Save and Charge.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { OrderTypeSheet } from "./OrderTypeSheet";
import type { RestaurantTable } from "../types";

const tables = [
  { id: 1, name: "T1", status: "available", current_order_id: null },
  { id: 2, name: "T2", status: "occupied", current_order_id: 77, current_order_label: "Aisha" },
  { id: 3, name: "T3", status: "reserved", current_order_id: null },
] as unknown as RestaurantTable[];

// Number stands (owner, 2026-10-22): No. 1 is held, so No. 2 is the lowest free.
const stands = [
  { id: 10, name: "No. 1", kind: "stand", status: "occupied", current_order_id: 90, is_active: true },
  { id: 11, name: "No. 2", kind: "stand", status: "available", current_order_id: null, is_active: true },
  { id: 12, name: "No. 3", kind: "stand", status: "available", current_order_id: null, is_active: true },
] as unknown as RestaurantTable[];

const button = (name: string | RegExp) => screen.getByRole("button", { name }) as HTMLButtonElement;

describe("OrderTypeSheet", () => {
  it("offers only the types this person may ring", () => {
    render(<OrderTypeSheet mode="type" types={["Dine-in", "Takeaway"]} tables={[]} onChoose={() => {}} onCancel={() => {}} />);
    expect(screen.getByRole("heading", { name: "Dine-in or takeaway?" })).toBeTruthy();
    expect(button(/^Takeaway/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Pickup/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Delivery/ })).toBeNull();
  });

  it("names it a plain question when more than those two are allowed", () => {
    render(<OrderTypeSheet mode="type" types={["Dine-in", "Takeaway", "Pickup", "Delivery"]} tables={[]} onChoose={() => {}} onCancel={() => {}} />);
    expect(screen.getByRole("heading", { name: "What kind of order?" })).toBeTruthy();
    expect(button(/^Pickup/).className).toContain("pos-type-btn--small");
    expect(button(/^Dine-in/).className).not.toContain("pos-type-btn--small");
  });

  it("takeaway answers at once, with no table", () => {
    const onChoose = vi.fn();
    render(<OrderTypeSheet mode="type" types={["Dine-in", "Takeaway", "Pickup", "Delivery"]} tables={tables} onChoose={onChoose} onCancel={() => {}} />);
    fireEvent.click(button(/^Takeaway/));
    expect(onChoose).toHaveBeenCalledWith("Takeaway", null);
  });

  it("dine-in goes on to the tables: free ones to tap, the rest greyed with why", () => {
    const onChoose = vi.fn();
    render(<OrderTypeSheet mode="type" types={["Dine-in", "Takeaway"]} tables={tables} onChoose={onChoose} onCancel={() => {}} />);
    fireEvent.click(button(/^Dine-in/));
    expect(onChoose).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "Which table?" })).toBeTruthy();
    expect(button("T2, In use · Aisha").disabled).toBe(true);
    expect(button("T3, Reserved").disabled).toBe(true);
    fireEvent.click(button("T1"));
    expect(onChoose).toHaveBeenCalledWith("Dine-in", 1);
  });

  it("with a free number, dine-in takes the lowest one at once as the till's own pick", () => {
    const onChoose = vi.fn();
    render(<OrderTypeSheet mode="type" types={["Dine-in", "Takeaway"]} tables={[...tables, ...stands]} onChoose={onChoose} onCancel={() => {}} />);
    expect(button(/^Dine-in/).textContent).toContain("gets a number");
    fireEvent.click(button(/^Dine-in/));
    expect(onChoose).toHaveBeenCalledWith("Dine-in", 11, true);
  });

  it("with every number taken, dine-in goes on to the tables as before", () => {
    const onChoose = vi.fn();
    const allHeld = stands.map((s) => ({ ...s, status: "occupied", current_order_id: 90 })) as RestaurantTable[];
    render(<OrderTypeSheet mode="type" types={["Dine-in", "Takeaway"]} tables={[...tables, ...allHeld]} onChoose={onChoose} onCancel={() => {}} />);
    fireEvent.click(button(/^Dine-in/));
    expect(onChoose).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "Which table?" })).toBeTruthy();
    expect(screen.queryByRole("group", { name: "Numbers" })).toBeNull();
  });

  it("before payment the till's pick is kept with one tap, or changed to a table or another number", () => {
    const onChoose = vi.fn();
    render(<OrderTypeSheet mode="table" types={["Dine-in", "Takeaway"]} tables={[...tables, ...stands]} autoTableId={11} onChoose={onChoose} onCancel={() => {}} />);
    expect(screen.getByRole("heading", { name: "No. 2 was picked for them" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "No table" })).toBeNull();
    expect(button("No. 2, Picked for them").className).toContain("pos-table-tile--ours");
    fireEvent.click(button("Keep No. 2"));
    expect(onChoose).toHaveBeenCalledWith("Dine-in", 11, false);
    fireEvent.click(button("No. 3"));
    expect(onChoose).toHaveBeenCalledWith("Dine-in", 12, false);
    fireEvent.click(button("T1"));
    expect(onChoose).toHaveBeenCalledWith("Dine-in", 1);
  });

  it("Not seated yet keeps dine-in with no table, and Back returns to the types", () => {
    const onChoose = vi.fn();
    render(<OrderTypeSheet mode="type" types={["Dine-in", "Takeaway"]} tables={tables} onChoose={onChoose} onCancel={() => {}} />);
    fireEvent.click(button(/^Dine-in/));
    fireEvent.click(button("Back"));
    expect(screen.getByRole("heading", { name: "Dine-in or takeaway?" })).toBeTruthy();
    fireEvent.click(button(/^Dine-in/));
    fireEvent.click(button("Not seated yet"));
    expect(onChoose).toHaveBeenCalledWith("Dine-in", null);
  });

  it("dine-in with no tables set up answers at once", () => {
    const onChoose = vi.fn();
    render(<OrderTypeSheet mode="type" types={["Dine-in", "Takeaway"]} tables={[]} onChoose={onChoose} onCancel={() => {}} />);
    fireEvent.click(button(/^Dine-in/));
    expect(onChoose).toHaveBeenCalledWith("Dine-in", null);
  });

  it("table mode at Charge insists on a seat while one is free: tables only, the ticket's own table pickable", () => {
    const onChoose = vi.fn();
    render(<OrderTypeSheet mode="table" types={["Dine-in", "Takeaway"]} tables={tables} ourOrderId={77} onChoose={onChoose} onCancel={() => {}} />);
    expect(screen.queryByRole("button", { name: /^Takeaway/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Back" })).toBeNull();
    expect(button("T2, This ticket").disabled).toBe(false);
    expect(screen.queryByRole("button", { name: /No table|pay without/ })).toBeNull();
    fireEvent.click(button("T1"));
    expect(onChoose).toHaveBeenCalledWith("Dine-in", 1);
  });

  it("only with every table and number in use may a ticket be paid without a seat", () => {
    const onChoose = vi.fn();
    const allBusy = [
      { id: 1, name: "T1", status: "occupied", current_order_id: 70 },
      { id: 2, name: "T2", status: "occupied", current_order_id: 77 },
      { id: 10, name: "No. 1", kind: "stand", status: "occupied", current_order_id: 90, is_active: true },
    ] as unknown as RestaurantTable[];
    render(<OrderTypeSheet mode="table" types={["Dine-in", "Takeaway"]} tables={allBusy} onChoose={onChoose} onCancel={() => {}} />);
    fireEvent.click(button("Everything is in use: pay without"));
    expect(onChoose).toHaveBeenCalledWith("Dine-in", null);
  });

  it("closing drops the question", () => {
    const onCancel = vi.fn();
    render(<OrderTypeSheet mode="type" types={["Dine-in", "Takeaway"]} tables={[]} itemName="Iced Coffee" onChoose={() => {}} onCancel={onCancel} />);
    expect(screen.getByText(/Adding Iced Coffee/)).toBeTruthy();
    fireEvent.click(button("Close"));
    expect(onCancel).toHaveBeenCalled();
  });
});
