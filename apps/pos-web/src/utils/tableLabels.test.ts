/**
 * Number stands for self-seating dine-in (owner, 2026-10-22): the lowest
 * free number is the one the till gives a ticket; retired, held, reserved and
 * closed stands are never offered; real tables are kept apart.
 */
import { describe, expect, it } from "vitest";
import type { RestaurantTable } from "../types";
import { freeStands, isStand, lowestFreeStand, realTables, standNumber, tableNameOf } from "./tableLabels";

const t = (over: Partial<RestaurantTable> & { id: number; name: string }): RestaurantTable =>
  ({ status: "available", current_order_id: null, is_active: true, ...over }) as unknown as RestaurantTable;

const tables: RestaurantTable[] = [
  t({ id: 1, name: "T1" }),
  t({ id: 2, name: "T2", status: "occupied", current_order_id: 77 }),
  t({ id: 12, name: "No. 12", kind: "stand" }),
  t({ id: 10, name: "No. 2", kind: "stand" }),
  t({ id: 11, name: "No. 3", kind: "stand", current_order_id: 78 }),
  t({ id: 13, name: "No. 1", kind: "stand", is_active: false }),
  t({ id: 14, name: "No. 4", kind: "stand", status: "closed" }),
];

describe("number stands", () => {
  it("tells a stand from a table and reads its number", () => {
    expect(isStand(tables[2])).toBe(true);
    expect(isStand(tables[0])).toBe(false);
    expect(standNumber(tables[2])).toBe(12);
    expect(realTables(tables).map((x) => x.name)).toEqual(["T1", "T2"]);
  });

  it("offers the free numbers lowest first, never a retired, held or closed one", () => {
    expect(freeStands(tables).map((x) => x.name)).toEqual(["No. 2", "No. 12"]);
    expect(lowestFreeStand(tables)?.name).toBe("No. 2");
    expect(lowestFreeStand([tables[0], tables[1]])).toBeNull();
  });

  it("names a seat by id", () => {
    expect(tableNameOf(tables, 12)).toBe("No. 12");
    expect(tableNameOf(tables, null)).toBeNull();
    expect(tableNameOf(tables, 999)).toBeNull();
  });
});
