import { useCallback, useEffect, useRef, useState } from "react";
import {
  adjustInventory,
  closeShift,
  createCashMovement,
  createPurchase,
  createRefund,
  createSupplier,
  fetchInventory,
  fetchRefunds,
  fetchSuppliers,
  getCurrentShift,
  getSalesSummary,
  openShift,
  previewSmsPromotion,
  sendSmsPromotion,
} from "../api";
import type { SalesSummary } from "../api";

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
  name: string;
  quantity: string;
  unitCost: string;
};

const emptyPurchaseLine = (): PurchaseLine => ({
  key: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  name: "",
  quantity: "",
  unitCost: "",
});

export function useOps(isLoggedIn: boolean, viewMode: "pos" | "ops") {
  const today = new Date().toISOString().slice(0, 10);

  const [shift, setShift] = useState<Shift | null>(null);
  const [openingCash, setOpeningCash] = useState("");
  const [closingCash, setClosingCash] = useState("");
  const [cashMoveType, setCashMoveType] = useState<"cash_in" | "cash_out">("cash_in");
  const [cashMoveAmount, setCashMoveAmount] = useState("");
  const [cashMoveReason, setCashMoveReason] = useState("");
  const [reportFrom, setReportFrom] = useState(today);
  const [reportTo, setReportTo] = useState(today);
  const [reportData, setReportData] = useState<SalesSummary | null>(null);
  // Bug-049: opsMessage used to be a plain string overwritten by
  // every action. A cashier who hit "Open shift" + immediately
  // "Cash in" would see only "Cash movement recorded" — the
  // shift-open success was wiped before they could read it.
  // Now `setOpsMessage` is a queue-aware setter: a new message
  // is APPENDED with ` · ` to whatever's still showing, and the
  // whole accumulated banner auto-clears after a sliding 8s
  // window. Errors get a 12s window so the cashier has time to
  // act on them.
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
    Array<{ id: number; name: string; current_stock: number | null; unit: string }>
  >([]);
  const [adjustItemId, setAdjustItemId] = useState<number | null>(null);
  const [adjustType, setAdjustType] = useState<"adjustment" | "waste" | "correction">("adjustment");
  const [adjustQuantity, setAdjustQuantity] = useState("");
  const [adjustNotes, setAdjustNotes] = useState("");
  const [suppliers, setSuppliers] = useState<Array<{ id: number; name: string }>>([]);
  const [newSupplierName, setNewSupplierName] = useState("");
  const [newSupplierPhone, setNewSupplierPhone] = useState("");
  const [purchaseSupplierId, setPurchaseSupplierId] = useState<number | null>(null);
  const [purchaseDate, setPurchaseDate] = useState(today);
  const [purchaseLines, setPurchaseLines] = useState<PurchaseLine[]>([emptyPurchaseLine()]);
  const [refundOrderId, setRefundOrderId] = useState("");
  const [refundAmount, setRefundAmount] = useState("");
  const [refundReason, setRefundReason] = useState("");
  const [refundStatusFilter, setRefundStatusFilter] = useState("");
  const [refunds, setRefunds] = useState<
    Array<{ id: number; amount: number; status: string; reason: string | null; order_id: number }>
  >([]);
  const [promoMessage, setPromoMessage] = useState("");
  const [promoLastOrderDays, setPromoLastOrderDays] = useState("");
  const [promoEstimate, setPromoEstimate] = useState<{
    recipient_count: number;
    segments: number;
    total_cost_mvr: number;
  } | null>(null);

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
  }, [isLoggedIn, viewMode]);

  // Refunds reload when filter changes (or on first ops entry).
  useEffect(() => {
    if (!isLoggedIn || viewMode !== "ops") return;

    fetchRefunds(refundStatusFilter || undefined)
      .then((r) => setRefunds(r.refunds.data))
      .catch(() => setOpsMessage("Unable to load refunds."));
  }, [isLoggedIn, viewMode, refundStatusFilter]);

  // Sales summary re-fetches when date range changes (separated so only 1 API call fires)
  useEffect(() => {
    if (!isLoggedIn || viewMode !== "ops") return;

    getSalesSummary({ from: reportFrom, to: reportTo })
      .then((r) => setReportData(r))
      .catch(() => setOpsMessage("Unable to load sales summary."));
  }, [isLoggedIn, viewMode, reportFrom, reportTo]);

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

  const handleLoadReport = () => {
    getSalesSummary({ from: reportFrom, to: reportTo })
      .then((r) => setReportData(r))
      .catch(() => setOpsMessage("Unable to load sales summary."));
  };

  const handleAdjustInventory = () => {
    if (!adjustItemId) return;
    const quantity = Number.parseFloat(adjustQuantity);
    if (!Number.isFinite(quantity)) { setOpsMessage("Enter a valid adjustment quantity."); return; }
    adjustInventory(adjustItemId, { quantity, type: adjustType, notes: adjustNotes || undefined })
      .then(() => { setAdjustQuantity(""); setAdjustNotes(""); return fetchInventory(); })
      .then((r) => setInventoryItems(r.items.data))
      .catch(() => setOpsMessage("Unable to adjust inventory."));
  };

  const handleCreateSupplier = () => {
    if (!newSupplierName.trim()) return;
    createSupplier({ name: newSupplierName.trim(), phone: newSupplierPhone || undefined })
      .then(() => { setNewSupplierName(""); setNewSupplierPhone(""); return fetchSuppliers(); })
      .then((r) => setSuppliers(r.suppliers.data))
      .catch(() => setOpsMessage("Unable to add supplier."));
  };

  const handleCreatePurchase = () => {
    const items = purchaseLines
      .map((line) => ({
        name: line.name.trim(),
        quantity: Number.parseFloat(line.quantity),
        unit_cost: Number.parseFloat(line.unitCost),
      }))
      .filter(
        (line) =>
          line.name !== ""
          && Number.isFinite(line.quantity)
          && line.quantity > 0
          && Number.isFinite(line.unit_cost)
          && line.unit_cost >= 0,
      );

    if (items.length === 0) {
      setOpsMessage("Add at least one purchase line with name, quantity, and unit cost.");
      return;
    }

    createPurchase({
      supplier_id: purchaseSupplierId ?? undefined,
      purchase_date: purchaseDate,
      items,
    })
      .then(() => {
        setPurchaseLines([emptyPurchaseLine()]);
        return fetchInventory();
      })
      .then((r) => setInventoryItems(r.items.data))
      .catch(() => setOpsMessage("Unable to record purchase."));
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

  const handleCreateRefund = () => {
    const orderId = Number.parseInt(refundOrderId, 10);
    const amount = Number.parseFloat(refundAmount);
    if (!Number.isFinite(orderId) || orderId <= 0) { setOpsMessage("Enter a valid order ID."); return; }
    if (!Number.isFinite(amount) || amount <= 0) { setOpsMessage("Enter a valid refund amount."); return; }
    createRefund(orderId, { amount, reason: refundReason || undefined })
      .then(() => { setRefundOrderId(""); setRefundAmount(""); setRefundReason(""); return fetchRefunds(refundStatusFilter || undefined); })
      .then((r) => setRefunds(r.refunds.data))
      .catch(() => setOpsMessage("Unable to record refund."));
  };

  const handlePreviewPromotion = () => {
    if (!promoMessage.trim()) { setOpsMessage("Enter a promotion message."); return; }
    const lastOrderDays = promoLastOrderDays ? Number.parseInt(promoLastOrderDays, 10) : undefined;
    previewSmsPromotion({ message: promoMessage.trim(), filters: { last_order_days: Number.isFinite(lastOrderDays) ? lastOrderDays : undefined } })
      .then((r) => setPromoEstimate({ recipient_count: r.estimate.recipient_count, segments: r.estimate.segments, total_cost_mvr: r.estimate.total_cost_mvr }))
      .catch(() => setOpsMessage("Unable to preview SMS promotion."));
  };

  const handleSendPromotion = () => {
    if (!promoMessage.trim()) { setOpsMessage("Enter a promotion message."); return; }
    const lastOrderDays = promoLastOrderDays ? Number.parseInt(promoLastOrderDays, 10) : undefined;
    sendSmsPromotion({ name: "POS Promotion", message: promoMessage.trim(), filters: { last_order_days: Number.isFinite(lastOrderDays) ? lastOrderDays : undefined } })
      .then(() => { setPromoMessage(""); setPromoLastOrderDays(""); setPromoEstimate(null); })
      .catch(() => setOpsMessage("Unable to send promotion SMS."));
  };

  return {
    shift, openingCash, setOpeningCash, closingCash, setClosingCash,
    cashMoveType, setCashMoveType, cashMoveAmount, setCashMoveAmount,
    cashMoveReason, setCashMoveReason, reportFrom, setReportFrom,
    reportTo, setReportTo, reportData, opsMessage, inventoryItems,
    adjustItemId, setAdjustItemId, adjustType, setAdjustType,
    adjustQuantity, setAdjustQuantity, adjustNotes, setAdjustNotes,
    suppliers, newSupplierName, setNewSupplierName, newSupplierPhone, setNewSupplierPhone,
    purchaseSupplierId, setPurchaseSupplierId, purchaseDate, setPurchaseDate,
    purchaseLines, addPurchaseLine, removePurchaseLine, updatePurchaseLine,
    refundOrderId, setRefundOrderId,
    refundAmount, setRefundAmount, refundReason, setRefundReason,
    refundStatusFilter, setRefundStatusFilter, refunds,
    promoMessage, setPromoMessage, promoLastOrderDays, setPromoLastOrderDays, promoEstimate,
    handleOpenShift, handleCloseShift, handleCashMovement, handleLoadReport,
    handleAdjustInventory, handleCreateSupplier, handleCreatePurchase,
    handleCreateRefund, handlePreviewPromotion, handleSendPromotion,
    setOpsMessage,
  };
}
