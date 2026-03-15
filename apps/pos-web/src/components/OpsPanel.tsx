import type { useOps } from "../hooks/useOps";

type OpsState = ReturnType<typeof useOps>;

export function OpsPanel(ops: OpsState) {
  return (
    <>
      <section className="col-span-6 space-y-4">
        {/* Shift */}
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-[#2A1E0C]">Shift</h2>
          {ops.shift ? (
            <div className="mt-3 space-y-2 text-sm text-[#8B7355]">
              <p>Opened: {new Date(ops.shift.opened_at).toLocaleString()}</p>
              <p>Opening Cash: MVR {parseFloat(String(ops.shift.opening_cash ?? 0)).toFixed(2)}</p>
              {ops.shift.closed_at ? (
                <>
                  <p>Closed: {new Date(ops.shift.closed_at).toLocaleString()}</p>
                  <p>Expected Cash: MVR {parseFloat(String(ops.shift.expected_cash ?? 0)).toFixed(2)}</p>
                  <p>Variance: MVR {parseFloat(String(ops.shift.variance ?? 0)).toFixed(2)}</p>
                </>
              ) : (
                <>
                  <label className="block text-xs text-[#8B7355]">Closing Cash</label>
                  <input
                    className="w-full rounded-lg border border-[#EDE4D4] px-3 py-2 text-sm"
                    value={ops.closingCash}
                    onChange={(e) => ops.setClosingCash(e.target.value)}
                    placeholder="0.00"
                  />
                  <button
                    className="w-full rounded-lg bg-[#1C1408] text-white py-2 text-sm font-semibold"
                    onClick={ops.handleCloseShift}
                  >
                    Close Shift
                  </button>
                </>
              )}
            </div>
          ) : (
            <div className="mt-3 space-y-2">
              <label className="block text-xs text-[#8B7355]">Opening Cash</label>
              <input
                className="w-full rounded-lg border border-[#EDE4D4] px-3 py-2 text-sm"
                value={ops.openingCash}
                onChange={(e) => ops.setOpeningCash(e.target.value)}
                placeholder="0.00"
              />
              <button
                className="w-full rounded-lg bg-[#1C1408] text-white py-2 text-sm font-semibold"
                onClick={ops.handleOpenShift}
              >
                Open Shift
              </button>
            </div>
          )}
        </div>

        {/* Cash in/out */}
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-[#2A1E0C]">Cash In/Out</h2>
          <div className="mt-3 space-y-2">
            <select
              className="w-full rounded-lg border border-[#EDE4D4] px-3 py-2 text-sm"
              value={ops.cashMoveType}
              onChange={(e) => ops.setCashMoveType(e.target.value as "cash_in" | "cash_out")}
            >
              <option value="cash_in">Cash In</option>
              <option value="cash_out">Cash Out</option>
            </select>
            <input className="w-full rounded-lg border border-[#EDE4D4] px-3 py-2 text-sm" placeholder="Amount"
              value={ops.cashMoveAmount} onChange={(e) => ops.setCashMoveAmount(e.target.value)} />
            <input className="w-full rounded-lg border border-[#EDE4D4] px-3 py-2 text-sm" placeholder="Reason"
              value={ops.cashMoveReason} onChange={(e) => ops.setCashMoveReason(e.target.value)} />
            <button className="w-full rounded-lg border border-[#EDE4D4] py-2 text-sm font-semibold text-[#2A1E0C]"
              onClick={ops.handleCashMovement}>Record Movement</button>
          </div>
        </div>

        {/* Inventory */}
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-[#2A1E0C]">Inventory</h2>
          <div className="mt-3 space-y-2">
            <select className="w-full rounded-lg border border-[#EDE4D4] px-3 py-2 text-sm"
              value={ops.adjustItemId ?? ""} onChange={(e) => ops.setAdjustItemId(e.target.value ? Number(e.target.value) : null)}>
              <option value="">Select item</option>
              {ops.inventoryItems.map((item) => (
                <option key={item.id} value={item.id}>{item.name} ({item.current_stock ?? 0} {item.unit})</option>
              ))}
            </select>
            <select className="w-full rounded-lg border border-[#EDE4D4] px-3 py-2 text-sm"
              value={ops.adjustType} onChange={(e) => ops.setAdjustType(e.target.value as "adjustment" | "waste" | "correction")}>
              <option value="adjustment">Adjustment</option>
              <option value="waste">Waste</option>
              <option value="correction">Correction</option>
            </select>
            <input className="w-full rounded-lg border border-[#EDE4D4] px-3 py-2 text-sm" placeholder="Quantity (+/-)"
              value={ops.adjustQuantity} onChange={(e) => ops.setAdjustQuantity(e.target.value)} />
            <input className="w-full rounded-lg border border-[#EDE4D4] px-3 py-2 text-sm" placeholder="Notes"
              value={ops.adjustNotes} onChange={(e) => ops.setAdjustNotes(e.target.value)} />
            <button className="w-full rounded-lg border border-[#EDE4D4] py-2 text-sm font-semibold text-[#2A1E0C]"
              onClick={ops.handleAdjustInventory}>Save Adjustment</button>
          </div>
        </div>
      </section>

      <section className="col-span-6 space-y-4">
        {/* Sales Summary */}
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-[#2A1E0C]">Sales Summary</h2>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <input type="date" className="rounded-lg border border-[#EDE4D4] px-3 py-2 text-sm"
              value={ops.reportFrom} onChange={(e) => ops.setReportFrom(e.target.value)} />
            <input type="date" className="rounded-lg border border-[#EDE4D4] px-3 py-2 text-sm"
              value={ops.reportTo} onChange={(e) => ops.setReportTo(e.target.value)} />
          </div>
          <button className="w-full mt-3 rounded-lg border border-[#EDE4D4] py-2 text-sm font-semibold text-[#2A1E0C]"
            onClick={ops.handleLoadReport}>Load Summary</button>
          {ops.reportData && (
            <div className="mt-4 space-y-2 text-sm text-[#8B7355]">
              <p>Orders: {ops.reportData.totals.orders_count}</p>
              <p>Subtotal: MVR {parseFloat(String(ops.reportData.totals.subtotal ?? 0)).toFixed(2)}</p>
              <p>Tax: MVR {parseFloat(String(ops.reportData.totals.tax_amount ?? 0)).toFixed(2)}</p>
              <p>Discounts: MVR {parseFloat(String(ops.reportData.totals.discount_amount ?? 0)).toFixed(2)}</p>
              <p>Total: MVR {parseFloat(String(ops.reportData.totals.total ?? 0)).toFixed(2)}</p>
              <div className="mt-2">
                <p className="text-xs font-semibold text-[#8B7355]">Payments</p>
                {Object.entries(ops.reportData.payments).map(([method, amount]) => (
                  <p key={method}>{method}: MVR {parseFloat(String(amount ?? 0)).toFixed(2)}</p>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Suppliers */}
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-[#2A1E0C]">Suppliers</h2>
          <div className="mt-3 space-y-2">
            <input className="w-full rounded-lg border border-[#EDE4D4] px-3 py-2 text-sm" placeholder="Supplier name"
              value={ops.newSupplierName} onChange={(e) => ops.setNewSupplierName(e.target.value)} />
            <input className="w-full rounded-lg border border-[#EDE4D4] px-3 py-2 text-sm" placeholder="Phone (optional)"
              value={ops.newSupplierPhone} onChange={(e) => ops.setNewSupplierPhone(e.target.value)} />
            <button className="w-full rounded-lg border border-[#EDE4D4] py-2 text-sm font-semibold text-[#2A1E0C]"
              onClick={ops.handleCreateSupplier}>Add Supplier</button>
            {ops.suppliers.length > 0 && (
              <div className="text-xs text-[#8B7355]">{ops.suppliers.map((s) => s.name).join(", ")}</div>
            )}
          </div>
        </div>

        {/* New Purchase */}
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-[#2A1E0C]">New Purchase</h2>
          <div className="mt-3 space-y-2">
            <select className="w-full rounded-lg border border-[#EDE4D4] px-3 py-2 text-sm"
              value={ops.purchaseSupplierId ?? ""} onChange={(e) => ops.setPurchaseSupplierId(e.target.value ? Number(e.target.value) : null)}>
              <option value="">Select supplier (optional)</option>
              {ops.suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <input type="date" className="w-full rounded-lg border border-[#EDE4D4] px-3 py-2 text-sm"
              value={ops.purchaseDate} onChange={(e) => ops.setPurchaseDate(e.target.value)} />
            <input className="w-full rounded-lg border border-[#EDE4D4] px-3 py-2 text-sm" placeholder="Item name"
              value={ops.purchaseItemName} onChange={(e) => ops.setPurchaseItemName(e.target.value)} />
            <input className="w-full rounded-lg border border-[#EDE4D4] px-3 py-2 text-sm" placeholder="Quantity"
              value={ops.purchaseQuantity} onChange={(e) => ops.setPurchaseQuantity(e.target.value)} />
            <input className="w-full rounded-lg border border-[#EDE4D4] px-3 py-2 text-sm" placeholder="Unit cost"
              value={ops.purchaseUnitCost} onChange={(e) => ops.setPurchaseUnitCost(e.target.value)} />
            <button className="w-full rounded-lg border border-[#EDE4D4] py-2 text-sm font-semibold text-[#2A1E0C]"
              onClick={ops.handleCreatePurchase}>Record Purchase</button>
          </div>
        </div>

        {/* Refunds */}
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-[#2A1E0C]">Refunds</h2>
          <div className="mt-3 space-y-2">
            <input className="w-full rounded-lg border border-[#EDE4D4] px-3 py-2 text-sm" placeholder="Order ID"
              value={ops.refundOrderId} onChange={(e) => ops.setRefundOrderId(e.target.value)} />
            <input className="w-full rounded-lg border border-[#EDE4D4] px-3 py-2 text-sm" placeholder="Amount"
              value={ops.refundAmount} onChange={(e) => ops.setRefundAmount(e.target.value)} />
            <input className="w-full rounded-lg border border-[#EDE4D4] px-3 py-2 text-sm" placeholder="Reason (optional)"
              value={ops.refundReason} onChange={(e) => ops.setRefundReason(e.target.value)} />
            <button className="w-full rounded-lg border border-[#EDE4D4] py-2 text-sm font-semibold text-[#2A1E0C]"
              onClick={ops.handleCreateRefund}>Record Refund</button>
            {ops.refunds.length > 0 && (
              <div className="text-xs text-[#8B7355] space-y-1">
                {ops.refunds.slice(0, 3).map((r) => (
                  <div key={r.id}>Order {r.order_id}: MVR {parseFloat(String(r.amount ?? 0)).toFixed(2)} ({r.status})</div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* SMS Promotions */}
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-[#2A1E0C]">SMS Promotions</h2>
          <div className="mt-3 space-y-2">
            <textarea className="w-full rounded-lg border border-[#EDE4D4] px-3 py-2 text-sm" rows={4}
              placeholder="Promotion message" value={ops.promoMessage} onChange={(e) => ops.setPromoMessage(e.target.value)} />
            <input className="w-full rounded-lg border border-[#EDE4D4] px-3 py-2 text-sm"
              placeholder="Active in last X days (optional)"
              value={ops.promoLastOrderDays} onChange={(e) => ops.setPromoLastOrderDays(e.target.value)} />
            <div className="grid grid-cols-2 gap-2">
              <button className="rounded-lg border border-[#EDE4D4] py-2 text-sm font-semibold text-[#2A1E0C]"
                onClick={ops.handlePreviewPromotion}>Preview</button>
              <button className="rounded-lg bg-[#1C1408] text-white py-2 text-sm font-semibold"
                onClick={ops.handleSendPromotion}>Send SMS</button>
            </div>
            {ops.promoEstimate && (
              <div className="text-xs text-[#8B7355]">
                {ops.promoEstimate.recipient_count} recipients · {ops.promoEstimate.segments} segments · Est. MVR {parseFloat(String(ops.promoEstimate.total_cost_mvr ?? 0)).toFixed(2)}
              </div>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
