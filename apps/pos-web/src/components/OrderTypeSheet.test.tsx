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
    expect(button("T2, Aisha").disabled).toBe(true);
    expect(button("T3, Reserved").disabled).toBe(true);
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

  it("table mode is the reminder: tables only, the ticket's own table pickable, No table a tap away", () => {
    const onChoose = vi.fn();
    render(<OrderTypeSheet mode="table" types={["Dine-in", "Takeaway"]} tables={tables} ourOrderId={77} onChoose={onChoose} onCancel={() => {}} />);
    expect(screen.queryByRole("button", { name: /^Takeaway/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Back" })).toBeNull();
    expect(button("T2, This ticket").disabled).toBe(false);
    fireEvent.click(button("No table"));
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
