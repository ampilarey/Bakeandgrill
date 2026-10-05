import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchRecentCustomers = vi.fn();
const searchCustomers = vi.fn();
const quickCreateCustomer = vi.fn();
vi.mock("../api", () => ({
  fetchRecentCustomers: (...a: unknown[]) => fetchRecentCustomers(...a),
  searchCustomers: (...a: unknown[]) => searchCustomers(...a),
  quickCreateCustomer: (...a: unknown[]) => quickCreateCustomer(...a),
  updateCustomerFromPos: vi.fn(),
}));

import { CustomerPicker, rankRegulars } from "./CustomerPicker";

const today = new Date().toISOString();
const customers = [
  { id: 1, name: "Abdullah Afeef", phone: "7781234", orders_count: 31, last_order_at: today },
  { id: 2, name: "Mariyam Shifa", phone: "7910022", orders_count: 18, last_order_at: "2026-09-20T10:00:00Z", loyalty_points: 120 },
  { id: 3, name: "Jo", phone: null, orders_count: 4, last_order_at: "2026-10-01T10:00:00Z" },
];

/*
 * Owner, 2026-10-05: "The way customers are added in pos is difficult both
 * in ipad and iPhone." The picker is a page now: regulars first, one box
 * for name or phone, save-as-new the moment a number has no match.
 */
describe("CustomerPicker page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchRecentCustomers.mockResolvedValue({ data: customers, total: 412, limit: 50 });
    searchCustomers.mockResolvedValue({ data: [] });
    quickCreateCustomer.mockResolvedValue({ customer: { id: 9, name: null, phone: "7781299" }, created: true });
  });

  it("opens as a page with the regulars listed before anything is typed, and attaches on a tap", async () => {
    const onAttach = vi.fn();
    render(<CustomerPicker customer={null} onAttach={onAttach} onDetach={() => {}} ticketLine="3 items · MVR 26.00" />);
    fireEvent.click(screen.getByRole("button", { name: /Add customer/ }));

    const page = await screen.findByTestId("customer-picker-page");
    expect(page).toHaveTextContent("For this ticket · 3 items · MVR 26.00");
    // Most frequent first; the person who ordered today is marked.
    const rows = await screen.findAllByRole("button", { name: /orders?/ });
    expect(rows[0]).toHaveTextContent("Abdullah Afeef");
    expect(rows[0]).toHaveTextContent("today");
    expect(rows[1]).toHaveTextContent("120 pts");
    expect(screen.getByRole("button", { name: "All 412" })).toBeInTheDocument();

    fireEvent.click(rows[1]);
    expect(onAttach).toHaveBeenCalledWith(expect.objectContaining({ id: 2 }));
    expect(screen.queryByTestId("customer-picker-page")).not.toBeInTheDocument();
  });

  it("filters to who ordered today, and the back button returns to the ticket", async () => {
    render(<CustomerPicker customer={null} onAttach={() => {}} onDetach={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /Add customer/ }));
    await screen.findAllByRole("button", { name: /orders?/ });
    fireEvent.click(screen.getByRole("button", { name: "Today" }));
    expect(screen.getAllByRole("button", { name: /orders?/ })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Back to the ticket" }));
    expect(screen.queryByTestId("customer-picker-page")).not.toBeInTheDocument();
  });

  it("searches as you type, and offers to save a valid number that matches nobody", async () => {
    searchCustomers.mockResolvedValue({ data: [customers[0]] });
    const onAttach = vi.fn();
    render(<CustomerPicker customer={null} onAttach={onAttach} onDetach={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /Add customer/ }));
    const box = await screen.findByLabelText("Find a customer by name or phone");

    fireEvent.change(box, { target: { value: "778" } });
    await waitFor(() => expect(searchCustomers).toHaveBeenCalledWith("778"));
    expect(await screen.findByText("Abdullah Afeef")).toBeInTheDocument();
    expect(screen.queryByTestId("customer-picker-save-new")).not.toBeInTheDocument();

    // Seven digits, nobody has them: one tap to save, name optional.
    searchCustomers.mockResolvedValue({ data: [] });
    fireEvent.change(box, { target: { value: "7781299" } });
    const save = await screen.findByTestId("customer-picker-save-new");
    expect(save).toHaveTextContent("Save 7781299 as a new customer");
    fireEvent.click(save);
    expect(screen.getByLabelText("Phone")).toHaveValue("7781299");
    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: "Niuma" } });
    fireEvent.click(screen.getByRole("button", { name: "Save and attach" }));
    await waitFor(() => expect(quickCreateCustomer).toHaveBeenCalledWith({ phone: "7781299", name: "Niuma" }));
    expect(onAttach).toHaveBeenCalledWith(expect.objectContaining({ id: 9 }));
  });

  it("does not offer to save a number that already belongs to someone", async () => {
    searchCustomers.mockResolvedValue({ data: [customers[0]] });
    render(<CustomerPicker customer={null} onAttach={() => {}} onDetach={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /Add customer/ }));
    fireEvent.change(await screen.findByLabelText("Find a customer by name or phone"), { target: { value: "7781234" } });
    await screen.findByText("Abdullah Afeef");
    expect(screen.queryByTestId("customer-picker-save-new")).not.toBeInTheDocument();
  });

  it("the New customer button opens a blank form and refuses a bad phone", async () => {
    render(<CustomerPicker customer={null} onAttach={() => {}} onDetach={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /Add customer/ }));
    fireEvent.click(await screen.findByTestId("customer-picker-new"));
    expect(screen.getByRole("dialog", { name: "New customer" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Phone"), { target: { value: "12" } });
    fireEvent.click(screen.getByRole("button", { name: "Save and attach" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("valid phone");
    expect(quickCreateCustomer).not.toHaveBeenCalled();
    // Back goes to the list, not off the page.
    fireEvent.click(screen.getByRole("button", { name: "Back to the customer list" }));
    expect(screen.getByRole("dialog", { name: "Customer" })).toBeInTheDocument();
  });

  it("ranks regulars by how often they come, then by recency", () => {
    expect(rankRegulars(customers).map((c) => c.id)).toEqual([1, 2, 3]);
    expect(rankRegulars([{ ...customers[2], orders_count: 31, last_order_at: "2026-10-04T00:00:00Z" }, customers[0]]).map((c) => c.id)).toEqual([1, 3]);
  });

  it("opens in number mode on a phone, with the pad beside the list on a tablet", async () => {
    render(<CustomerPicker customer={null} onAttach={() => {}} onDetach={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /Add customer/ }));
    const box = await screen.findByLabelText("Find a customer by name or phone");
    // Numbers first: the switch offers letters, and the box asks for the phone keypad.
    expect(screen.getByRole("button", { name: "Letters keyboard" })).toBeInTheDocument();
    expect(box).toHaveAttribute("type", "tel");
    // jsdom is a wide screen: the pad sits beside the list and types into the box.
    const pad = screen.getByTestId("customer-picker-pad");
    expect(pad).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Digit 7" }));
    fireEvent.click(screen.getByRole("button", { name: "Digit 7" }));
    fireEvent.click(screen.getByRole("button", { name: "Digit 8" }));
    expect(box).toHaveValue("778");
    await waitFor(() => expect(searchCustomers).toHaveBeenCalledWith("778"));
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(box).toHaveValue("");
    // Letters for a name: the device keyboard comes back.
    fireEvent.click(screen.getByRole("button", { name: "Letters keyboard" }));
    expect(box).toHaveAttribute("inputmode", "search");
  });
});
