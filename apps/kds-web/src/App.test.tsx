import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import App from "./App";

vi.mock("./api", () => ({
  staffLogin: vi.fn(),
  fetchMe: vi.fn(),
  fetchKdsOrders: vi.fn().mockResolvedValue([]),
  fetchKdsMenuGroups: vi.fn().mockResolvedValue([]),
  startOrder: vi.fn(),
  kitchenDoneOrder: vi.fn(),
  printKitchenTicket: vi.fn(),
  bumpOrder: vi.fn(),
  recallOrder: vi.fn(),
  markItem86: vi.fn(),
  hasKdsPermission: (perms: string[], slug: string) => perms.includes(slug),
}));

describe("KDS App", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it("renders the login header with username field", () => {
    render(<App />);
    expect(screen.getByText(/Kitchen Display/i)).toBeInTheDocument();
    expect(screen.getByText(/Email or phone/i)).toBeInTheDocument();
  });
});
