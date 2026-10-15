import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useOpenTickets } from "./useOpenTickets";
import type { OpenTicket } from "../utils/openTicketUtils";

const markOrderReady = vi.fn();
const markOrderPickedUp = vi.fn();
const sendBill = vi.fn();
const sendPayLink = vi.fn();
const empty = { data: [] as OpenTicket[], total: 0 };

vi.mock("../api", () => ({
  fireOrderToKitchen: vi.fn(),
  fetchActiveOrdersVenueWide: () => Promise.resolve(empty),
  fetchActiveOrdersMine: () => Promise.resolve(empty),
  fetchActiveOrdersOnline: () => Promise.resolve(empty),
  cancelOrder: vi.fn(),
  markOrderPickedUp: (...a: unknown[]) => markOrderPickedUp(...a),
  markOrderReady: (...a: unknown[]) => markOrderReady(...a),
  startOrderCooking: vi.fn(),
  mergeOpenTickets: vi.fn(),
  sendBill: (...a: unknown[]) => sendBill(...a),
  sendPayLink: (...a: unknown[]) => sendPayLink(...a),
  splitOpenTicket: vi.fn(),
}));

const t = {
  id: 7, order_number: "BG-7", ticket_name: "Dr Jay", status: "ready", payment_status: "paid",
  type: "takeaway", total: 120, items: [], customer: { id: 1, name: "Jay", phone: "7771234" },
  created_at: new Date().toISOString(),
} as unknown as OpenTicket;

describe("Active orders: a second approval (owner, 2026-10-15)", () => {
  beforeEach(() => {
    [markOrderReady, markOrderPickedUp, sendBill, sendPayLink].forEach((f) => f.mockReset());
    markOrderReady.mockResolvedValue({ order: { status: "ready" }, unchanged: false });
    markOrderPickedUp.mockResolvedValue({ unchanged: false });
  });

  it("Mark ready asks first and only marks on Mark ready in the pop-up", async () => {
    const { result } = renderHook(() => useOpenTickets());
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => result.current.handleMarkReady(t));
    expect(markOrderReady).not.toHaveBeenCalled();
    expect(result.current.statusConfirm).toEqual({ ticket: t, kind: "ready" });
    await act(async () => { await result.current.confirmStatus(); });
    expect(markOrderReady).toHaveBeenCalledWith(7);
    expect(result.current.statusConfirm).toBeNull();
  });

  it("Collected asks first, and Not yet leaves the order alone", async () => {
    const { result } = renderHook(() => useOpenTickets());
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => result.current.handleMarkPickedUp(t));
    expect(result.current.statusConfirm?.kind).toBe("done");
    act(() => result.current.cancelStatusConfirm());
    expect(result.current.statusConfirm).toBeNull();
    expect(markOrderPickedUp).not.toHaveBeenCalled();
  });

  it("Send bill and Send pay link open the number to check, even with a linked customer", async () => {
    const { result } = renderHook(() => useOpenTickets());
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => result.current.handleSendBill(t));
    expect(sendBill).not.toHaveBeenCalled();
    expect(result.current.phonePrompt).toMatchObject({ phone: "7771234", purpose: "bill" });
    act(() => result.current.setPhonePrompt(null));
    act(() => result.current.handleSendPayLink(t));
    expect(sendPayLink).not.toHaveBeenCalled();
    expect(result.current.phonePrompt).toMatchObject({ phone: "7771234", purpose: "pay_link" });
  });

  it("Copy / Share bill link fetches the link without sending anything", async () => {
    sendBill.mockResolvedValue({ link: "https://example.test/invoices/abc" });
    const { result } = renderHook(() => useOpenTickets());
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { await result.current.handleBillLink(t, true); });
    expect(sendBill).toHaveBeenCalledWith(7);
    expect(result.current.billLink).toMatchObject({ url: "https://example.test/invoices/abc", copyOnOpen: true });
  });
});
