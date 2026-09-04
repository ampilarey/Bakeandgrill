import { useEffect, useMemo, useRef, useState } from "react";
import { CashInput } from "./CashInput";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { fetchCurrencyImages, getApiBaseUrl } from "../api";
import { currencyAssetForLaari } from "../utils/cashDenominations";
import { z } from "../theme";

export type ChargeMethod = "cash" | "card" | "qr" | "digital_wallet" | "house_account" | "wallet";

/** Maldivian note faces (MVR) available as photo quick-tenders. */
export const QUICK_NOTES_MVR = [5, 10, 20, 50, 100, 500, 1000] as const;

/**
 * Pick up to `max` note photos for Charge quick amounts.
 *
 * Cashiers multi-select notes into Received, so we must offer useful
 * notes *below* the total (e.g. 500+100+50 for a 605 bill) as well as
 * covering notes above it — not only faces ≥ total (which left a 605
 * bill with just the 1000 photo).
 *
 * Strategy: take the largest notes under the total (combine), then the
 * smallest notes at/above the total (single-note cover / change), fill
 * to `max`, display ascending.
 */
export function pickChargeQuickNotes(total: number, max = 5): number[] {
  if (!(total > 0) || max <= 0) return [];
  const belowDesc = QUICK_NOTES_MVR.filter((n) => n < total).slice().sort((a, b) => b - a);
  const aboveAsc = QUICK_NOTES_MVR.filter((n) => n >= total).slice().sort((a, b) => a - b);

  const picked: number[] = [];
  const used = new Set<number>();
  const take = (n: number) => {
    if (picked.length >= max || used.has(n)) return;
    picked.push(n);
    used.add(n);
  };

  // Prefer up to 3 combine-friendly notes under the total (largest first).
  for (const n of belowDesc.slice(0, 3)) take(n);
  // Then covering notes (smallest overpay first).
  for (const n of aboveAsc) take(n);
  // Fill remaining slots from leftover below notes, then any leftover above.
  for (const n of belowDesc) take(n);
  for (const n of aboveAsc) take(n);

  return picked.sort((a, b) => a - b);
}

/** /storage URLs live at the site root, not under the API prefix. */
function absoluteMediaUrl(path: string): string {
  if (/^https?:\/\//.test(path)) return path;
  try {
    return new URL(path, getApiBaseUrl()).toString();
  } catch {
    return path;
  }
}

type Props = {
  total: number;
  /** Optional breakdown — when supplied, the Charge screen shows the
   *  Subtotal / Discount / GST stack above the big "Amount due" number
   *  so the cashier (and customer) can see exactly how the total was
   *  built. Backed by `useCart`'s `cartSubtotal`, `discountValue`, and
   *  `cartTax`. Older callers can omit them; the overlay degrades to
   *  just the headline number. */
  subtotal?: number;
  discount?: number;
  tax?: number;
  serviceCharge?: number;
  serviceChargeLabel?: string;
  packagingFee?: number;
  /** Optional delivery fee line (POS phone-in delivery). */
  deliveryFee?: number;
  /** Gift-card tender applied to the ticket (MVR). Rendered as the
   *  last −MVR line before "Amount due" so the breakdown always sums
   *  to the headline total. */
  giftTender?: number;
  /** Show Credit Account tender when customer is approved for credit. */
  creditEligible?: boolean;
  creditAvailableMvr?: number;
  /**
   * FIX 8 — cashier permission bit for `payments.credit`. Used purely
   * to show the "attach a customer / customer has no credit account"
   * hints when the button would otherwise be silently missing. The
   * actual gate on eligibility is still `creditEligible` (server-side
   * approved) — this is only about discoverability.
   */
  canPayCredit?: boolean;
  /** Whether a customer is currently attached to the ticket. Drives
   *  the "Attach a customer to charge a credit account" hint (FIX 9c). */
  hasAttachedCustomer?: boolean;
  /**
   * FIX 8 — timestamp (ms) of the last credit summary fetch. Rendered
   * as "as of just now / N min ago" beneath the credit banner so the
   * cashier can see the reading is fresh after tapping the tender.
   */
  creditLastRefreshedAt?: number | null;
  /**
   * FIX 8 — callback invoked when the cashier selects the credit
   * tender. The parent re-fetches the customer summary; the overlay
   * echoes an "as of just now" pill once the new numbers land.
   */
  onSelectCredit?: () => void;
  /** Show customer deposit tender when customer has prepaid balance. */
  walletEligible?: boolean;
  walletAvailableMvr?: number;
  /** When true, only cash / card / transfer / QR are offered. */
  isOffline?: boolean;
  /** Hide tender types the cashier is not permitted to use. */
  allowedTenders?: {
    cash?: boolean;
    card?: boolean;
    qr?: boolean;
    digital_wallet?: boolean;
    split?: boolean;
  };
  onClose: () => void;
  onConfirm: (rows: Array<{ method: ChargeMethod; amount: number; tendered_amount?: number }>) => Promise<void>;
  submitting: boolean;
  /** Optional inline error to surface inside the overlay. The overlay
   *  is z-index 900 (covers the cart status banner area), so without
   *  this any failure in handleCharge would look like "the Confirm
   *  button did nothing". Caller wires this to the order hook's
   *  statusMessage so device-blocked / table / network errors land
   *  on the cashier's screen. */
  errorMessage?: string;
  /** Amber reward-apply warning (promo/loyalty/gift failures) above Confirm. */
  rewardWarning?: string;
  /** When set, Confirm retries settlement only — no new order is created. */
  pendingPaymentOrderId?: number | null;
};

const METHOD_LABEL: Record<ChargeMethod, string> = {
  cash: "Cash",
  card: "Card",
  qr: "QR",
  digital_wallet: "Transfer",
  house_account: "Credit Account",
  wallet: "Pay from Deposit",
};

/**
 * Full-screen charge screen, the way every Loyverse-style POS works.
 * The cashier sees ONE huge number (the amount due), taps the tender,
 * optionally enters a received amount for cash, and gets a giant
 * change-due readout. The previous flow buried payment inputs in the
 * tiny cart sidebar — too cramped for a real counter.
 */
export function ChargeOverlay({
  total,
  subtotal,
  discount,
  tax,
  serviceCharge,
  serviceChargeLabel,
  packagingFee,
  deliveryFee,
  giftTender,
  creditEligible = false,
  creditAvailableMvr = 0,
  canPayCredit = false,
  hasAttachedCustomer = false,
  creditLastRefreshedAt = null,
  onSelectCredit,
  walletEligible = false,
  walletAvailableMvr = 0,
  isOffline = false,
  allowedTenders,
  onClose,
  onConfirm,
  submitting,
  errorMessage,
  rewardWarning,
  pendingPaymentOrderId = null,
}: Props) {
  const tenderAllowed = useMemo(() => ({
    cash: allowedTenders?.cash !== false,
    card: allowedTenders?.card !== false,
    qr: allowedTenders?.qr !== false,
    digital_wallet: allowedTenders?.digital_wallet !== false,
    split: allowedTenders?.split !== false,
  }), [allowedTenders?.cash, allowedTenders?.card, allowedTenders?.qr, allowedTenders?.digital_wallet, allowedTenders?.split]);
  const baseMethods = useMemo(
    () => (["cash", "card", "digital_wallet", "qr"] as const).filter((m) => tenderAllowed[m]),
    [tenderAllowed],
  );
  const showBreakdown =
    (typeof subtotal === "number" && (
      subtotal !== total
      || (tax ?? 0) > 0
      || (discount ?? 0) > 0
      || (serviceCharge ?? 0) > 0
      || (packagingFee ?? 0) > 0
      || (deliveryFee ?? 0) > 0
      || (giftTender ?? 0) > 0
    ));
  /** Phone: collapse Discount / service / fees / gift under a chevron so
   *  the Received | breakdown row stays short. iPad always shows all. */
  const hasExtraBreakdown =
    (discount ?? 0) > 0
    || (serviceCharge ?? 0) > 0
    || (packagingFee ?? 0) > 0
    || (deliveryFee ?? 0) > 0
    || (giftTender ?? 0) > 0;
  const [breakdownOpen, setBreakdownOpen] = useState(false);
  const [method, setMethod] = useState<ChargeMethod>("cash");
  /**
   * What the customer handed over. Starts EMPTY on purpose.
   *
   * It used to be pre-filled with the order total, and cash is the
   * preselected method, so Charge → Confirm went straight through without the
   * cashier touching a thing. A card sale then landed in the books as cash on
   * two taps, and the first anyone knew was the drawer coming up over at
   * close. Owner, 2026-09-01.
   *
   * Empty means Confirm stays locked for a cash tender until somebody says how
   * much came in — Exact, a note chip, or typed. One deliberate act, which is
   * all that separates "counted the money" from "tapped through".
   *
   * The dim Confirm button is the only prompt. A line of text explaining it
   * sat here briefly and the owner had it removed: the quick-amount row is
   * right above the button, so a cashier who taps a dead Confirm looks up and
   * finds it. The lock is the point; the caption was not.
   */
  const [received, setReceived] = useState<string>("");
  /** Face values (MVR) of note photos the cashier has tapped — sum → Received. */
  const [selectedNotes, setSelectedNotes] = useState<number[]>([]);
  /** Faces whose photo would not load; those chips name themselves instead. */
  const [brokenNotes, setBrokenNotes] = useState<number[]>([]);
  /** Owner-uploaded note photos (laari face → URL); bundled assets otherwise. */
  const [customImages, setCustomImages] = useState<Record<string, string>>({});
  /**
   * Split-tender mode. When on, the cashier enters how much is being
   * collected on the selected non-cash method; the remainder is
   * automatically billed to cash. Two rows total — POS-019 audit
   * called out that the pre-fix overlay accepted an array but only
   * ever sent one row, dropping all split-payment intent on the floor.
   */
  const [split, setSplit] = useState(false);
  const [splitAmount, setSplitAmount] = useState<string>("");
  /** Phone Charge layout: Received sits beside Subtotal/GST (one CashInput only). */
  const [isPhoneCharge, setIsPhoneCharge] = useState(() => {
    try {
      return typeof window !== "undefined"
        && typeof window.matchMedia === "function"
        && window.matchMedia("(max-width: 840px)").matches;
    } catch {
      return false;
    }
  });

  // Same source as Close shift — Admin → Currency Photos.
  useEffect(() => {
    let alive = true;
    void fetchCurrencyImages().then((images) => {
      if (alive) setCustomImages(images);
    });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(max-width: 840px)");
    const apply = () => setIsPhoneCharge(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  // Clear the received amount whenever the total or method changes — a stale
  // figure from a prior order must never stand in for a fresh count, and
  // switching to cash from another method has to ask again.
  useEffect(() => {
    setReceived("");
    setSelectedNotes([]);
    setBreakdownOpen(false);
  }, [total, method]);

  /**
   * Keep the method on something the cashier is allowed to use — but never at
   * the cost of a count already on the counter.
   *
   * Owner, 2026-09-04: "In charge, when I click 10 it goes to card. And gets
   * stuck for a while. But when I restart it's ok." Earlier: "when the payment
   * was 3 and I click the 100 note it enters as 10", "it changes to transfer
   * and freez". The tap was never the fault. `allowedTenders` is derived from
   * staff permissions, and `/auth/me` refreshes those on a timer after login
   * and again on unlock. If a refresh comes back without `payments.cash` —
   * a slow phone, a partial response, a re-auth — cash left the list while the
   * Charge screen was open. This effect then moved the tender to the first one
   * remaining (Card), and the `[total, method]` effect below wiped Received
   * and every note already tapped in. From behind the counter that reads as
   * "I pressed 10 and it jumped to Card and lost my count".
   *
   * So: a payment in progress is never interrupted. If money has been counted,
   * the cashier stays where they are and finishes; a permissions blip can wait
   * until the next sale. Nothing is bypassed — the server checks the tender
   * again on confirm, which is the check that actually matters.
   */
  /*
   * There was a guard here that put the cashier back on cash whenever the
   * tender was Credit and `creditEligible` was false, on the theory that a
   * failed credit lookup should not strand them on a tender they cannot use.
   *
   * It broke the Credit button outright (owner, 2026-09-04: "now credit button
   * not working"). Eligibility is not known at the moment of the tap — the
   * button sets the tender AND fires the summary fetch, so on that first
   * render `creditEligible` is still false and the guard bounced it straight
   * back to cash. Nothing appeared to happen at all.
   *
   * It was written for a freeze that turned out to be uncached note photos, so
   * it was never needed. Anything put here in future has to tell "we have not
   * asked yet" apart from "we asked and the answer is no"; the component
   * cannot currently see that difference, which is the whole reason the guard
   * was wrong.
   */

  const counting = received !== "" || selectedNotes.length > 0;
  useEffect(() => {
    if (method === "house_account" || method === "wallet") return;
    if (baseMethods.includes(method)) return;
    if (baseMethods.length === 0) return;
    if (counting) return;
    setMethod(baseMethods[0]);
  }, [method, baseMethods, counting]);

  /**
   * What the tender row shows. If the active method has just been dropped from
   * the allowed list mid-count, it stays on screen and stays selected — a row
   * that silently loses the button the cashier is standing on is worse than
   * one that briefly shows a tender the next refresh may take away.
   */
  type BaseMethod = (typeof baseMethods)[number];
  const visibleMethods = useMemo<readonly BaseMethod[]>(() => {
    if (method === "house_account" || method === "wallet") return baseMethods;
    const active = method as BaseMethod;
    return baseMethods.includes(active) ? baseMethods : [active, ...baseMethods];
  }, [baseMethods, method]);

  // Esc closes; useful for keyboard-driven counters.
  // Guarded by `submitting` so a stray Escape mid-payment can't
  // tear down the overlay while handleCharge is still in flight —
  // otherwise the resolve would land on whatever cart the cashier
  // has built next and clear / advance the wrong order. The Cancel
  // button is disabled in the same state for the same reason.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !submitting) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, submitting]);

  // ── Money math is done in integer laari (1 MVR = 100 laari) ──
  // Float arithmetic on MVR amounts looks innocent but combining
  // many split-tender + change calcs across a busy day produces
  // 1-laari drift between what the screen shows and what the
  // `payments` table records. Doing the math in integers and
  // converting back at the display boundary eliminates the
  // mismatch entirely (this is the same approach Stripe, Square
  // and Loyverse use internally).
  const toLaari = (n: number): number => Math.round(n * 100);
  const fromLaari = (laari: number): number => laari / 100;

  const receivedNum = Number.parseFloat(received);
  const fullyCovered = total <= 0;
  const change = useMemo(() => {
    if (fullyCovered || method !== "cash") return 0;
    if (!Number.isFinite(receivedNum)) return 0;
    const diff = toLaari(receivedNum) - toLaari(total);
    return diff > 0 ? fromLaari(diff) : 0;
  }, [method, receivedNum, total, fullyCovered]);

  // Zero-total (rewards/gift cover the bill): Confirm must stay enabled
  // without forcing the cashier to type "0" into Received.
  const enough = fullyCovered
    || (method === "cash"
      ? Number.isFinite(receivedNum) && receivedNum >= total
      : true);

  // Quick tenders: note photos the cashier can tap (multi-select) plus
  // an Exact button. Always aim for 5 useful faces — mix of notes below
  // the total (combine) and at/above it (single cover). Tapping toggles;
  // Received = sum of selected faces (e.g. 10 + 20 → 30).
  const quickNotes = useMemo<number[]>(() => pickChargeQuickNotes(total, 5), [total]);

  const exactTotal = Math.round(total * 100) / 100;
  const exactSelected =
    selectedNotes.length === 0
    && Number.isFinite(receivedNum)
    && Math.abs(receivedNum - exactTotal) < 0.005;

  const applySelectedNotes = (notes: number[]) => {
    setSelectedNotes(notes);
    const sum = notes.reduce((a, b) => a + b, 0);
    setReceived(sum > 0 ? sum.toFixed(2) : "");
  };

  const toggleNote = (face: number) => {
    const next = selectedNotes.includes(face)
      ? selectedNotes.filter((n) => n !== face)
      : [...selectedNotes, face];
    applySelectedNotes(next);
  };

  // Pretty-print: whole MVR → no decimals, fractional → 2 dp.
  const fmtChip = (n: number) =>
    Number.isInteger(n) ? `MVR ${n}` : `MVR ${n.toFixed(2)}`;

  const splitNum = Number.parseFloat(splitAmount);
  const splitValid =
    split
    && method !== "cash"
    && method !== "house_account"
    && method !== "wallet"
    && Number.isFinite(splitNum)
    && splitNum > 0
    && splitNum < total;

  // FIX 5 — Credit tender mirrors the wallet partial-pay pattern.
  //
  //   creditFullPay      : total fits inside the customer's available
  //                        credit line. One row on the settle call.
  //   creditPartialPay   : total > available > 0. Two rows on settle:
  //                        [{house_account, available}, {cash, rest}].
  //                        Cashier collects the shortfall in cash so
  //                        the drawer stays honest.
  //   creditOverLimit    : available <= 0 (fully utilised or blocked).
  //                        Confirm stays disabled.
  //
  // The old logic only allowed full-pay against credit and slammed the
  // button off the moment total > available; the audit flagged that as
  // a papercut because the cashier had to bail out and re-open Charge
  // with a manual split. Now the overlay handles the split itself.
  const creditFullPay = method === "house_account" && creditEligible && total <= creditAvailableMvr + 0.001;
  const creditPartialPay =
    method === "house_account"
    && creditEligible
    && creditAvailableMvr > 0
    && total > creditAvailableMvr + 0.001;
  const creditOverLimit =
    method === "house_account"
    && (!creditEligible || creditAvailableMvr <= 0);
  const canConfirmCredit = (creditFullPay || creditPartialPay) && total > 0;
  const walletFullPay = method === "wallet" && walletEligible && total <= walletAvailableMvr + 0.001;
  const walletPartialPay = method === "wallet" && walletEligible && walletAvailableMvr > 0 && total > walletAvailableMvr + 0.001;
  const walletOverLimit = method === "wallet" && walletEligible && walletAvailableMvr <= 0;
  const canConfirmWallet = (walletFullPay || walletPartialPay) && total > 0;
  const canConfirmAccountTender = canConfirmCredit || canConfirmWallet;

  const confirm = async () => {
    // Split tender: send TWO rows — the requested non-cash portion +
    // the remainder as cash. settleOrder() already top-ups any
    // shortfall with cash, but being explicit here means the server
    // sees the actual split the cashier chose, which is what shows up
    // in the day's tender breakdown report.
    if (walletPartialPay) {
      const depositLaar = Math.min(toLaari(total), toLaari(walletAvailableMvr));
      const deposit = fromLaari(depositLaar);
      const rest = fromLaari(toLaari(total) - depositLaar);
      await onConfirm([
        { method: "wallet", amount: deposit },
        { method: "cash", amount: rest },
      ]);
      return;
    }
    if (creditPartialPay) {
      // FIX 5 — mirror the wallet split: fill the credit line up to
      // `available_laari` and collect the remainder as cash. Rounding
      // is done in integer laari so the two rows sum exactly to the
      // headline total (avoids a 1-laari mismatch vs the server's
      // stored order total on close-out reconciliation).
      const creditLaar = Math.min(toLaari(total), toLaari(creditAvailableMvr));
      const creditAmt = fromLaari(creditLaar);
      const rest = fromLaari(toLaari(total) - creditLaar);
      await onConfirm([
        { method: "house_account", amount: creditAmt },
        { method: "cash", amount: rest },
      ]);
      return;
    }
    if (splitValid) {
      // Compute the cash remainder in integer laari so the two
      // amounts we send the server sum exactly to `total` — no
      // 1-laari rounding gap between (split + rest) and the
      // order's recorded total.
      const restLaari = toLaari(total) - toLaari(splitNum);
      const rest = fromLaari(restLaari);
      const splitAmount = fromLaari(toLaari(splitNum));
      await onConfirm([
        { method, amount: splitAmount },
        { method: "cash", amount: rest },
      ]);
      return;
    }
    if (!enough && !splitValid && !canConfirmAccountTender) return;
    // FIX 11 — surface cash overpay as `tendered_amount` so change_given
    // is recorded server-side. The applied `amount` remains the order
    // total (drawer expected-cash stays honest).
    if (method === "cash" && Number.isFinite(receivedNum) && toLaari(receivedNum) > toLaari(total)) {
      await onConfirm([{ method, amount: total, tendered_amount: receivedNum }]);
      return;
    }
    await onConfirm([{ method, amount: total }]);
  };

  // Bug-035: trap Tab inside the charge overlay so keyboard focus
  // can't slip behind to the (hidden) sales UI mid-payment. Esc is
  // still gated on `submitting` via the existing useEffect.
  const trapRef = useRef<HTMLDivElement>(null);
  useFocusTrap(trapRef, true);

  return (
    <div
      ref={trapRef}
      className="pos-charge-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Charge"
      style={{
        position: "fixed", inset: 0, zIndex: z.overlay,
        background: "rgba(15,23,42,0.65)",
      }}
    >
      <div className="pos-charge" style={{
        background: "#fff",
        overflow: "hidden",
      }}>
        {/* Header */}
        <div className="pos-charge-header" style={{
          padding: "14px 18px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          borderBottom: "1px solid #E2E8F0",
        }}>
          <h2 style={{ margin: 0, fontSize: 18, color: "#0F172A" }}>Charge</h2>
          <button
            className="pos-charge-close-btn"
            onClick={onClose}
            disabled={submitting}
            style={{
            background: "none", border: "none", color: "#64748B",
            fontSize: 20, cursor: "pointer", lineHeight: 1,
          }} aria-label="Close charge screen">×</button>
        </div>

        {/* Body */}
        <div className="pos-charge-grid">
          {/* LEFT: total + change */}
          <div className="pos-charge-summary" style={{
            padding: 24, display: "flex", flexDirection: "column",
            justifyContent: "center", alignItems: "stretch", background: "#0F172A",
            color: "#fff",
          }}>
            {/* On phones: Received | Subtotal/GST share one row. iPad/desktop
                hide the received card here and keep it in the tender column. */}
            <div className={`pos-charge-summary-top${method === "cash" && !fullyCovered && isPhoneCharge ? " has-received" : ""}`}>
              {method === "cash" && !fullyCovered && isPhoneCharge && (
                <div className="pos-charge-received-card">
                  <p className="pos-charge-received-label">Received</p>
                  <CashInput
                    autoFocus
                    value={received}
                    onChange={(v) => {
                      setSelectedNotes([]);
                      setReceived(v);
                    }}
                    placeholder="0.00"
                    showNumpad={false}
                  />
                </div>
              )}
              {showBreakdown && (
                <div
                  className={[
                    "pos-charge-breakdown",
                    isPhoneCharge && hasExtraBreakdown && !breakdownOpen ? "is-collapsed" : "",
                    isPhoneCharge && breakdownOpen ? "is-expanded" : "",
                  ].filter(Boolean).join(" ")}
                  style={{
                  marginBottom: 18, padding: "10px 14px", borderRadius: 10,
                  background: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  fontSize: 13, color: "#CBD5E1",
                  display: "grid", rowGap: 4,
                }}>
                  <Line label="Subtotal" value={subtotal ?? 0} />
                  {/* Phone collapsed: only Subtotal + GST. Extras expand on tap.
                      iPad / expanded phone: full stack. */}
                  {(!isPhoneCharge || breakdownOpen) && (discount ?? 0) > 0 && (
                    <Line label="Discount" value={-(discount ?? 0)} accent="#FCD34D" />
                  )}
                  {(!isPhoneCharge || breakdownOpen) && (serviceCharge ?? 0) > 0 && (
                    <Line label={serviceChargeLabel ?? "Service charge"} value={serviceCharge ?? 0} />
                  )}
                  {(!isPhoneCharge || breakdownOpen) && (packagingFee ?? 0) > 0 && (
                    <Line label="Packaging" value={packagingFee ?? 0} />
                  )}
                  {(!isPhoneCharge || breakdownOpen) && (deliveryFee ?? 0) > 0 && (
                    <Line label="Delivery fee" value={deliveryFee ?? 0} />
                  )}
                  {(tax ?? 0) > 0 && (
                    <Line label="GST" value={tax ?? 0} />
                  )}
                  {(!isPhoneCharge || breakdownOpen) && (giftTender ?? 0) > 0 && (
                    <Line label="Gift card" value={-(giftTender ?? 0)} accent="#FCD34D" />
                  )}
                  {isPhoneCharge && hasExtraBreakdown && (
                    <button
                      type="button"
                      className="pos-charge-breakdown-toggle"
                      aria-expanded={breakdownOpen}
                      aria-label={breakdownOpen ? "Hide fee details" : "Show fee details"}
                      onClick={() => setBreakdownOpen((open) => !open)}
                    >
                      <span
                        className={`pos-charge-breakdown-chevron${breakdownOpen ? " is-open" : ""}`}
                        aria-hidden="true"
                      />
                    </button>
                  )}
                </div>
              )}
            </div>
            <div className={`pos-charge-amounts${method === "cash" ? " pos-charge-amounts--cash" : ""}`}>
              <div className="pos-charge-due-block">
                <p className="pos-charge-due-label" style={{ margin: 0, fontSize: 12, fontWeight: 600,
                  textTransform: "uppercase", letterSpacing: "0.08em", color: "#94A3B8" }}>
                  Amount due
                </p>
                <p className="pos-charge-due-value" style={{ margin: "8px 0 0", fontSize: 48, fontWeight: 800, letterSpacing: "-0.02em" }}>
                  MVR {total.toFixed(2)}
                </p>
              </div>

              {method === "cash" && (
                <div className="pos-charge-change-block">
                  <p className="pos-charge-change-label" style={{ margin: "28px 0 0", fontSize: 12, fontWeight: 600,
                    textTransform: "uppercase", letterSpacing: "0.08em", color: "#94A3B8" }}>
                    Change due
                  </p>
                  <p className="pos-charge-change-value" style={{
                    margin: "8px 0 0", fontSize: 40, fontWeight: 800,
                    color: change > 0 ? "#FCD34D" : "#fff",
                  }}>
                    MVR {change.toFixed(2)}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* RIGHT: tender + amount entry */}
          <div className="pos-charge-tender" style={{
            padding: 20, display: "flex", flexDirection: "column", gap: 14,
            background: "#F8FAFC", overflow: "auto",
          }}>
            <div>
              <p style={tinyLabel}>Tender</p>
              {/* Base tenders share one equal-width row. On phones, Credit
                  joins this row (short label); iPad keeps Credit Account
                  on the secondary row below (see .pos-charge-credit-*). */}
              <div
                className="pos-charge-tenders"
                style={{
                display: "grid",
                gridTemplateColumns: `repeat(${Math.max(visibleMethods.length, 1)}, minmax(0, 1fr))`,
                gap: 8,
              }}>
                {visibleMethods.map((m) => (
                  <button
                    key={m}
                    type="button"
                    className={`pos-charge-tender-btn${method === m ? " pos-charge-tender-btn--active" : ""}`}
                    onClick={() => setMethod(m)}
                    style={{
                      padding: "12px 6px", borderRadius: 10,
                      background: method === m ? "#0F172A" : "#fff",
                      color: method === m ? "#fff" : "#0F172A",
                      border: `1px solid ${method === m ? "#0F172A" : "#CBD5E1"}`,
                      fontWeight: 700, fontSize: 13, cursor: "pointer",
                      minWidth: 0,
                    }}
                  >{METHOD_LABEL[m]}</button>
                ))}
                {(creditEligible || canPayCredit) && !isOffline && (
                  <button
                    type="button"
                    className={[
                      "pos-charge-tender-btn",
                      "pos-charge-credit-inline",
                      method === "house_account" ? "pos-charge-tender-btn--active" : "",
                      !creditEligible ? "is-muted" : "",
                    ].filter(Boolean).join(" ")}
                    onClick={() => {
                      setMethod("house_account");
                      // FIX 8 — force a fresh customer credit summary
                      // the moment the cashier taps this tender so the
                      // banner shows the live available balance, not
                      // a stale value from when the overlay opened.
                      onSelectCredit?.();
                    }}
                    style={{
                      padding: "12px 6px", borderRadius: 10,
                      background: method === "house_account" ? "#0F172A" : "#fff",
                      color: method === "house_account" ? "#fff" : "#0F172A",
                      border: `1px solid ${method === "house_account" ? "#0F172A" : "#CBD5E1"}`,
                      fontWeight: 700, fontSize: 13, cursor: "pointer",
                      minWidth: 0,
                    }}
                  >
                    Credit
                  </button>
                )}
              </div>
              {((creditEligible || canPayCredit) || walletEligible) && !isOffline && (
                <div className="pos-charge-extra-tenders" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                  {(creditEligible || canPayCredit) && (
                    <button
                      type="button"
                      className="pos-charge-credit-row-btn"
                      onClick={() => {
                        setMethod("house_account");
                        // FIX 8 — force a fresh customer credit summary
                        // the moment the cashier taps this tender so the
                        // banner shows the live available balance, not
                        // a stale value from when the overlay opened.
                        onSelectCredit?.();
                      }}
                      disabled={!creditEligible}
                      title={
                        creditEligible
                          ? undefined
                          : hasAttachedCustomer
                            ? "Customer has no credit account."
                            : "Attach a customer to charge a credit account."
                      }
                      style={{
                        flex: "1 1 120px", padding: "12px 8px", borderRadius: 10,
                        background: method === "house_account" ? "#1D4ED8" : "#EFF6FF",
                        color: method === "house_account" ? "#fff" : "#1D4ED8",
                        border: `1px solid ${method === "house_account" ? "#1D4ED8" : "#BFDBFE"}`,
                        fontWeight: 700, fontSize: 13,
                        cursor: creditEligible ? "pointer" : "not-allowed",
                        opacity: creditEligible ? 1 : 0.55,
                      }}
                    >Credit Account</button>
                  )}
                  {walletEligible && (
                    <button
                      type="button"
                      className="pos-charge-wallet-btn"
                      onClick={() => setMethod("wallet")}
                      style={{
                        flex: "1 1 120px", padding: "12px 8px", borderRadius: 10,
                        background: method === "wallet" ? "#047857" : "#ECFDF5",
                        color: method === "wallet" ? "#fff" : "#047857",
                        border: `1px solid ${method === "wallet" ? "#047857" : "#A7F3D0"}`,
                        fontWeight: 700, fontSize: 13, cursor: "pointer",
                      }}
                    >{METHOD_LABEL.wallet}</button>
                  )}
                </div>
              )}
              {/*
                Owner, 2026-09-03: "in ipad, when in payment screen, some of
                the notes are under confirm payment banner. I think u can
                remove the note."

                A standing hint under the Credit Account chip said why credit
                was unavailable — and cost 41px of the tender column on every
                ticket. Measured on an iPad in landscape (1024x768) the column
                overflowed by 34px, which put the last row of note photos
                under the Confirm payment bar. The reason now rides on the
                button itself, which is already dimmed and unusable, so it is
                still there for anyone who looks and takes no room at all.
              */}
              {method === "house_account" && (
                <div style={{
                  marginTop: 8, padding: "10px 12px", borderRadius: 8,
                  background: creditOverLimit ? "#FEE2E2" : "#EFF6FF",
                  border: `1px solid ${creditOverLimit ? "#FCA5A5" : "#BFDBFE"}`,
                  fontSize: 12, color: creditOverLimit ? "#B91C1C" : "#1D4ED8",
                }}>
                  {creditOverLimit
                    ? `No credit available (limit fully utilised).`
                    : creditPartialPay
                      ? `Credit available MVR ${creditAvailableMvr.toFixed(2)} — remainder MVR ${(total - creditAvailableMvr).toFixed(2)} will be collected in cash.`
                      : `Available credit: MVR ${creditAvailableMvr.toFixed(2)}`}
                  {creditLastRefreshedAt && (
                    <div style={{ marginTop: 4, fontSize: 11, color: "#64748B", fontWeight: 600 }}>
                      As of {formatRefreshAge(creditLastRefreshedAt)}
                    </div>
                  )}
                </div>
              )}
              {method === "wallet" && (
                <div style={{
                  marginTop: 8, padding: "10px 12px", borderRadius: 8,
                  background: walletOverLimit ? "#FEE2E2" : "#ECFDF5",
                  border: `1px solid ${walletOverLimit ? "#FCA5A5" : "#A7F3D0"}`,
                  fontSize: 12, color: walletOverLimit ? "#B91C1C" : "#047857",
                }}>
                  {walletOverLimit
                    ? `No deposit balance available.`
                    : walletPartialPay
                      ? `Deposit balance MVR ${walletAvailableMvr.toFixed(2)} — remainder will be collected in cash.`
                      : `Deposit balance: MVR ${walletAvailableMvr.toFixed(2)}`}
                </div>
              )}
            </div>

            {isOffline && (
              <div style={{
                padding: "10px 12px", borderRadius: 8, background: "#FEF3C7",
                border: "1px solid #FDE68A", fontSize: 12, color: "#92400E",
              }}>
                Offline mode — cash, card, transfer, and QR only (manual record). Orders sync when internet returns.
              </div>
            )}

            {isOffline && (method === "card" || method === "qr" || method === "digital_wallet") && (
              <div style={{ fontSize: 12, color: "#64748B" }}>
                Payment must already be received — will sync when online.
              </div>
            )}

            {method !== "cash" && method !== "house_account" && method !== "wallet" && !isOffline && tenderAllowed.split && (
              <div style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "10px 12px", borderRadius: 10, background: "#fff",
                border: "1px solid #E2E8F0",
              }}>
                <input
                  type="checkbox" id="split-tender" checked={split}
                  onChange={(e) => setSplit(e.target.checked)}
                  style={{ width: 18, height: 18, cursor: "pointer" }}
                />
                <label htmlFor="split-tender" style={{
                  fontSize: 13, color: "#0F172A", fontWeight: 600, cursor: "pointer",
                }}>
                  Split with cash
                </label>
              </div>
            )}

            {split && method !== "cash" && method !== "house_account" && method !== "wallet" && !isOffline && tenderAllowed.split && (
              <div>
                <p style={tinyLabel}>{METHOD_LABEL[method]} amount (rest paid in cash)</p>
                <CashInput
                  value={splitAmount}
                  onChange={setSplitAmount}
                  placeholder="0.00"
                />
                {splitValid && (
                  <p style={{ margin: "8px 0 0", fontSize: 13, color: "#64748B" }}>
                    + MVR {fromLaari(toLaari(total) - toLaari(splitNum)).toFixed(2)} cash
                  </p>
                )}
              </div>
            )}

            {method === "cash" && fullyCovered && (
              <div style={{
                padding: "12px 14px", borderRadius: 10,
                background: "#ECFDF5", border: "1px solid #A7F3D0",
                color: "#065F46", fontSize: 13, fontWeight: 600,
              }}>
                Nothing to collect — covered by rewards/gift card
              </div>
            )}

            {method === "cash" && !fullyCovered && (
              <>
                {/* iPad/desktop: received + numpad live here. Phones show
                    Received in the top card and a numpad-only control below. */}
                {!isPhoneCharge && (
                  <div className="pos-charge-received-desktop">
                    <p style={tinyLabel}>Received from customer</p>
                    <CashInput
                      autoFocus
                      value={received}
                      onChange={(v) => {
                        setSelectedNotes([]);
                        setReceived(v);
                      }}
                      placeholder="0.00"
                    />
                  </div>
                )}

                <div className="pos-charge-quick-amounts">
                  <p style={tinyLabel}>Quick amounts</p>
                  <div className="pos-charge-quick-grid">
                    <button
                      type="button"
                      data-testid="charge-quick-exact"
                      className={`pos-charge-quick-btn pos-charge-quick-btn--exact${exactSelected ? " is-selected" : ""}`}
                      onClick={() => {
                        setSelectedNotes([]);
                        setReceived(exactTotal.toFixed(2));
                      }}
                    >
                      <span className="pos-charge-quick-btn-label">{fmtChip(exactTotal)}</span>
                      <span className="pos-charge-quick-exact" aria-hidden="true">EXACT</span>
                    </button>
                    {quickNotes.map((face) => {
                      const selected = selectedNotes.includes(face);
                      const laari = face * 100;
                      const asset = currencyAssetForLaari(laari);
                      const custom = customImages[String(laari)];
                      const src = custom ? absoluteMediaUrl(custom) : asset.src;
                      // Owner, 2026-09-03: "when note is shown remove the MVR
                      // amount … only note is better." The photo is the whole
                      // chip, as it was. The value is written on it only when
                      // there is no photo to read — a blank box on a money
                      // screen would say nothing at all.
                      const noPhoto = brokenNotes.includes(face);
                      return (
                        <button
                          key={face}
                          type="button"
                          data-testid={`charge-quick-note-${face}`}
                          aria-pressed={selected}
                          aria-label={`Add MVR ${face} note`}
                          className={`pos-charge-quick-btn pos-charge-quick-btn--note${selected ? " is-selected" : ""}`}
                          onClick={() => toggleNote(face)}
                        >
                          {noPhoto ? (
                            <span className="pos-charge-quick-btn-label">{fmtChip(face)}</span>
                          ) : (
                            <img
                              src={src}
                              alt=""
                              draggable={false}
                              className="pos-charge-quick-note-img"
                              onError={(e) => {
                                // A custom upload falls back to the bundled
                                // photo; if that fails too, show the value.
                                if (custom && e.currentTarget.src !== asset.src) {
                                  e.currentTarget.src = asset.src;
                                  return;
                                }
                                setBrokenNotes((f) => (f.includes(face) ? f : [...f, face]));
                              }}
                            />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Phone: amount shows in the top Received card; numpad here
                    so cashiers can still type any amount (no OS keyboard). */}
                {isPhoneCharge && (
                  <div className="pos-charge-mobile-numpad">
                    <CashInput
                      value={received}
                      onChange={(v) => {
                        setSelectedNotes([]);
                        setReceived(v);
                      }}
                      showField={false}
                      showNumpad
                    />
                  </div>
                )}
              </>
            )}

            {method !== "cash" && method !== "house_account" && method !== "wallet" && !split && (
              <div style={{
                padding: 14, borderRadius: 10, background: "#fff",
                border: "1px solid #E2E8F0", fontSize: 13, color: "#475569",
                lineHeight: 1.5,
              }}>
                Take the {METHOD_LABEL[method].toLowerCase()} payment for{" "}
                <strong>MVR {total.toFixed(2)}</strong>, then tap "Confirm payment".
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="pos-charge-footer" style={{
          padding: 16, borderTop: "1px solid #E2E8F0", background: "#fff",
          display: "flex", flexDirection: "column", gap: 10,
        }}>
          {/* Inline error banner — surfaces anything handleCharge sets
              into statusMessage while the overlay is open (table
              required, device blocked, server rejected, network down,
              etc). Without this the overlay would silently swallow
              failures because it covers the main app's banner area. */}
          {pendingPaymentOrderId != null && (
            <div role="status" style={{
              padding: "10px 12px", borderRadius: 8,
              background: "#FEF3C7", border: "1px solid #FCD34D",
              color: "#92400E", fontSize: 13, fontWeight: 600,
              animation: "pos-fade-in 0.18s ease",
            }}>
              Payment didn&apos;t complete for order #{pendingPaymentOrderId}. Confirm will retry the payment only — no new order will be created.
            </div>
          )}
          {rewardWarning && (
            <div role="status" style={{
              padding: "10px 12px", borderRadius: 8,
              background: "#FFFBEB", border: "1px solid #F59E0B",
              color: "#92400E", fontSize: 13, fontWeight: 600,
              animation: "pos-fade-in 0.18s ease",
            }}>
              {rewardWarning}
            </div>
          )}
          {errorMessage && (
            <div role="alert" style={{
              padding: "10px 12px", borderRadius: 8,
              background: "#FEE2E2", border: "1px solid #FCA5A5",
              color: "#B91C1C", fontSize: 13, fontWeight: 600,
              animation: "pos-fade-in 0.18s ease",
            }}>
              ⛔ {errorMessage}
            </div>
          )}
          <div className="pos-charge-footer-actions" style={{ display: "flex", gap: 10 }}>
            <button
              type="button"
              className="pos-charge-cancel"
              onClick={onClose}
              disabled={submitting}
              style={{
              flex: 1, padding: "14px 18px", borderRadius: 12,
              background: "#fff", border: "1px solid #CBD5E1", color: "#475569",
              fontWeight: 600, fontSize: 15, cursor: "pointer",
            }}>Cancel</button>
            <button
              type="button"
              className="pos-charge-confirm"
              onClick={confirm}
              disabled={(!enough && !splitValid && !canConfirmAccountTender) || submitting || creditOverLimit || walletOverLimit}
              style={{
              flex: 2, padding: "14px 18px", borderRadius: 12,
              background: ((!enough && !splitValid && !canConfirmAccountTender) || submitting || creditOverLimit || walletOverLimit) ? "#A7F3D0" : "#10B981",
              color: "#fff", border: "none",
              fontWeight: 800, fontSize: 16, letterSpacing: "0.04em",
              cursor: ((!enough && !splitValid && !canConfirmAccountTender) || submitting || creditOverLimit || walletOverLimit) ? "not-allowed" : "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
              flexWrap: "wrap",
              textAlign: "center",
              lineHeight: 1.25,
            }}>
              {submitting ? (
                <>
                  {/* Bug-018: an actual spinning indicator alongside
                      the text. Without it cashiers couldn't tell if
                      the tap registered (some hit the button again
                      and silently double-fired the charge on flaky
                      networks before the disabled state landed). */}
                  <span
                    aria-hidden="true"
                    style={{
                      width: 16,
                      height: 16,
                      borderRadius: "50%",
                      border: "2px solid rgba(255,255,255,0.4)",
                      borderTopColor: "#fff",
                      animation: "pos-spin 0.7s linear infinite",
                      display: "inline-block",
                      flexShrink: 0,
                    }}
                  />
                  <span>PROCESSING…</span>
                </>
              ) : total <= 0
                /* Bug-051: when promo / loyalty / gift card cover
                   the bill entirely the total is 0.00. The old
                   label read "CONFIRM PAYMENT — MVR 0.00" which
                   confused cashiers ("collect zero rufiyaa from
                   them?"). Spell it out so the action matches
                   the actual settlement (just close the bill). */
                ? "FINALISE — FULLY COVERED"
                : (
                  <span className="pos-charge-confirm-label">
                    <span>CONFIRM PAYMENT</span>
                    <span>MVR {total.toFixed(2)}</span>
                  </span>
                )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * FIX 8 — small helper for the "as of just now / N min ago" pill under
 * the credit banner. Kept dumb on purpose — the parent re-renders on
 * `creditLastRefreshedAt` change (fetchCustomerSummary side-effect),
 * so we don't need a ticking clock here.
 */
function formatRefreshAge(ts: number): string {
  const diffMs = Math.max(0, Date.now() - ts);
  if (diffMs < 15_000) return "just now";
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "seconds ago";
  if (mins === 1) return "1 min ago";
  return `${mins} min ago`;
}

const tinyLabel: React.CSSProperties = {
  margin: "0 0 6px", fontSize: 11, fontWeight: 700,
  color: "#64748B", textTransform: "uppercase", letterSpacing: "0.08em",
};

function Line({ label, value, accent }: { label: string; value: number; accent?: string }) {
  const sign = value < 0 ? "− " : "";
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
      <span style={{ color: "#94A3B8", fontWeight: 600 }}>{label}</span>
      <span style={{ color: accent ?? "#F8FAFC", fontVariantNumeric: "tabular-nums" }}>
        {sign}MVR {Math.abs(value).toFixed(2)}
      </span>
    </div>
  );
}
