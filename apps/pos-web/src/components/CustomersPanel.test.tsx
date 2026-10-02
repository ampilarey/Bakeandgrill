import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CustomersPanel } from "./CustomersPanel";

const api = {
  listCustomers: vi.fn(),
  listCustomerSegments: vi.fn(),
  getCustomerDetail: vi.fn(),
  fetchCustomerSummary: vi.fn(),
  updateCustomerDetail: vi.fn(),
  updateCustomerFromPos: vi.fn(),
  changeCustomerPhone: vi.fn(),
  sendCustomerSms: vi.fn(),
  recordCreditRepayment: vi.fn(),
  recordDepositTopUp: vi.fn(),
  searchCustomers: vi.fn(),
  fetchRecentCustomers: vi.fn(),
  quickCreateCustomer: vi.fn(),
};

vi.mock("../api", () => Object.fromEntries(
  Object.keys({
    listCustomers: 1, listCustomerSegments: 1, getCustomerDetail: 1, fetchCustomerSummary: 1,
    updateCustomerDetail: 1, updateCustomerFromPos: 1, changeCustomerPhone: 1, sendCustomerSms: 1,
    recordCreditRepayment: 1, recordDepositTopUp: 1, searchCustomers: 1, fetchRecentCustomers: 1, quickCreateCustomer: 1,
  }).map((k) => [k, (...args: unknown[]) => (api as Record<string, (...a: unknown[]) => unknown>)[k](...args)]),
));

const manager = { canManage: true, canCreate: true, canCreditRepay: true, canDepositReceive: true, canSendSms: true };
const cashier = { canManage: false, canCreate: true, canCreditRepay: false, canDepositReceive: false, canSendSms: false };

const aisha = { id: 7, name: "Aisha", phone: "+9607771234", orders_count: 12, last_order_at: new Date().toISOString(), is_active: true, credit_balance_laar: 15000, badges: ["VIP"] };
const hassan = { id: 8, name: "Hassan", phone: "+9607775555", orders_count: 1, is_active: true, credit_balance_laar: 0 };

const detail = {
  id: 7, name: "Aisha", phone: "+9607771234", email: null, date_of_birth: null, tier: "gold", loyalty_points: 320,
  is_active: true, sms_opt_out: false, internal_notes: "Allergic to nuts", orders_count: 12, last_order_at: null,
  created_at: "2025-01-10T00:00:00Z", credit_enabled: true, credit_status: "active", credit_limit_laar: 50000, credit_balance_laar: 15000,
};
const summary = {
  customer: { id: 7, name: "Aisha", phone: "+9607771234", badges: ["VIP"] },
  loyalty: { points_balance: 320, points_held: 0, available_points: 320, lifetime_points: 900, tier: "gold" },
  lifetime: { orders_count: 12, total_spent: 2450.5, first_paid_at: null, last_paid_at: "2026-09-30T10:00:00Z" },
  is_vip: true,
  recent_orders: [],
  credit: { enabled: true, status: "active", limit_laar: 50000, balance_laar: 15000, available_laar: 35000, can_charge: true },
  deposit: { has_account: true, status: "active", balance_laar: 20000, can_use: true },
};

beforeEach(() => {
  Object.values(api).forEach((f) => f.mockReset());
  api.listCustomers.mockResolvedValue({ data: [aisha, hassan], meta: { current_page: 1, last_page: 2, total: 31 } });
  api.listCustomerSegments.mockResolvedValue({ segments: [
    { slug: "vip_customers", label: "VIP customers", count: 4 },
    { slug: "dormant_30d", label: "Dormant 30+ days", count: 9 },
    { slug: "referral_customers", label: "Referral customers", count: 2 },
  ] });
  api.getCustomerDetail.mockResolvedValue({ customer: detail, orders: [
    { id: 90, order_number: "BG-0090", status: "completed", type: "takeaway", total: "185.00", created_at: "2026-09-30T10:00:00Z", paid_at: "2026-09-30T10:00:00Z" },
  ] });
  api.fetchCustomerSummary.mockResolvedValue(summary);
});

describe("CustomersPanel — owner and manager", () => {
  it("lists every customer with orders, credit and badges, and pages on", async () => {
    render(<CustomersPanel {...manager} onClose={vi.fn()} />);

    await waitFor(() => expect(screen.getByTestId("customer-row-7")).toBeTruthy());
    const row = screen.getByTestId("customer-row-7");
    expect(row.textContent).toMatch(/Aisha/);
    expect(row.textContent).toMatch(/12 orders/);
    expect(row.textContent).toMatch(/Owes MVR 150\.00/);
    expect(row.textContent).toMatch(/VIP/);
    expect(screen.getByText(/31 customers/)).toBeTruthy();

    await userEvent.click(screen.getByRole("button", { name: "Load more" }));
    await waitFor(() => expect(api.listCustomers).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 })));
  });

  it("filters by a segment chip and by search", async () => {
    const user = userEvent.setup();
    render(<CustomersPanel {...manager} onClose={vi.fn()} />);

    await waitFor(() => expect(screen.getByRole("button", { name: /VIP customers/ })).toBeTruthy());
    await user.click(screen.getByRole("button", { name: /VIP customers/ }));
    await waitFor(() => expect(api.listCustomers).toHaveBeenLastCalledWith(expect.objectContaining({ segment: "vip_customers" })));

    await user.selectOptions(screen.getByLabelText("More segments"), "referral_customers");
    await waitFor(() => expect(api.listCustomers).toHaveBeenLastCalledWith(expect.objectContaining({ segment: "referral_customers" })));

    await user.type(screen.getByLabelText("Search customers"), "777");
    await waitFor(() => expect(api.listCustomers).toHaveBeenLastCalledWith(expect.objectContaining({ search: "777" })), { timeout: 2000 });
  });

  it("opens the card with lifetime, credit, deposit, notes and orders", async () => {
    const user = userEvent.setup();
    render(<CustomersPanel {...manager} onClose={vi.fn()} />);

    await waitFor(() => expect(screen.getByTestId("customer-row-7")).toBeTruthy());
    await user.click(screen.getByTestId("customer-row-7"));

    const card = await screen.findByTestId("customer-card");
    await waitFor(() => expect(card.textContent).toMatch(/MVR 2450\.50/));
    expect(card.textContent).toMatch(/320/);
    expect(card.textContent).toMatch(/Owes.*MVR 150\.00/);
    expect(card.textContent).toMatch(/Balance.*MVR 200\.00/);
    expect(card.textContent).toMatch(/Allergic to nuts/);
    expect(card.textContent).toMatch(/#BG-0090/);
    expect(within(card).getByRole("button", { name: "Text" })).toBeTruthy();
    expect(within(card).getByRole("button", { name: "Change phone" })).toBeTruthy();
  });

  it("edits notes, SMS preference and active state", async () => {
    const user = userEvent.setup();
    api.updateCustomerDetail.mockResolvedValue({ customer: { ...detail, internal_notes: "Allergic to nuts. Likes it spicy.", sms_opt_out: true } });
    render(<CustomersPanel {...manager} onClose={vi.fn()} />);

    await waitFor(() => expect(screen.getByTestId("customer-row-7")).toBeTruthy());
    await user.click(screen.getByTestId("customer-row-7"));
    await user.click(await screen.findByRole("button", { name: "Edit" }));
    const notes = screen.getByLabelText("Notes (staff only)");
    await user.type(notes, " Likes it spicy.");
    await user.click(screen.getByLabelText("Does not want SMS"));
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(api.updateCustomerDetail).toHaveBeenCalledTimes(1));
    const [id, patch] = api.updateCustomerDetail.mock.calls[0];
    expect(id).toBe(7);
    expect(patch.name).toBe("Aisha");
    expect(patch.internal_notes).toBe("Allergic to nuts Likes it spicy.");
    expect(patch.sms_opt_out).toBe(true);
    expect(patch.is_active).toBe(true);
    expect(await screen.findByRole("status")).toBeTruthy();
  });

  it("records a cash credit repayment, capped at what they owe", async () => {
    const user = userEvent.setup();
    api.recordCreditRepayment.mockResolvedValue({});
    render(<CustomersPanel {...manager} onClose={vi.fn()} />);

    await waitFor(() => expect(screen.getByTestId("customer-row-7")).toBeTruthy());
    await user.click(screen.getByTestId("customer-row-7"));
    await user.click(await screen.findByRole("button", { name: "Record repayment" }));
    const form = screen.getByTestId("customer-money-form");
    const amount = within(form).getByLabelText("Amount (MVR)");
    await user.clear(amount);
    await user.type(amount, "200");
    await user.click(within(form).getByRole("button", { name: "Record" }));
    expect(within(form).getByText(/They owe MVR 150\.00/)).toBeTruthy();

    await user.clear(amount);
    await user.type(amount, "100");
    await user.click(within(form).getByRole("button", { name: "Record" }));
    await waitFor(() => expect(api.recordCreditRepayment).toHaveBeenCalledWith(7, { amount_mvr: 100, method: "cash", reference: undefined }));
  });

  it("starts an order for the customer", async () => {
    const user = userEvent.setup();
    const onStartOrder = vi.fn();
    render(<CustomersPanel {...manager} onClose={vi.fn()} onStartOrder={onStartOrder} />);

    await waitFor(() => expect(screen.getByTestId("customer-row-7")).toBeTruthy());
    await user.click(screen.getByTestId("customer-row-7"));
    await user.click(await screen.findByRole("button", { name: "Start order" }));

    expect(onStartOrder).toHaveBeenCalledWith(expect.objectContaining({ id: 7, name: "Aisha", phone: "+9607771234" }));
  });
});

describe("CustomersPanel — cashier", () => {
  it("shows recent customers, searches from two letters, and never calls the admin list", async () => {
    const user = userEvent.setup();
    api.fetchRecentCustomers.mockResolvedValue({ data: [aisha], total: 480, limit: 50 });
    api.searchCustomers.mockResolvedValue({ data: [hassan] });
    render(<CustomersPanel {...cashier} onClose={vi.fn()} />);

    await waitFor(() => expect(screen.getByTestId("customer-row-7")).toBeTruthy());
    expect(screen.getByText(/type to search all 480/)).toBeTruthy();
    expect(api.listCustomers).not.toHaveBeenCalled();
    expect(api.listCustomerSegments).not.toHaveBeenCalled();
    expect(screen.queryByTestId("customer-filters")).toBeNull();

    await user.type(screen.getByLabelText("Search customers"), "Ha");
    await waitFor(() => expect(api.searchCustomers).toHaveBeenCalledWith("Ha"), { timeout: 2000 });
    await waitFor(() => expect(screen.getByTestId("customer-row-8")).toBeTruthy());
  });

  it("opens a read-mostly card: name and e-mail only, no phone change, no money", async () => {
    const user = userEvent.setup();
    api.fetchRecentCustomers.mockResolvedValue({ data: [aisha], total: 1, limit: 50 });
    api.updateCustomerFromPos.mockResolvedValue({ customer: { id: 7, name: "Aisha Ali", phone: "+9607771234", email: null } });
    render(<CustomersPanel {...cashier} onClose={vi.fn()} />);

    await waitFor(() => expect(screen.getByTestId("customer-row-7")).toBeTruthy());
    await user.click(screen.getByTestId("customer-row-7"));
    const card = await screen.findByTestId("customer-card");
    expect(api.getCustomerDetail).not.toHaveBeenCalled();
    expect(within(card).queryByRole("button", { name: "Change phone" })).toBeNull();
    expect(within(card).queryByRole("button", { name: "Record repayment" })).toBeNull();
    expect(within(card).queryByRole("button", { name: "Text" })).toBeNull();

    await user.click(within(card).getByRole("button", { name: "Edit" }));
    expect(screen.queryByLabelText("Notes (staff only)")).toBeNull();
    const nameField = screen.getByLabelText("Name");
    await user.clear(nameField);
    await user.type(nameField, "Aisha Ali");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(api.updateCustomerFromPos).toHaveBeenCalledWith(7, { name: "Aisha Ali", email: null }));
  });

  it("adds a new customer by phone", async () => {
    const user = userEvent.setup();
    api.fetchRecentCustomers.mockResolvedValue({ data: [], total: 0, limit: 50 });
    api.quickCreateCustomer.mockResolvedValue({ customer: { id: 99, name: "Mariyam", phone: "+9607770000" }, created: true });
    render(<CustomersPanel {...cashier} onClose={vi.fn()} />);

    await user.click(await screen.findByRole("button", { name: "+ New" }));
    const dialog = screen.getByRole("dialog", { name: "New customer" });
    await user.type(within(dialog).getByLabelText("Phone"), "7770000");
    await user.type(within(dialog).getByLabelText("Name (optional)"), "Mariyam");
    await user.click(within(dialog).getByRole("button", { name: "Add customer" }));

    await waitFor(() => expect(api.quickCreateCustomer).toHaveBeenCalledWith({ phone: "+9607770000", name: "Mariyam" }));
    await waitFor(() => expect(screen.getByTestId("customer-row-99")).toBeTruthy());
  });
});
