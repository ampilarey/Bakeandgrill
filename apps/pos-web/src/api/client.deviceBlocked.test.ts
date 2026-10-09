import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/*
 * Owner, 2026-10-07: "New pos can be used before approval." Any request the
 * server refuses because of this till tells the app, which locks at once.
 */
describe("a request refused because of this till", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const refuse = (status: number, body: unknown) =>
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }),
    );

  it.each(["device_not_approved", "device_rejected", "device_disabled"])("%s locks the till", async (code) => {
    const { request, DEVICE_BLOCKED_EVENT } = await import("./client");
    const blocked = vi.fn();
    window.addEventListener(DEVICE_BLOCKED_EVENT, blocked);
    refuse(403, { message: "This POS device is waiting for approval.", code });

    await expect(request("/orders")).rejects.toThrow();

    expect(blocked).toHaveBeenCalledTimes(1);
    window.removeEventListener(DEVICE_BLOCKED_EVENT, blocked);
  });

  it("a refusal of the person, not the till, asks for their permissions again", async () => {
    const { request, DEVICE_BLOCKED_EVENT, PERMISSIONS_STALE_EVENT } = await import("./client");
    const stale = vi.fn();
    const blocked = vi.fn();
    window.addEventListener(PERMISSIONS_STALE_EVENT, stale);
    window.addEventListener(DEVICE_BLOCKED_EVENT, blocked);

    refuse(403, { message: "You are not allowed to ring Pickup orders. Ask the owner to allow it in Admin → Staff." });
    await expect(request("/orders")).rejects.toThrow();
    expect(stale).toHaveBeenCalledTimes(1);
    expect(blocked).not.toHaveBeenCalled();

    // A refused till locks instead; other failures are not about permissions.
    refuse(403, { message: "This POS device is waiting for approval.", code: "device_not_approved" });
    await expect(request("/orders")).rejects.toThrow();
    refuse(422, { message: "The given data was invalid." });
    await expect(request("/orders")).rejects.toThrow();
    expect(stale).toHaveBeenCalledTimes(1);

    window.removeEventListener(PERMISSIONS_STALE_EVENT, stale);
    window.removeEventListener(DEVICE_BLOCKED_EVENT, blocked);
  });

  it("other refusals do not", async () => {
    const { request, DEVICE_BLOCKED_EVENT } = await import("./client");
    const blocked = vi.fn();
    window.addEventListener(DEVICE_BLOCKED_EVENT, blocked);
    refuse(403, { message: "You do not have permission.", code: "forbidden" });

    await expect(request("/orders")).rejects.toThrow();

    expect(blocked).not.toHaveBeenCalled();
    window.removeEventListener(DEVICE_BLOCKED_EVENT, blocked);
  });
});
