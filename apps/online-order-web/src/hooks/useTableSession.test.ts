import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useTableSession } from "./useTableSession";
import * as orders from "../api/orders";

vi.mock("../api/orders", async () => {
  const actual = await vi.importActual<typeof import("../api/orders")>("../api/orders");
  return { ...actual, lookupTableByQr: vi.fn() };
});

const lookup = () => orders.lookupTableByQr as unknown as ReturnType<typeof vi.fn>;
const TOKEN = "a".repeat(24);

/**
 * The token arrives once, in the URL the QR encodes, and has to survive the
 * rest of the visit — browse, log in, checkout — by which time the query
 * string is long gone.
 */
describe("table session", () => {
  const setUrl = (search: string) => {
    window.history.replaceState({}, "", `/${search}`);
  };

  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    setUrl("");
  });

  afterEach(() => setUrl(""));

  it("is absent when nobody scanned anything", async () => {
    const { result } = renderHook(() => useTableSession());

    await waitFor(() => expect(result.current.checking).toBe(false));
    expect(result.current.token).toBeNull();
    expect(lookup()).not.toHaveBeenCalled();
  });

  it("confirms the table name with the server before showing it", async () => {
    lookup().mockResolvedValue({ table: { name: "T4", location: null } });
    setUrl(`?table=${TOKEN}`);

    const { result } = renderHook(() => useTableSession());

    await waitFor(() => expect(result.current.name).toBe("T4"));
    expect(lookup()).toHaveBeenCalledWith(TOKEN);
    expect(result.current.token).toBe(TOKEN);
  });

  it("remembers the table after the query string is gone", async () => {
    // The customer browses the menu and logs in before reaching checkout.
    lookup().mockResolvedValue({ table: { name: "T4", location: null } });
    setUrl(`?table=${TOKEN}`);
    const first = renderHook(() => useTableSession());
    await waitFor(() => expect(first.result.current.name).toBe("T4"));

    setUrl("");
    const second = renderHook(() => useTableSession());

    await waitFor(() => expect(second.result.current.name).toBe("T4"));
  });

  it("says so on the menu when the code is not in use", async () => {
    // Better here than at the end of an order.
    lookup().mockRejectedValue(new Error("not found"));
    setUrl(`?table=${TOKEN}`);

    const { result } = renderHook(() => useTableSession());

    await waitFor(() => expect(result.current.error).toContain("not in use"));
    expect(result.current.token).toBeNull();
    expect(sessionStorage.getItem("bg_table_token")).toBeNull();
  });

  it("lets a new scan move the party to another table", async () => {
    lookup().mockResolvedValue({ table: { name: "T4", location: null } });
    setUrl(`?table=${TOKEN}`);
    await waitFor(async () => {
      const first = renderHook(() => useTableSession());
      await waitFor(() => expect(first.result.current.name).toBe("T4"));
    });

    const moved = "b".repeat(24);
    lookup().mockResolvedValue({ table: { name: "T9", location: null } });
    setUrl(`?table=${moved}`);
    const second = renderHook(() => useTableSession());

    await waitFor(() => expect(second.result.current.name).toBe("T9"));
    expect(second.result.current.token).toBe(moved);
  });

  it("ignores a token that is not the right shape", async () => {
    // A truncated or hand-typed value should not become a server round-trip.
    setUrl("?table=nope");

    const { result } = renderHook(() => useTableSession());

    await waitFor(() => expect(result.current.checking).toBe(false));
    expect(lookup()).not.toHaveBeenCalled();
  });
});
