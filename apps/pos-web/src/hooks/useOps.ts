import { useCallback, useEffect, useRef, useState } from "react";
import {
  adjustInventory,
  approveRefund,
  closeShift,
  createCashMovement,
  createPurchase,
  createRefund,
  createWasteLog,
  fetchInventory,
  fetchRefunds,
  fetchSuppliers,
  getCurrentShift,
  openShift,
  rejectRefund,
  type RefundReasonCategory,
} from "../api";
import { localDateYmd } from "../utils/localDate";

type Shift = {
  id: number;
  opened_at: string;
  closed_at: string | null;
  opening_cash: number;
  closing_cash: number | null;
  expected_cash: number | null;
  variance: number | null;
};

export type PurchaseLine = {
  key: string;
  inventoryItemId: number | null;
  name: string;
  quantity: string;
  unitCost: string;
};

export type WasteReason = "spoilage" | "over_prep" | "drop" | "expired" | "quality" | "other";

const emptyPurchaseLine = (): PurchaseLine => ({
  key: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  inventoryItemId: null,
  name: "",
  quantity: "",
  unitCost: "",
});

export function useOps(isLoggedIn: boolean, viewMode: "pos" | "ops") {
  const today = localDateYmd();

  const [shift, setShift] = useState<Shift | null>(null);
  const [openingCash, setOpeningCash] = useState("");
  const [closingCash, setClosingCash] = useState("");
  const [cashMoveType, setCashMoveType] = useState<"cash_in" | "cash_out">("cash_in");
  const [cashMoveAmount, setCashMoveAmount] = useState("");
  const [cashMoveReason, setCashMoveReason] = useState("");
  const [opsMessage, setOpsMessageRaw] = useState("");
  const clearTimerRef = useRef<number | null>(null);
  const setOpsMessage = useCallback((text: string) => {
    if (clearTimerRef.current !== null) {
      window.clearTimeout(clearTimerRef.current);
      clearTimerRef.current = null;
    }
    setOpsMessageRaw(text);
    if (text) {
      const isError = /unable|failed|invalid|cannot|enter a valid|add a reason/i.test(text);
      const ms = isError ? 8000 : 3500;
      clearTimerRef.current = window.setTimeout(() => {
        setOpsMessageRaw("");
        clearTimerRef.current = null;
      }, ms);
    }
  }, []);
  useEffect(() => () => {
    if (clearTimerRef.current !== null) window.clearTimeout(clearTimerRef.current);
  }, []);
  const [inventoryItems, setInventoryItems] = useState<
    Array<{ id: number; name: string; current_stock: number | null; unit: string; reorder_point?: number | null }>
  >([]);
  const [adjustItemId, setAdjustItemId] = useState<number | null>(null);
  const [adjustType, setAdjustType] = useState<"adjustment" | "waste" | "correction">("adjustment");
  const [adjustQuantity, setAdjustQuantity] = useState("");
  const [adjustNotes, setAdjustNotes] = useState("");
  const [wasteReason, setWasteReason] = useState<WasteReason>("spoilage");
  const [suppliers, setSuppliers] = useState<Array<{ id: number; name: string }>>([]);
  const [purchaseSupplierId, setPurchaseSupplierId] = useState<number | null>(null);
  const [purchaseDate, setPurchaseDate] = useState(today);
  const [purchaseLines, setPurchaseLines] = useState<PurchaseLine[]>([emptyPurchaseLine()]);
  const [refundOrderId, setRefundOrderId] = useState("");
  const [refundAmount, setRefundAmount] = useState("");
  const [refundCategory, setRefundCategory] = useState<RefundReasonCategory | "">("");
  const [refundReason, setRefundReason] = useState("");
  const [refundPhone, setRefundPhone] = useState("");
  const [refundStatusFilter, setRefundStatusFilter] = useState("");
  // FIX 1e — ops-side "Refund card portion in cash". Same semantics
  // as the ReceiptsPanel checkbox: the POS only forwards the flag;
  // the backend decides the actual per-tender laari splits.
  const [refundCashOverride, setRefundCashOverride] = useState(false);
  const [refunds, setRefunds] = useState<
    Array<{
      id: number;
      amount: number;
      status: string;
      reason: string | null;
      reason_category?: string | null;
      order_id: number;
      refund_phone?: string | null;
      phone_added_at_refund?: boolean;
      no_customer_contact?: boolean;
      rejection_reason?: string | null;
      phone_flags?: {
        refund_phone?: string | null;
        phone_added_at_refund?: boolean;
        has_prior_order_history?: boolean;
        refunds_last_90_days?: number;
        otp_owner_override?: boolean;
      };
    }>
  >([]);

  // Load static ops data (shift, inventory, suppliers) when entering ops mode.
  useEffect(() => {
    if (!isLoggedIn || viewMode !== "ops") return;

    void (async () => {
      const results = await Promise.allSettled([
        getCurrentShift(),
        fetchInventory(),
        fetchSuppliers(),
      ]);
      const labels = ["shift", "inventory", "suppliers"] as const;
      const failed: string[] = [];

      const [shiftR, invR, supR] = results;
      if (shiftR.status === "fulfilled")        setShift(shiftR.value.shift);
      else                                       failed.push(labels[0]);
      if (invR.status === "fulfilled")          setInventoryItems(invR.value.items.data);
      else                                       failed.push(labels[1]);
      if (supR.status === "fulfilled")          setSuppliers(supR.value.suppliers.data);
      else                                       failed.push(labels[2]);

      if (failed.length === 1)      setOpsMessage(`Unable to load ${failed[0]}.`);
      else if (failed.length > 1)   setOpsMessage(`Unable to load: ${failed.join(", ")}.`);
    })();
  }, [isLoggedIn, viewMode, setOpsMessage]);

  // Refunds reload when filter changes (or on first ops entry).
  useEffect(() => {
    if (!isLoggedIn || viewMode !== "ops") return;

    fetchRefunds(refundStatusFilter || undefined)
      .then((r) => setRefunds(r.refunds.data))
      .catch(() => {
        // Listing requires orders.refund — request-only cashiers skip history.
        setRefunds([]);
      });
  }, [isLoggedIn, viewMode, refundStatusFilter]);

  const handleOpenShift = () => {
    const value = Number.parseFloat(openingCash);
    if (!Number.isFinite(value)) { setOpsMessage("Enter a valid opening cash amount."); return; }
    openShift({ opening_cash: value })
      .then(() => { setOpeningCash(""); return getCurrentShift(); })
      .then((r) => setShift(r.shift))
      .catch(() => setOpsMessage("Unable to open shift."));
  };

  const handleCloseShift = () => {
    if (!shift) return;
    const value = Number.parseFloat(closingCash);
    if (!Number.isFinite(value)) { setOpsMessage("Enter a valid closing cash amount."); return; }
    closeShift(shift.id, { closing_cash: value })
      .then(() => { setClosingCash(""); setShift(null); })
      .catch(() => setOpsMessage("Unable to close shift."));
  };

  const handleCashMovement = () => {
    if (!shift) return;
    const amount = Number.parseFloat(cashMoveAmount);
    if (!Number.isFinite(amount) || amount <= 0) { setOpsMessage("Enter a valid cash movement amount."); return; }
    if (!cashMoveReason.trim()) { setOpsMessage("Add a reason for the cash movement."); return; }
    createCashMovement(shift.id, { type: cashMoveType, amount, reason: cashMoveReason.trim() })
      .then(() => { setCashMoveAmount(""); setCashMoveReason(""); })
      .catch(() => setOpsMessage("Unable to record cash movement."));
  };

  const handleAdjustInventory = () => {
    if (!adjustItemId) return;
    const quantity = Number.parseFloat(adjustQuantity);
    if (!Number.isFinite(quantity) || quantity === 0) { setOpsMessage("Enter a valid adjustment quantity."); return; }
    adjustInventory(adjustItemId, { quantity, type: "adjustment", notes: adjustNotes || undefined })
      .then(() => { setAdjustQuantity(""); setAdjustNotes(""); setOpsMessage("Stock adjusted."); return fetchInventory(); })
      .then((r) => setInventoryItems(r.items.data))
      .catch(() => setOpsMessage("Unable to adjust inventory."));
  };

  const handleRecordWaste = () => {
    if (!adjustItemId) return;
    const quantity = Number.parseFloat(adjustQuantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setOpsMessage("Enter how much you're wasting (positive number).");
      return;
    }
    const item = inventoryItems.find((i) => i.id === adjustItemId);
    createWasteLog({
      inventory_item_id: adjustItemId,
      quantity,
      reason: wasteReason,
      notes: adjustNotes || undefined,
      unit: item?.unit,
    })
      .then(() => {
        setAdjustQuantity("");
        setAdjustNotes("");
        setOpsMessage("Waste recorded.");
        return fetchInventory();
      })
      .then((r) => setInventoryItems(r.items.data))
      .catch(() => setOpsMessage("Unable to record waste."));
  };

  const handleCreatePurchase = () => {
    const items = purchaseLines
      .map((line) => {
        const inv = inventoryItems.find((i) => i.id === line.inventoryItemId);
        return {
          inventory_item_id: line.inventoryItemId,
          name: inv?.name ?? line.name.trim(),
          quantity: Number.parseFloat(line.quantity),
          unit_cost: Number.parseFloat(line.unitCost),
        };
      })
      .filter(
        (line) =>
          line.inventory_item_id != null
          && Number.isFinite(line.quantity)
          && line.quantity > 0
          && Number.isFinite(line.unit_cost)
          && line.unit_cost >= 0,
      ) as Array<{
        inventory_item_id: number;
        name: string;
        quantity: number;
        unit_cost: number;
      }>;

    if (items.length === 0) {
      setOpsMessage("Add at least one line with an inventory item, quantity, and unit cost.");
      return;
    }

    createPurchase({
      supplier_id: purchaseSupplierId ?? undefined,
      purchase_date: purchaseDate,
      status: "received",
      items,
    })
      .then(() => {
        setPurchaseLines([emptyPurchaseLine()]);
        setOpsMessage("Purchase recorded — stock updated.");
        return fetchInventory();
      })
      .then((r) => setInventoryItems(r.items.data))
      .catch(() => setOpsMessage("Unable to record purchase. Check item links and try again."));
  };

  const addPurchaseLine = () => {
    setPurchaseLines((lines) => [...lines, emptyPurchaseLine()]);
  };

  const removePurchaseLine = (key: string) => {
    setPurchaseLines((lines) => {
      const next = lines.filter((line) => line.key !== key);
      return next.length > 0 ? next : [emptyPurchaseLine()];
    });
  };

  const updatePurchaseLine = (key: string, patch: Partial<Omit<PurchaseLine, "key">>) => {
    setPurchaseLines((lines) =>
      lines.map((line) => (line.key === key ? { ...line, ...patch } : line)),
    );
  };

  const refreshRefundList = () =>
    fetchRefunds(refundStatusFilter || undefined)
      .then((r) => setRefunds(r.refunds.data))
      .catch(() => { /* list requires orders.refund — ignore for request-only cashiers */ });

  const handleCreateRefund = () => {
    const orderId = Number.parseInt(refundOrderId, 10);
    const amount = Number.parseFloat(refundAmount);
    if (!Number.isFinite(orderId) || orderId <= 0) { setOpsMessage("Enter a valid order ID."); return; }
    if (!Number.isFinite(amount) || amount <= 0) { setOpsMessage("Enter a valid refund amount."); return; }
    if (!refundCategory) { setOpsMessage("Pick a reason category."); return; }
    if (!refundReason.trim()) { setOpsMessage("Describe the reason."); return; }
    if (refundCategory === "other" && refundReason.trim().length < 3) {
      setOpsMessage("Please describe the reason when category is Other.");
      return;
    }
    createRefund(orderId, {
      amount,
      reason: refundReason.trim(),
      reason_category: refundCategory,
      ...(refundCashOverride ? { cash_refund_override: true } : {}),
      ...(refundPhone.trim() ? { refund_phone: refundPhone.trim() } : {}),
    })
      .then((res) => {
        setRefundOrderId(""); setRefundAmount(""); setRefundCategory(""); setRefundReason("");
        setRefundPhone("");
        setRefundCashOverride(false);
        setOpsMessage(
          res.auto_approved
            ? "Refund approved."
            : "Refund requested — ask the customer for the OTP, then approve.",
        );
        return refreshRefundList();
      })
      .catch((e: unknown) => setOpsMessage((e as Error)?.message || "Unable to request refund."));
  };

  const handleApproveRefund = (id: number) => {
    const otp = window.prompt(
      "Enter the 4-digit code from the customer's phone.\nOwner only: type OVERRIDE if the customer cannot receive SMS.",
    );
    if (otp === null) return;
    const trimmed = otp.trim();
    if (!trimmed) {
      setOpsMessage("Customer OTP is required to approve.");
      return;
    }
    const payload = trimmed.toUpperCase() === "OVERRIDE"
      ? { owner_override_without_otp: true }
      : { otp: trimmed };
    approveRefund(id, payload)
      .then(() => {
        setOpsMessage(
          payload.owner_override_without_otp
            ? "Refund approved (owner OTP override)."
            : "Refund approved.",
        );
        return refreshRefundList();
      })
      .catch((e: unknown) => setOpsMessage((e as Error)?.message || "Unable to approve refund."));
  };

  const handleRejectRefund = (id: number, rejection_reason: string) => {
    if (!rejection_reason.trim()) {
      setOpsMessage("Enter a rejection reason.");
      return;
    }
    rejectRefund(id, rejection_reason.trim())
      .then(() => {
        setOpsMessage("Refund rejected — no money moved.");
        return refreshRefundList();
      })
      .catch(() => setOpsMessage("Unable to reject refund."));
  };

  return {
    shift, openingCash, setOpeningCash, closingCash, setClosingCash,
    cashMoveType, setCashMoveType, cashMoveAmount, setCashMoveAmount,
    cashMoveReason, setCashMoveReason, opsMessage, inventoryItems,
    adjustItemId, setAdjustItemId, adjustType, setAdjustType,
    adjustQuantity, setAdjustQuantity, adjustNotes, setAdjustNotes,
    wasteReason, setWasteReason,
    suppliers, purchaseSupplierId, setPurchaseSupplierId, purchaseDate, setPurchaseDate,
    purchaseLines, addPurchaseLine, removePurchaseLine, updatePurchaseLine,
    refundOrderId, setRefundOrderId,
    refundAmount, setRefundAmount,
    refundCategory, setRefundCategory,
    refundReason, setRefundReason,
    refundPhone, setRefundPhone,
    refundStatusFilter, setRefundStatusFilter, refunds,
    refundCashOverride, setRefundCashOverride,
    handleOpenShift, handleCloseShift, handleCashMovement,
    handleAdjustInventory, handleRecordWaste, handleCreatePurchase,
    handleCreateRefund, handleApproveRefund, handleRejectRefund,
    setOpsMessage,
  };
}
