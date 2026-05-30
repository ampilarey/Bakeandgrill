import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { RequestItemModal } from "./RequestItemModal";

vi.mock("../api", () => ({
  createPurchaseRequest: vi.fn().mockResolvedValue({ request: { id: 1 } }),
  uploadPurchaseRequestAttachment: vi.fn(),
}));

describe("RequestItemModal", () => {
  it("renders form and submits item name", async () => {
    const onClose = vi.fn();
    render(<RequestItemModal onClose={onClose} />);
    expect(screen.getByRole("dialog", { name: /Request items/i })).toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: /Item name/i }), { target: { value: "Napkins" } });
    fireEvent.click(screen.getByRole("button", { name: /Submit request/i }));
    const { createPurchaseRequest } = await import("../api");
    expect(createPurchaseRequest).toHaveBeenCalled();
  });
});
