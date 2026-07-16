import { ApiRequestError } from "@shared/api";
import { describe, expect, it } from "vitest";
import { classifyShiftRefreshError } from "./useShift";

describe("classifyShiftRefreshError", () => {
  it("treats 404 as an authoritative missing shift", () => {
    expect(classifyShiftRefreshError(new ApiRequestError("Not found", 404))).toBe("no_shift");
  });

  it("treats server failures as transient", () => {
    expect(classifyShiftRefreshError(new ApiRequestError("Redis unavailable", 500))).toBe("transient");
  });

  it("treats network failures as transient", () => {
    expect(classifyShiftRefreshError(new TypeError("Failed to fetch"))).toBe("transient");
  });
});
