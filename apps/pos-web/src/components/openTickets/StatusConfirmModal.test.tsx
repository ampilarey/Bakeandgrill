import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { StatusConfirmModal } from "./StatusConfirmModal";
import { BillLinkModal, billShareText } from "./BillLinkModal";
import type { OpenTicket } from "../../utils/openTicketUtils";

const t = {
  id: 3, order_number: "BG-3", ticket_name: "Dr Jay", type: "takeaway", status: "ready",
  payment_status: "unpaid", total: "45.00", items: [{ id: 1, total_price: "45.00" }],
  customer: { id: 1, name: "Jay", phone: "7771234" },
} as unknown as OpenTicket;

describe("StatusConfirmModal", () => {
  it("names Collected for a takeaway and says it cannot be undone", () => {
    const onConfirm = vi.fn();
    render(<StatusConfirmModal ticket={t} kind="done" busy={false} onCancel={vi.fn()} onConfirm={onConfirm} />);
    expect(screen.getByText("Collected?")).toBeInTheDocument();
    expect(screen.getByTestId("status-confirm-note")).toHaveTextContent("can't be undone");
    fireEvent.click(screen.getByTestId("status-confirm-ok"));
    expect(onConfirm).toHaveBeenCalled();
  });

  it("warns that Mark ready tells the customer", () => {
    render(<StatusConfirmModal ticket={t} kind="ready" busy={false} onCancel={vi.fn()} onConfirm={vi.fn()} />);
    expect(screen.getByTestId("status-confirm-note")).toHaveTextContent("customer is told");
  });
});

describe("BillLinkModal", () => {
  it("shows the link with WhatsApp to the customer's number and Viber", () => {
    const url = "https://example.test/invoices/abc";
    render(<BillLinkModal ticket={t} url={url} error={null} copyOnOpen={false} onClose={vi.fn()} />);
    expect(screen.getByTestId("bill-link-url")).toHaveTextContent(url);
    const text = encodeURIComponent(billShareText(t, url));
    expect(screen.getByTestId("bill-link-whatsapp")).toHaveAttribute("href", `https://wa.me/9607771234?text=${text}`);
    expect(screen.getByTestId("bill-link-viber")).toHaveAttribute("href", `viber://forward?text=${text}`);
    expect(billShareText(t, url)).toContain("View and pay online");
  });

  it("copies the link on Copy link", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<BillLinkModal ticket={t} url="https://x.test/i/1" error={null} copyOnOpen={false} onClose={vi.fn()} />);
    fireEvent.click(screen.getByTestId("bill-link-copy"));
    expect(writeText).toHaveBeenCalledWith("https://x.test/i/1");
    expect(await screen.findByTestId("bill-link-copied")).toBeInTheDocument();
  });
});
