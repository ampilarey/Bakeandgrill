import { useEffect, useState } from "react";
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
  const [opsMessage, setOpsMessage] = useState("");
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
  const [purchaseItemName, setPurchaseItemName] = useState("");
  const [purchaseQuantity, setPurchaseQuantity] = useState("");
  const [purchaseUnitCost, setPurchaseUnitCost] = useState("");
  const [refundOrderId, setRefundOrderId] = useState("");
  const [refundAmount, setRefundAmount] = useState("");
  const [refundReason, setRefundReason] = useState("");
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

  // Load static ops data (shift, inventory, suppliers, refunds) — only when entering ops mode
  useEffect(() => {
    if (!isLoggedIn || viewMode !== "ops") return;

    getCurrentShift()
      .then((r) => setShift(r.shift))
      .catch(() => setOpsMessage("Unable to load shift."));

    fetchInventory()
      .then((r) => setInventoryItems(r.items.data))
      .catch(() => setOpsMessage("Unable to load inventory."));

    fetchSuppliers()
      .then((r) => setSuppliers(r.suppliers.data))
      .catch(() => setOpsMessage("Unable to load suppliers."));

    fetchRefunds()
      .then((r) => setRefunds(r.refunds.data))
      .catch(() => setOpsMessage("Unable to load refunds."));
  }, [isLoggedIn, viewMode]);

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
      .then(() => { setOpsMessage("Shift opened."); setOpeningCash(""); return getCurrentShift(); })
      .then((r) => setShift(r.shift))
      .catch(() => setOpsMessage("Unable to open shift."));
  };

  const handleCloseShift = () => {
    if (!shift) return;
    const value = Number.parseFloat(closingCash);
    if (!Number.isFinite(value)) { setOpsMessage("Enter a valid closing cash amount."); return; }
    closeShift(shift.id, { closing_cash: value })
      .then(() => { setOpsMessage("Shift closed."); setClosingCash(""); setShift(null); })
      .catch(() => setOpsMessage("Unable to close shift."));
  };

  const handleCashMovement = () => {
    if (!shift) return;
    const amount = Number.parseFloat(cashMoveAmount);
    if (!Number.isFinite(amount) || amount <= 0) { setOpsMessage("Enter a valid cash movement amount."); return; }
    if (!cashMoveReason.trim()) { setOpsMessage("Add a reason for the cash movement."); return; }
    createCashMovement(shift.id, { type: cashMoveType, amount, reason: cashMoveReason.trim() })
      .then(() => { setOpsMessage("Cash movement recorded."); setCashMoveAmount(""); setCashMoveReason(""); })
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
      .then(() => { setOpsMessage("Inventory updated."); setAdjustQuantity(""); setAdjustNotes(""); return fetchInventory(); })
      .then((r) => setInventoryItems(r.items.data))
      .catch(() => setOpsMessage("Unable to adjust inventory."));
  };

  const handleCreateSupplier = () => {
    if (!newSupplierName.trim()) return;
    createSupplier({ name: newSupplierName.trim(), phone: newSupplierPhone || undefined })
      .then(() => { setNewSupplierName(""); setNewSupplierPhone(""); setOpsMessage("Supplier added."); return fetchSuppliers(); })
      .then((r) => setSuppliers(r.suppliers.data))
      .catch(() => setOpsMessage("Unable to add supplier."));
  };

  const handleCreatePurchase = () => {
    if (!purchaseItemName.trim()) return;
    const quantity = Number.parseFloat(purchaseQuantity);
    const unitCost = Number.parseFloat(purchaseUnitCost);
    if (!Number.isFinite(quantity) || !Number.isFinite(unitCost)) { setOpsMessage("Enter valid purchase quantity and unit cost."); return; }
    createPurchase({
      supplier_id: purchaseSupplierId ?? undefined,
      purchase_date: purchaseDate,
      items: [{ name: purchaseItemName.trim(), quantity, unit_cost: unitCost }],
    })
      .then(() => { setPurchaseItemName(""); setPurchaseQuantity(""); setPurchaseUnitCost(""); setOpsMessage("Purchase recorded."); return fetchInventory(); })
      .then((r) => setInventoryItems(r.items.data))
      .catch(() => setOpsMessage("Unable to record purchase."));
  };

  const handleCreateRefund = () => {
    const orderId = Number.parseInt(refundOrderId, 10);
    const amount = Number.parseFloat(refundAmount);
    if (!Number.isFinite(orderId) || orderId <= 0) { setOpsMessage("Enter a valid order ID."); return; }
    if (!Number.isFinite(amount) || amount <= 0) { setOpsMessage("Enter a valid refund amount."); return; }
    createRefund(orderId, { amount, reason: refundReason || undefined })
      .then(() => { setRefundOrderId(""); setRefundAmount(""); setRefundReason(""); setOpsMessage("Refund recorded."); return fetchRefunds(); })
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
      .then(() => { setOpsMessage("Promotion SMS queued."); setPromoMessage(""); setPromoLastOrderDays(""); setPromoEstimate(null); })
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
    purchaseItemName, setPurchaseItemName, purchaseQuantity, setPurchaseQuantity,
    purchaseUnitCost, setPurchaseUnitCost, refundOrderId, setRefundOrderId,
    refundAmount, setRefundAmount, refundReason, setRefundReason, refunds,
    promoMessage, setPromoMessage, promoLastOrderDays, setPromoLastOrderDays, promoEstimate,
    handleOpenShift, handleCloseShift, handleCashMovement, handleLoadReport,
    handleAdjustInventory, handleCreateSupplier, handleCreatePurchase,
    handleCreateRefund, handlePreviewPromotion, handleSendPromotion,
  };
}
