import type { Pane } from "./types";

export function paneTitle(p: Pane): string {
  switch (p) {
    case "sales": return "Sale";
    case "receipts": return "Receipts";
    case "open_tickets": return "Active Orders";
    case "events": return "Events";
    case "shift": return "Current Shift";
    case "shift_history": return "Shift History";
    case "sales_report": return "Sales Reports";
    case "ops": return "Operations";
    case "expenses": return "Expenses";
    case "my_requests": return "My Requests";
    case "buying_list": return "Buying List";
    case "to_receive": return "To Receive";
    case "kitchen_receiving": return "Kitchen Receive";
    default: return "POS";
  }
}

export function shouldShowStatusBanner(text: string): boolean {
  return /failed|couldn't|unable|error|invalid|offline|expired|before you can|add at least|network|queue full|retry|not recorded|reward failed|⚠|session expired|sync paused|need payment/i.test(text);
}

export function Banner({ text }: { text: string }) {
  return (
    <div role="alert" style={{
      background: '#FEF2F2', borderRadius: 8, padding: '10px 14px',
      fontSize: 13, color: '#991B1B', border: '1px solid #FECACA', marginBottom: 6,
    }}>{text}</div>
  );
}

export function NoticeBanner({ text }: { text: string }) {
  return (
    <div role="status" style={{
      background: '#FFFBEB', borderRadius: 8, padding: '10px 14px',
      fontSize: 13, color: '#92400E', border: '1px solid #FDE68A', marginBottom: 6,
    }}>{text}</div>
  );
}
