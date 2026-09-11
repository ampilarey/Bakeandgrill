import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchMe, fetchKdsOrders, fetchKdsMenuGroups, fetchKdsActivity } from "./api";

/*
 * Owner, 2026-09-11: "I created kitchen staff acc. But when he tries to logon
 * kds app it says no kds access for this account."
 *
 * fetchMe returned the `{ user: … }` envelope while its type said it returned
 * the user inside it, so `me.permissions` was undefined for every account and
 * the login screen refused all of them. Nothing caught it: `tsc` believed the
 * `request<KdsStaffUser>` assertion, and App.test.tsx mocks `fetchMe` with the
 * shape the code wished for rather than the one the server sends.
 *
 * So these tests mock the transport — global fetch — with the real response
 * bodies and check what each function hands back. A mock of the function under
 * test can only ever confirm what the author already believed.
 */

function respondWith(body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => body,
    headers: new Headers({ "content-type": "application/json" }),
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("KDS API response shapes", () => {
  it("hands back the user, not the envelope it arrives in", async () => {
    // Exactly what StaffAuthController::me() returns.
    vi.stubGlobal(
      "fetch",
      respondWith({
        user: {
          id: 7,
          name: "Cook",
          role: "kitchen_staff",
          permissions: ["kds.view", "kds.start_order"],
        },
      }),
    );

    const me = await fetchMe("token");

    expect(me.name).toBe("Cook");
    expect(me.permissions).toContain("kds.view");
  });

  it("unwraps the order list", async () => {
    vi.stubGlobal("fetch", respondWith({ orders: [{ id: 1, order_number: "A1" }] }));

    await expect(fetchKdsOrders("token")).resolves.toHaveLength(1);
  });

  it("unwraps the menu groups", async () => {
    vi.stubGlobal("fetch", respondWith({ data: [{ id: 2, name: "Grill" }] }));

    const groups = await fetchKdsMenuGroups("token");

    expect(groups[0]?.name).toBe("Grill");
  });

  it("unwraps the activity strip", async () => {
    vi.stubGlobal("fetch", respondWith({ activity: [{ id: 3, action: "order.fired_to_kitchen" }] }));

    await expect(fetchKdsActivity("token")).resolves.toHaveLength(1);
  });
});
