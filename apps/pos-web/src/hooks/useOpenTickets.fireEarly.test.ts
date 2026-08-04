import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { businessTodayYmd } from "@shared/utils/businessDay";
import { useOpenTickets } from "./useOpenTickets";
import type { OpenTicket } from "../utils/openTicketUtils";

const fireOrderToKitchen = vi.fn();
const fetchActiveOrdersVenueWide = vi.fn();
const fetchActiveOrdersMine = vi.fn();
const fetchActiveOrdersOnline = vi.fn();

vi.mock("../api", () => ({
  fireOrderToKitchen: (...args: unknown[]) => fireOrderToKitchen(...args),
  fetchActiveOrdersVenueWide: (...args: unknown[]) => fetchActiveOrdersVenueWide(...args),
  fetchActiveOrdersMine: (...args: unknown[]) => fetchActiveOrdersMine(...args),
  fetchActiveOrdersOnline: (...args: unknown[]) => fetchActiveOrdersOnline(...args),
  cancelOrder: vi.fn(),
  markOrderPickedUp: vi.fn(),
  markOrderReady: vi.fn(),
  startOrderCooking: vi.fn(),
  mergeOpenTickets: vi.fn(),
  sendBill: vi.fn(),
  sendPayLink: vi.fn(),
  splitOpenTicket: vi.fn(),
}));

function localTomorrowYmd(): string {
  const today = businessTodayYmd();
  const base = new Date(`${today}T12:00:00+05:00`);
  base.setTime(base.getTime() + 24 * 3600_000);
  return businessTodayYmd(base);
}

function ticket(partial: Partial<OpenTicket> & Pick<OpenTicket, "id">): OpenTicket {
  return {
    order_number: `BG-${partial.id}`,
    ticket_name: null,
    status: "held",
    payment_status: "paid",
    type: "takeaway",
    total: 100,
    created_at: new Date().toISOString(),
    held_at: new Date().toISOString(),
    fired_at: null,
    fulfil_date: null,
    items: [],
    customer: null,
    ...partial,
  } as OpenTicket;
}

describe("handleFireToKitchen — early-fire confirm", () => {
  beforeEach(() => {
    fireOrderToKitchen.mockReset();
    fireOrderToKitchen.mockResolvedValue(undefined);
    const empty = { data: [] as OpenTicket[], total: 0 };
    fetchActiveOrdersVenueWide.mockResolvedValue(empty);
    fetchActiveOrdersMine.mockResolvedValue(empty);
    fetchActiveOrdersOnline.mockResolvedValue(empty);
  });

  it("does not call the API on first tap for a tomorrow-stage ticket", async () => {
    const { result } = renderHook(() => useOpenTickets());
    await waitFor(() => expect(result.current.loading).toBe(false));

    const t = ticket({
      id: 11,
      status: "paid",
      held_at: null,
      fulfil_date: localTomorrowYmd(),
    });

    act(() => {
      result.current.handleFireToKitchen(t);
    });

    expect(fireOrderToKitchen).not.toHaveBeenCalled();
    expect(result.current.fireEarlyConfirm?.id).toBe(11);
  });

  it("calls the API after confirming early fire", async () => {
    const { result } = renderHook(() => useOpenTickets());
    await waitFor(() => expect(result.current.loading).toBe(false));

    const t = ticket({
      id: 12,
      status: "paid",
      held_at: null,
      fulfil_date: localTomorrowYmd(),
    });

    act(() => {
      result.current.handleFireToKitchen(t);
    });
    expect(fireOrderToKitchen).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.confirmFireEarly();
    });

    expect(fireOrderToKitchen).toHaveBeenCalledTimes(1);
    expect(fireOrderToKitchen).toHaveBeenCalledWith(12);
    expect(result.current.fireEarlyConfirm).toBeNull();
  });

  it("fires an ordinary parked ticket on the first tap with no confirmation", async () => {
    const { result } = renderHook(() => useOpenTickets());
    await waitFor(() => expect(result.current.loading).toBe(false));

    const t = ticket({
      id: 13,
      status: "held",
      fulfil_date: null,
    });

    await act(async () => {
      result.current.handleFireToKitchen(t);
    });

    await waitFor(() => expect(fireOrderToKitchen).toHaveBeenCalledTimes(1));
    expect(fireOrderToKitchen).toHaveBeenCalledWith(13);
    expect(result.current.fireEarlyConfirm).toBeNull();
  });

  it("fires a collect-tomorrow ticket on collection day with no confirmation", async () => {
    const { result } = renderHook(() => useOpenTickets());
    await waitFor(() => expect(result.current.loading).toBe(false));

    const t = ticket({
      id: 14,
      status: "paid",
      held_at: null,
      // Collection day = today → stage "parked", not "tomorrow"
      fulfil_date: businessTodayYmd(),
    });

    await act(async () => {
      result.current.handleFireToKitchen(t);
    });

    await waitFor(() => expect(fireOrderToKitchen).toHaveBeenCalledTimes(1));
    expect(fireOrderToKitchen).toHaveBeenCalledWith(14);
    expect(result.current.fireEarlyConfirm).toBeNull();
  });
});
