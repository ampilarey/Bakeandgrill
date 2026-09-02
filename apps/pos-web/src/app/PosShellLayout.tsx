import { lazy, Suspense, useMemo, useState } from 'react';
import { makeCartKey } from '../hooks/useCart';
import { MenuGrid } from '../components/MenuGrid';
import { OrderCart } from '../components/OrderCart';
import { SuggestionChips } from '../components/SuggestionChips';
import { SendBillPanel } from '../components/SendBillPanel';
import { NotePickerModal } from '../components/NotePickerModal';
import { PackagingReconcileModal } from '../components/PackagingReconcileModal';
import { OpenShiftModal } from '../components/OpenShiftModal';
import { CloseShiftModal } from '../components/CloseShiftModal';
import { SaveTicketModal } from '../components/SaveTicketModal';
import { OpenTicketsPanel } from '../components/OpenTicketsPanel';
import { ShiftPanel } from '../components/ShiftPanel';
import { formatOpenShiftLabel } from '../utils/shiftDisplay';
import { PosPreferencesModal } from '../components/PosPreferencesModal';
import { SideDrawer } from '../components/SideDrawer';
import { ChargeOverlay } from '../components/ChargeOverlay';
import { DiscountApprovalModal } from '../components/DiscountApprovalModal';
import type { OfflineOrderRecord } from '../offline/db';
import { PosUpdateBanner } from '../components/PosUpdateBanner';
import { OnlineOrderToasts } from '../components/OnlineOrderToasts';
import { RequestItemModal } from '../components/RequestItemModal';
import { POS_BUILD_INFO } from '../posBuildInfo';
import { closeTable, fetchPosQuickLayoutSources, mergeTables, openTable, validateManualDiscountInput } from '../api';
import { palette } from '../theme';
import { validateDeliveryDetails, type PosOrderType } from '../orderTypes';
import type { CartItem } from '../types';
import { usePosAppContext } from './PosAppProvider';
import { paneTitle, Banner, NoticeBanner, shouldShowStatusBanner } from './posUiHelpers';
import { HeaderShortcuts, type ShortcutTarget } from '../components/HeaderShortcuts';
import { ShortcutPrompt, type ShortcutPromptState } from '../components/ShortcutPrompt';
import { useHeaderShortcuts, isPane, MAX_HEADER_SHORTCUTS } from '../hooks/useHeaderShortcuts';
import type { Pane } from './types';

// Secondary panes — not needed on the cashier first screen (sales + cart).
// Lazy-load so the main chunk stays under the audit budget without delaying
// the first ring-sale interaction.
const OpsPanel = lazy(() =>
  import('../components/OpsPanel').then((m) => ({ default: m.OpsPanel })),
);
const ReceiptsPanel = lazy(() =>
  import('../components/ReceiptsPanel').then((m) => ({ default: m.ReceiptsPanel })),
);
const EventsPanel = lazy(() =>
  import('../components/EventsPanel').then((m) => ({ default: m.EventsPanel })),
);
const KitchenReceivingPanel = lazy(() =>
  import('../components/KitchenReceivingPanel').then((m) => ({ default: m.KitchenReceivingPanel })),
);
const WholesaleDispatchPanel = lazy(() =>
  import('../components/WholesaleDispatchPanel').then((m) => ({ default: m.WholesaleDispatchPanel })),
);
const WholesaleReconcilePanel = lazy(() =>
  import('../components/WholesaleReconcilePanel').then((m) => ({ default: m.WholesaleReconcilePanel })),
);
const ShiftHistoryPanel = lazy(() =>
  import('../components/ShiftHistoryPanel').then((m) => ({ default: m.ShiftHistoryPanel })),
);
const SalesReportPanel = lazy(() =>
  import('../components/SalesReportPanel').then((m) => ({ default: m.SalesReportPanel })),
);
const ExpensesPanel = lazy(() =>
  import('../components/ExpensesPanel').then((m) => ({ default: m.ExpensesPanel })),
);
const OfflineSyncPanel = lazy(() =>
  import('../components/OfflineSyncPanel').then((m) => ({ default: m.OfflineSyncPanel })),
);
const MyPurchaseRequestsPanel = lazy(() =>
  import('../components/MyPurchaseRequestsPanel').then((m) => ({ default: m.MyPurchaseRequestsPanel })),
);
const AssignedBuyingListPanel = lazy(() =>
  import('../components/AssignedBuyingListPanel').then((m) => ({ default: m.AssignedBuyingListPanel })),
);

function PaneFallback() {
  return (
    <div style={{ padding: 24, color: '#64748B', fontSize: 14, fontWeight: 600 }}>
      Loading…
    </div>
  );
}

/** FIX 9: humanise "cached tax settings from …" age for the offline banner. */
function formatSettingsAge(ms: number): string {
  const mins = Math.max(0, Math.round(ms / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

function offlineTypeToPos(type: string): PosOrderType {
  if (type === 'dine_in') return 'Dine-in';
  if (type === 'online_pickup') return 'Pickup';
  if (type === 'delivery') return 'Delivery';
  return 'Takeaway';
}

function offlineOrderToCartItems(order: OfflineOrderRecord): CartItem[] {
  return order.items.map((line) => ({
    id: line.item_id,
    name: line.name ?? `Item #${line.item_id}`,
    price: Number(line.unit_price ?? 0),
    quantity: Number(line.quantity ?? 0),
    variant_id: line.variant_id ?? null,
    variant_name: null,
    modifiers: (line.modifiers ?? []).map((m) => ({
      id: m.modifier_id,
      name: m.name ?? `Mod #${m.modifier_id}`,
      price: Number(m.price ?? 0),
    })),
    notes: line.notes
      ? line.notes.split(' · ').map((s) => s.trim()).filter(Boolean)
      : [],
  }));
}

export function PosShellLayout() {
  const app = usePosAppContext();
  const {
    isLoggedIn, isLocked, pane, setPane, drawerOpen, setDrawerOpen, cashierName, staffRole, deviceId,
    shift, shiftOpen, canEnterPosShell, canOpenShift, canCloseShift, canRingSales, canHoldResume,
    canViewActiveOrders, canViewReceipts, canViewShiftHistory, canViewReports, canManageExpenses,
    canAccessOps, canVoidOrders, canManageEvents, canTradeDispatch, canTradeReconcile,
    canManageOrderStatus, canSendBill, canSendPayLink, canRequestRefund, canApproveRefund, canCreatePurchaseRequest,
    canLockScreen, canPayCash,
    canPayCard, canPaySplit, canUseCredit, canUseWallet, canApplyDiscount, canUseRewards,
    canOpsInventory, canOpsPreparedStock,
    canCashInOut, isReachable, offlineQueueCount, offlinePendingCount,
    offlinePendingTotals, showOfflineSyncPanel, setShowOfflineSyncPanel, deviceBlockedMessage,
    orderType, setOrderType, handleOrderTypeToggle,
    packagingPickerLines, handlePackagingReconcileConfirm,
    deliveryDetails, setDeliveryDetails,
    customerAddresses, selectedDeliveryAddressId, setSelectedDeliveryAddressId, applyPosDeliveryAddress, tables,
    selectedTableId, setSelectedTableId, quickNotes, smsNotifications, discountControls, notePickerKey,
    setNotePickerKey, menu, cart, deliveryFeeEst, ops, filteredItems, refreshOpenTickets,
    order, chargeTotal, handleAttachCustomer, handleDetachCustomer, posUpdate, refreshAll,
    refreshTables, isRefreshingAll, openTicketsCount, openTicketsCritical, kitchenHandoverSettings, handleClearCart,
    handleLogout, lockScreen, handleOpenShift, handleCloseShift, handleCountAttempt, handleSaveTicketSubmit,
    refreshOfflineCounts, drawerItems, showPreferences, setShowPreferences,
    showRequestItemModal, setShowRequestItemModal, showSendBill, setShowSendBill,
    showCharge, setShowCharge, chargeCreditEligible, chargeCreditAvailable,
    chargeCreditRefreshedAt, refreshChargeCreditSummary,
    chargeWalletEligible, chargeWalletAvailable, showSaveTicket, setShowSaveTicket,
    showCloseShift, setShowCloseShift, showOpenShift, setShowOpenShift, openShiftBusy,
    receiptsFocusOrderId, setReceiptsFocusOrderId, idleLockMinutes, setIdleLockMinutes,
    onlineOrderWatcher,
  } = app;

  // ── Header shortcuts ────────────────────────────────────────────────────
  // Pinned by press-and-hold in the drawer, removed the same way in the header.
  const { shortcuts, add: addShortcut, remove: removeShortcut, isFull } = useHeaderShortcuts();
  const [shortcutPrompt, setShortcutPrompt] = useState<ShortcutPromptState | null>(null);

  /**
   * Pinned panes resolved against the live drawer, so a shortcut to something
   * the cashier can no longer reach — permission changed, shift closed —
   * simply stops rendering rather than becoming a button that goes nowhere.
   */
  const shortcutTargets = useMemo<ShortcutTarget[]>(
    () => shortcuts.flatMap((id) => {
      // The user group has no `disabled` field at all, and nothing there is
      // pinnable anyway — read it defensively rather than narrowing the union.
      const item = drawerItems.find(
        (d) => d.id === id && !("disabled" in d && d.disabled),
      );

      return item ? [{ id, label: item.label, icon: item.icon }] : [];
    }),
    [shortcuts, drawerItems],
  );

  const discountFieldError = useMemo(() => {
    const amount = Math.max(0, Number.parseFloat(cart.discountAmount) || 0);
    if (amount <= 0) return "";
    return validateManualDiscountInput({
      amountMvr: amount,
      subtotalMvr: cart.cartSubtotal,
      controls: discountControls,
      reason: cart.discountReason,
      reasonNote: cart.discountReasonNote,
    }) ?? "";
  }, [
    cart.discountAmount,
    cart.cartSubtotal,
    cart.discountReason,
    cart.discountReasonNote,
    discountControls,
  ]);

  // A pending or disabled device gets NOTHING — not shift history, not
  // requests, not events. The whole shell is replaced by this gate until
  // the owner approves/re-enables the device; usePosApp re-checks every
  // 20s so approval unlocks the till without a refresh.
  if (deviceBlockedMessage) {
    return (
      <div
        data-testid="pos-device-gate"
        style={{
          minHeight: "100vh", display: "flex", alignItems: "center",
          justifyContent: "center", background: "#F8FAFC", padding: 24,
        }}
      >
        <div style={{
          maxWidth: 460, width: "100%", background: "#fff", borderRadius: 16,
          border: "1px solid #E2E8F0", padding: "32px 28px", textAlign: "center",
          boxShadow: "0 10px 30px rgba(15, 23, 42, 0.08)",
        }}>
          <div style={{ fontSize: 44, marginBottom: 12 }}>🔒</div>
          <h2 style={{ margin: "0 0 10px", fontSize: 20, color: "#0F172A" }}>
            This till is not available
          </h2>
          <p style={{ margin: "0 0 14px", fontSize: 14, lineHeight: 1.6, color: "#475569" }}>
            {deviceBlockedMessage}
          </p>
          <p style={{ margin: "0 0 20px", fontSize: 12, color: "#94A3B8" }}>
            Device {deviceId} · signed in as {cashierName || "staff"} · checking automatically…
          </p>
          <button
            type="button"
            onClick={handleLogout}
            style={{
              padding: "12px 22px", borderRadius: 10, border: "1px solid #CBD5E1",
              background: "#fff", color: "#0F172A", fontWeight: 700, cursor: "pointer",
              fontSize: 14, fontFamily: "inherit",
            }}
          >
            Log out
          </button>
        </div>
      </div>
    );
  }

  return (
    // Height and overflow live in index.css — one screen tall, page never
    // scrolls, so the tile grid and the cart body are the only scrollers.
    <div className="pos-shell" style={{
      background: palette.bg,
      color: palette.panelInk,
      display: 'flex', flexDirection: 'column',
    }}>
      {/* ── Top bar ────────────────────────────────────────────────── */}
      <header className="pos-topbar">
        <div className="pos-topbar-left">
          <button
            className="pos-header-btn"
            onClick={() => setDrawerOpen(true)}
            aria-label={drawerOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={drawerOpen}
            style={{ fontSize: 18 }}
          >☰</button>
          <div className="pos-topbar-title-wrap">
            <div className="pos-topbar-title">
              {paneTitle(pane)}
            </div>
            <div className="pos-topbar-subtitle">
              {cashierName || 'Cashier'} · {deviceId}
            </div>
          </div>
        </div>

        {/* Pinned destinations. They live between the title and the status
            pills — the dead space an iPad header had going spare. */}
        <HeaderShortcuts
          items={shortcutTargets}
          active={pane}
          onSelect={setPane}
          onRequestRemove={(item) => setShortcutPrompt({ kind: 'remove', ...item })}
        />

        <div className="pos-topbar-right">
          {/* A black pill here used to show "N orders · MVR X" — the shift's
              order count and takings — on every screen of the till, in front
              of whoever was standing at the counter. Removed at the owner's
              request, 2026-09-01. The same figure is still a tap away in the
              side drawer, which only staff open. */}

          {!shiftOpen && canEnterPosShell && (
            <span className="pos-topbar-chip" style={{
              padding: '4px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700,
              background: '#FEF3C7', color: '#92400E',
            }}>
              No shift
            </span>
          )}

          <span
            className="pos-status-pill"
            style={{
              background: isReachable ? '#DCFCE7' : '#FEE2E2',
              color: isReachable ? '#15803D' : '#B91C1C',
            }}
          >
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: isReachable ? '#22C55E' : '#EF4444' }} />
            {isReachable ? 'Online' : 'Offline'}
          </span>

          {/* Top-banner refresh button removed — the ↻ next to the
              menu search bar (also rewired to refreshAll) is the only
              one needed. Per-cashier feedback the duplicate buttons
              were just visual noise. The More-drawer "Refresh data"
              item still works for cashiers parked on a non-Sales
              pane. */}

          {/* Visible Lock button. Keeps shift + cart, requires PIN to
              re-open. Cmd/Ctrl+L also triggers this. */}
          {canLockScreen && (
          <button
            className="pos-header-btn pos-header-btn--lock"
            onClick={lockScreen}
            aria-label="Lock screen"
            title="Lock screen (Ctrl/Cmd+L)"
            style={{ fontSize: 15 }}
          >🔒</button>
          )}

          {offlineQueueCount > 0 && (
            <button
              onClick={() => setShowOfflineSyncPanel(true)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '4px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700,
                background: '#FEF3C7', color: '#92400E', border: '1px solid #FDE68A', cursor: 'pointer',
              }}
            >
              🔄 Sync {offlineQueueCount}
            </button>
          )}
        </div>
      </header>

      {!shiftOpen && canEnterPosShell && canOpenShift && (
        <div style={{
          margin: '0 12px', padding: '10px 14px', borderRadius: 10,
          background: '#FEF3C7', color: '#92400E', fontSize: 13, fontWeight: 600,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
        }}>
          <span>No open shift — ordering is disabled until you open a shift.</span>
          <button
            type="button"
            onClick={() => setShowOpenShift(true)}
            style={{
              padding: '8px 14px', borderRadius: 8, border: 'none',
              background: '#10B981', color: '#fff', fontWeight: 700, cursor: 'pointer',
            }}
          >
            Open shift
          </button>
        </div>
      )}

      {!isReachable && (
        <div className="pos-offline-banner">
          Offline mode — cash, card, transfer, and QR only (manual). Orders sync when internet returns.
          {menu.usingCachedMenu ? " Showing cached menu." : ""}
          {cart.settingsCacheAgeMs != null
            ? ` Using saved tax/service settings from ${formatSettingsAge(cart.settingsCacheAgeMs)}.`
            : ""}
        </div>
      )}

      {menu.staleMenuWarning && (
        <div
          role="alert"
          style={{
            margin: '0 12px', padding: '10px 14px', borderRadius: 10,
            background: '#FEF3C7', color: '#92400E', fontSize: 13, fontWeight: 600,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
          }}
        >
          <span>{menu.staleMenuWarning}</span>
          <button
            type="button"
            onClick={menu.dismissStaleMenuWarning}
            style={{
              minHeight: 32, padding: '4px 10px', borderRadius: 6,
              border: '1px solid rgba(146,64,14,0.3)', background: 'transparent',
              color: '#92400E', fontWeight: 700, cursor: 'pointer',
            }}
          >
            Dismiss
          </button>
        </div>
      )}

      <PosUpdateBanner
        visible={isLoggedIn && !isLocked && posUpdate.bannerVisible}
        updateBlocked={posUpdate.updateBlocked}
        applying={posUpdate.applying}
        serverVersion={posUpdate.serverBuild?.version ?? null}
        serverBuild={posUpdate.serverBuild?.build ?? null}
        localBuild={POS_BUILD_INFO.build}
        onLater={posUpdate.dismissBanner}
        onUpdateNow={() => {
          if (posUpdate.applying) return;
          void posUpdate.applyUpdate().then((res) => {
            if (!res.ok && res.message) order.flashError(res.message);
          });
        }}
      />

      {/* Nothing is shown after a sale settles. A green action bar used to sit
          here for a minute offering Print receipt / Open / Resend SMS; the
          owner asked for it gone, 2026-09-01. The receipt SMS still goes out
          on its own (SendPaymentConfirmationListener), and anything a cashier
          needs to do by hand — print, reprint, resend, refund — lives in the
          Receipts pane, which the till already jumps to after a paid sale. */}

      {/* Status banners */}
      {(order.statusMessage || ops.opsMessage) && (
        <div style={{ padding: '8px 16px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {order.statusMessage && (
            shouldShowStatusBanner(order.statusMessage)
              ? <Banner text={order.statusMessage} />
              : <NoticeBanner text={order.statusMessage} />
          )}
          {ops.opsMessage && <Banner text={ops.opsMessage} />}
        </div>
      )}

      {shift.error && shift.current && (
        <div style={{
          margin: '0 12px', padding: '8px 12px', borderRadius: 8,
          background: '#FEF3C7', color: '#92400E', fontSize: 12, fontWeight: 600,
        }}>
          {shift.error}
        </div>
      )}

      {/* Main body */}
      <main className={pane === 'sales' ? 'pos-main pos-main--sales' : 'pos-main'}>
        {pane === 'sales' && (
          !shiftOpen ? (
            <div style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: '#fff', borderRadius: 12, border: '1px solid #E2E8F0', padding: 32,
              textAlign: 'center', color: '#64748B',
            }}>
              <div>
                <div style={{ fontSize: 40, marginBottom: 12 }}>🛒</div>
                <p style={{ margin: '0 0 8px', fontWeight: 700, fontSize: 18, color: '#0F172A' }}>Open a shift to ring sales</p>
                <p style={{ margin: '0 0 16px', fontSize: 14, lineHeight: 1.5 }}>
                  Inventory and other back-office tools are still available from the menu.
                </p>
                {canOpenShift && (
                  <button
                    type="button"
                    onClick={() => setShowOpenShift(true)}
                    style={{
                      padding: '12px 20px', borderRadius: 10, border: 'none',
                      background: '#10B981', color: '#fff', fontWeight: 700, cursor: 'pointer',
                    }}
                  >
                    Open shift
                  </button>
                )}
              </div>
            </div>
          ) : (
          <>
            {/* A card that pops up over the ticket's footer while the cashier
                is still talking to the customer — the moment an upsell lands.
                Fixed-position, so it takes no column of its own. */}
            <SuggestionChips
              items={menu.items}
              pairings={menu.pairings}
              cartItems={cart.cartItems}
              addToCart={cart.addToCart}
              handleSelectItem={cart.handleSelectItem}
              readOnly={order.resumedOrderId !== null && !order.isEditingActive}
              packagingEligible={orderType !== "Dine-in"}
            />
            <OrderCart
              orderType={orderType}
              setOrderType={handleOrderTypeToggle}
              deliveryDetails={deliveryDetails}
              setDeliveryDetails={setDeliveryDetails}
              customerAddresses={customerAddresses}
              selectedDeliveryAddressId={selectedDeliveryAddressId}
              onSelectDeliveryAddress={applyPosDeliveryAddress}
              onDeliveryManualEdit={() => setSelectedDeliveryAddressId("manual")}
              tables={tables}
              selectedTableId={selectedTableId}
              setSelectedTableId={setSelectedTableId}
              onRefreshTables={refreshTables}
              onOpenTable={(id) => openTable(id).then(() => undefined)}
              onCloseTable={(id) => closeTable(id).then(() => undefined)}
              onMergeTables={(sourceId, targetId) => mergeTables(sourceId, targetId).then(() => undefined)}
              cartItems={cart.cartItems}
              setCartItems={cart.setCartItems}
              cartSubtotal={cart.cartSubtotal}
              cartTax={cart.cartTax}
              cartServiceCharge={cart.cartServiceCharge}
              serviceChargeLabel={cart.serviceChargeLabel}
              cartPackagingFee={cart.cartPackagingFee}
              cartGrandTotal={cart.cartGrandTotal}
              cartTotal={cart.cartTotal}
              chargeTotal={chargeTotal}
              taxableSubtotal={Math.max(
                0,
                cart.cartSubtotal
                  - cart.discountValue
                  - (cart.appliedPromo?.discount ?? 0)
                  - (cart.appliedLoyalty?.discount ?? 0),
              )}
              deliveryFeeEst={deliveryFeeEst}
              discountValue={cart.discountValue}
              rewardsDiscount={cart.rewardsDiscount}
              appliedPromo={cart.appliedPromo}
              setAppliedPromo={cart.setAppliedPromo}
              appliedLoyalty={cart.appliedLoyalty}
              setAppliedLoyalty={cart.setAppliedLoyalty}
              appliedGiftCard={cart.appliedGiftCard}
              setAppliedGiftCard={cart.setAppliedGiftCard}
              payments={cart.payments}
              discountAmount={cart.discountAmount}
              setDiscountAmount={cart.setDiscountAmount}
              discountReason={cart.discountReason}
              setDiscountReason={cart.setDiscountReason}
              discountReasonNote={cart.discountReasonNote}
              setDiscountReasonNote={cart.setDiscountReasonNote}
              discountControls={discountControls}
              discountFieldError={discountFieldError}
              isSubmitting={order.isSubmitting}
              pendingPaymentForOrderId={order.pendingPaymentForOrderId}
              lastCreatedOrderId={order.lastCreatedOrderId}
              openTicketsCount={openTicketsCount}
              openTicketsCritical={openTicketsCritical}
              attachedCustomer={cart.attachedCustomer}
              onAttachCustomer={(c) => { void handleAttachCustomer(c); }}
              onDetachCustomer={() => { void handleDetachCustomer(); }}
              resumedOrderId={order.resumedOrderId}
              resumedFromStatus={order.resumedFromStatus}
              resumedIsPaid={order.resumedIsPaid}
              resumedOrderLabel={order.resumedOrderLabel}
              resumedOrderType={order.resumedOrderType}
              resumedStaffUserId={order.resumedStaffUserId}
              isEditingActive={order.isEditingActive}
              hasUnsavedTicketChanges={order.hasUnsavedTicketChanges}
              onSaveActiveChanges={() => void order.handleSaveActiveChanges().then(() => {
                void refreshOpenTickets();
                void refreshTables();
              })}
              onCancelResume={() => void order.handleCancelResume().then(refreshOpenTickets)}
              onClearCart={handleClearCart}
              onSaveTicket={() => {
                if (orderType === "Delivery") {
                  if (!isReachable) {
                    order.flashError("Delivery orders require an internet connection.");
                    return;
                  }
                  const deliveryErr = validateDeliveryDetails(deliveryDetails, cart.attachedCustomer);
                  if (deliveryErr) {
                    order.flashError(deliveryErr);
                    return;
                  }
                }
                setShowSaveTicket(true);
              }}
              onOpenTickets={() => setPane("open_tickets")}
              canRingSales={canRingSales}
              canHoldResume={canHoldResume}
              canViewActiveOrders={canViewActiveOrders}
              canApplyDiscount={canApplyDiscount}
              canUseRewards={canUseRewards}
              canSendBill={canSendBill}
              onCheckout={() => {
                // Pre-flight checks BEFORE opening the charge overlay.
                // Once the overlay is up (z-index 900) it covers the
                // status banner area, so a silent handleCharge failure
                // looks like "the Confirm button does nothing". Catch
                // the most common ones inline so the cashier sees them.
                if (cart.cartItems.length === 0) return;
                if (order.resumedIsPaid) return;
                if (orderType === "Delivery") {
                  if (!isReachable) {
                    order.flashError("Delivery orders require an internet connection.");
                    return;
                  }
                  const deliveryErr = validateDeliveryDetails(deliveryDetails, cart.attachedCustomer);
                  if (deliveryErr) {
                    order.flashError(deliveryErr);
                    return;
                  }
                }
                const discountAmt = Math.max(0, Number.parseFloat(cart.discountAmount) || 0);
                if (discountAmt > 0) {
                  const discountErr = validateManualDiscountInput({
                    amountMvr: discountAmt,
                    subtotalMvr: cart.cartSubtotal,
                    controls: discountControls,
                    reason: cart.discountReason,
                    reasonNote: cart.discountReasonNote,
                  });
                  if (discountErr) {
                    order.flashError(discountErr);
                    return;
                  }
                  if (discountControls.approval_required && !isReachable) {
                    order.flashError("Manager approval requires a connection. Remove the discount or reconnect.");
                    return;
                  }
                }
                // Table is OPTIONAL on Dine-in tickets — some venues
                // ring up at the counter before seating, so we don't
                // gate Charge on it. The cashier can still pick a
                // table later from the Save Ticket modal if needed.
                // Clear any stale error from a previous attempt so the
                // overlay doesn't open with a red banner from a closed-
                // but-not-resolved earlier flow (e.g. cashier hit
                // Charge, got a network error, dismissed the overlay,
                // then opened it again — the banner would still show
                // the old message). ChargeOverlay's onConfirm clears
                // again for the in-flight attempt itself.
                order.setStatusMessage("");
                setShowCharge(true);
              }}
              onRetryPayment={order.handleRetryPayment}
              onDismissPendingPayment={order.clearPendingPayment}
              onOpenSendBill={() => setShowSendBill(true)}
              smsNotifications={smsNotifications}
              quickNotes={quickNotes}
              onOpenNotePicker={setNotePickerKey}
            />
            <MenuGrid
              categories={menu.categories}
              selectedCategoryId={menu.selectedCategoryId}
              setSelectedCategoryId={menu.setSelectedCategoryId}
              filteredItems={filteredItems}
              isLoading={menu.isLoading}
              dataError={menu.dataError || menu.quickKeysError}
              quickLayout={menu.tillTabs.quickLayout}
              canManageSharedQuickKeys={menu.tillTabs.canManageSharedQuickKeys}
              onUpdateQuickLayout={menu.updateQuickLayout}
              onCopyQuickLayout={menu.copyQuickLayoutFrom}
              loadQuickLayoutSources={fetchPosQuickLayoutSources}
              popularNow={menu.tillTabs.popularNow}
              selectedItem={cart.selectedItem}
              selectedModifiers={cart.selectedModifiers}
              handleSelectItem={cart.handleSelectItem}
              toggleModifier={cart.toggleModifier}
              addToCart={cart.addToCart}
              clearSelectedItem={() => cart.setSelectedItem(null)}
              barcode={order.barcode}
              setBarcode={order.setBarcode}
              onBarcodeSubmit={(e) => order.handleBarcodeSubmit(e, menu.items, cart.addToCart)}
              // Lock the menu only for paid online view-only resumes.
              readOnly={order.resumedOrderId !== null && !order.isEditingActive}
              onRefreshMenu={refreshAll}
              isRefreshingMenu={isRefreshingAll || menu.isRefreshing}
              lastRefreshedAt={menu.lastRefreshedAt}
              orderType={orderType}
            />
          </>
          )
        )}

        {pane === 'receipts' && (
          <Suspense fallback={<PaneFallback />}>
            <ReceiptsPanel
            onClose={() => {
              setReceiptsFocusOrderId(null);
              setPane(shiftOpen && canRingSales ? "sales" : canAccessOps ? "ops" : "shift_history");
            }}
            shiftId={shift.current?.id ?? null}
            initialOrderId={receiptsFocusOrderId}
            receiptResendEnabled={smsNotifications.receipt_resend}
            canRefund={canRequestRefund && shiftOpen}
          />
          </Suspense>
        )}

        {pane === 'open_tickets' && (
          <OpenTicketsPanel
            canVoidOrders={canVoidOrders}
            canHoldResume={canHoldResume}
            canManageOrderStatus={canManageOrderStatus}
            canSendBill={canSendBill}
            canSendPayLink={canSendPayLink}
            requirePosReceivingBeforeReady={kitchenHandoverSettings?.kitchen_require_pos_receiving_before_ready ?? false}
            cartCustomerPhone={cart.attachedCustomer?.phone ?? null}
            smsNotifications={smsNotifications}
            onOrderCancelled={order.notifyOrderCancelled}
            onClose={() => setPane(shiftOpen && canRingSales ? "sales" : canAccessOps ? "ops" : "shift_history")}
            onResume={(t) => {
              // Tap-to-open: load into charge-ready resumed mode (not
              // edit). Cashier can Charge immediately, or tap Edit
              // items — Save changes only appears after a real cart
              // change. Surfaces resume errors so the cashier sees
              // what went wrong.
              order.handleResumeTicket(t.id)
                .then(() => {
                  setPane("sales");
                  void refreshOpenTickets();
                })
                .catch((err) => {
                  const msg = (err as Error)?.message ?? "Couldn't open ticket";
                  order.flashError(`Couldn't open ticket: ${msg}`);
                });
            }}
          />
        )}

        {pane === 'events' && (
          <Suspense fallback={<PaneFallback />}>
            <EventsPanel
            canManageEvents={canManageEvents}
            shiftOpen={shiftOpen}
            onClose={() => setPane(shiftOpen && canRingSales ? "sales" : canAccessOps ? "ops" : "events")}
            onSettleBalance={(orderId) => {
              order.handleResumeTicket(orderId)
                .then(() => {
                  setPane("sales");
                })
                .catch((err) => {
                  const msg = (err as Error)?.message ?? "Couldn't open event order";
                  order.flashError(`Couldn't settle: ${msg}`);
                });
            }}
          />
          </Suspense>
        )}

        {pane === 'shift' && (
          <ShiftPanel
            shift={shift.current}
            summary={shift.summary}
            onCashMovement={shift.cashMovement}
            onClose={() => setPane(canAccessOps ? "ops" : canViewShiftHistory ? "shift_history" : "shift")}
            onCloseShift={() => setShowCloseShift(true)}
            onOpenShift={() => setShowOpenShift(true)}
            canCloseShift={canCloseShift}
            canOpenShift={canOpenShift}
            canCashInOut={canCashInOut}
            staffRole={staffRole}
          />
        )}

        {pane === 'shift_history' && (
          <Suspense fallback={<PaneFallback />}>
            <ShiftHistoryPanel
              staffRole={staffRole}
              onClose={() => setPane(canAccessOps ? "ops" : "shift")}
            />
          </Suspense>
        )}

        {pane === 'sales_report' && canViewReports && (
          <Suspense fallback={<PaneFallback />}>
            <SalesReportPanel
            onClose={() => setPane(canRingSales && shiftOpen ? "sales" : canAccessOps ? "ops" : "shift")}
            onOpenReceipts={
              canViewReceipts && shiftOpen ? () => setPane("receipts") : undefined
            }
            onOpenShiftHistory={
              canViewShiftHistory ? () => setPane("shift_history") : undefined
            }
          />
          </Suspense>
        )}

        {pane === 'expenses' && canManageExpenses && (
          <Suspense fallback={<PaneFallback />}>
            <ExpensesPanel
            onClose={() => setPane(canRingSales && shiftOpen ? "sales" : canAccessOps ? "ops" : "shift")}
          />
          </Suspense>
        )}

        {pane === 'ops' && (
          <Suspense fallback={<PaneFallback />}>
            <OpsPanel
              {...ops}
              permissions={{
                inventory: canOpsInventory,
                preparedStock: canOpsPreparedStock,
                refunds: canRequestRefund,
                refundApprove: canApproveRefund,
                shiftOpen,
              }}
              onRequestItem={canCreatePurchaseRequest ? () => setShowRequestItemModal(true) : undefined}
              onMenuRefresh={() => void refreshAll()}
            />
          </Suspense>
        )}

        {pane === 'my_requests' && (
          <Suspense fallback={<PaneFallback />}>
            <MyPurchaseRequestsPanel
            onClose={() => setPane(canRingSales && shiftOpen ? "sales" : canAccessOps ? "ops" : "shift_history")}
            onRequestNew={canCreatePurchaseRequest ? () => setShowRequestItemModal(true) : undefined}
          />
          </Suspense>
        )}

        {pane === 'buying_list' && (
          <Suspense fallback={<PaneFallback />}>
            <AssignedBuyingListPanel
              onClose={() => setPane(canRingSales && shiftOpen ? "sales" : canAccessOps ? "ops" : "shift_history")}
            />
          </Suspense>
        )}

        {pane === 'kitchen_receiving' && (
          <Suspense fallback={<PaneFallback />}>
            <KitchenReceivingPanel
            onClose={() => setPane(canViewActiveOrders && shiftOpen ? "open_tickets" : canRingSales && shiftOpen ? "sales" : "shift_history")}
            onReceived={() => void refreshOpenTickets()}
          />
          </Suspense>
        )}

        {pane === 'wholesale_dispatch' && canTradeDispatch && (
          <Suspense fallback={<PaneFallback />}>
            <WholesaleDispatchPanel
              canOverrideCredit={staffRole === 'owner'}
              onClose={() => setPane(canRingSales && shiftOpen ? 'sales' : canAccessOps ? 'ops' : 'shift')}
            />
          </Suspense>
        )}

        {pane === 'wholesale_reconcile' && canTradeReconcile && (
          <Suspense fallback={<PaneFallback />}>
            <WholesaleReconcilePanel
              onClose={() => setPane(canRingSales && shiftOpen ? 'sales' : canAccessOps ? 'ops' : 'shift')}
            />
          </Suspense>
        )}
      </main>

      {shortcutPrompt && (
        <ShortcutPrompt
          state={shortcutPrompt}
          max={MAX_HEADER_SHORTCUTS}
          onClose={() => setShortcutPrompt(null)}
          onConfirm={() => {
            if (!isPane(shortcutPrompt.id)) return;
            if (shortcutPrompt.kind === 'add') addShortcut(shortcutPrompt.id);
            if (shortcutPrompt.kind === 'remove') removeShortcut(shortcutPrompt.id);
            setShortcutPrompt(null);
            setDrawerOpen(false);
          }}
        />
      )}

      <SideDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        items={drawerItems}
        active={pane}
        onLongPress={(item) => {
          // Only destinations can be pinned. Log out, Lock and Refresh are
          // actions — a header button that logs you out on a mistap is not a
          // shortcut, it is a hazard.
          if (!isPane(item.id)) return;
          if (shortcuts.includes(item.id)) {
            setShortcutPrompt({ kind: 'remove', id: item.id, label: item.label, icon: item.icon });

            return;
          }
          setShortcutPrompt({
            kind: isFull ? 'full' : 'add',
            id: item.id,
            label: item.label,
            icon: item.icon,
          });
        }}
        cashierName={cashierName}
        shiftLabel={shift.current ? formatOpenShiftLabel(shift.current.id, shift.current.opened_at) : 'No open shift'}
        shiftSalesSummary={
          shift.summary
            ? `${shift.summary.sales_summary.order_count} orders · MVR ${Number(shift.summary.sales_summary.net_sales ?? 0).toFixed(0)}`
            : (!shiftOpen && canEnterPosShell ? 'No open shift' : null)
        }
        appVersion={POS_BUILD_INFO.version}
        appBuild={POS_BUILD_INFO.build}
        updatePending={posUpdate.updateAvailable}
        onSelect={(id) => {
          setDrawerOpen(false);
          if (id === "logout") return handleLogout();
          if (id === "lock") return canLockScreen ? lockScreen() : undefined;
          if (id === "open_shift") return canOpenShift ? setShowOpenShift(true) : undefined;
          if (id === "close_shift") return canCloseShift ? setShowCloseShift(true) : undefined;
          if (id === "refresh_menu") {
            // One-tap full refresh — menu items + categories, tables,
            // kitchen-note chips, held-tickets badge, and the shift
            // summary. Replaces the old menu-only refresh which left
            // tables and other once-per-login data stale until the
            // cashier re-installed the PWA.
            void refreshAll();
            return;
          }
          if (id === "check_update") {
            void posUpdate.requestManualUpdate().then((result) => {
              if (result === "blocked") {
                order.flashError("Finish the current order or payment first, then tap Update Now.");
              } else if (result === "current" || result === "available") {
                order.flashError("Could not reload — close the app from the home screen and reopen, or clear Safari cache for this site.");
              }
            });
            return;
          }
          if (id === "preferences") {
            setShowPreferences(true);
            return;
          }
          if (id === "request_item") {
            setShowRequestItemModal(true);
            return;
          }
          setPane(id as Pane);
        }}
      />

      {showPreferences && (
        <PosPreferencesModal
          idleLockMinutes={idleLockMinutes}
          onClose={() => setShowPreferences(false)}
          onSaved={(resolved) => setIdleLockMinutes(resolved)}
        />
      )}

      {showRequestItemModal && (
        <RequestItemModal onClose={() => setShowRequestItemModal(false)} />
      )}

      {showSendBill && (
        <SendBillPanel
          orderId={order.lastCreatedOrderId}
          onClose={() => setShowSendBill(false)}
        />
      )}

      {showCharge && (
        <ChargeOverlay
          subtotal={cart.cartSubtotal}
          // Roll the manual cashier discount and every staged customer-
          // reward into one figure for the Charge screen. The cart sidebar
          // still itemises them so the cashier always knows where the
          // money went.
          discount={cart.discountValue + cart.rewardsDiscount}
          tax={cart.cartTax}
          serviceCharge={cart.cartServiceCharge}
          serviceChargeLabel={cart.serviceChargeLabel}
          packagingFee={cart.cartPackagingFee}
          deliveryFee={
            orderType === "Delivery" && order.resumedOrderId === null
              ? deliveryFeeEst
              : undefined
          }
          giftTender={cart.appliedGiftCard?.discount ?? 0}
          // Use the SERVER total for resumed tickets so the cashier
          // confirms the same number that handleCharge will settle
          // against. Without this, a ticket resumed with server-side
          // promo/loyalty/gift-card baked in (but not yet hydrated
          // into the cart fields) could show one MVR total here and
          // settle a different one — wrong change handed back, customer
          // disputes. Falls back to cart.cartTotal for fresh tickets
          // (no resumed total available yet).
          total={chargeTotal}
          creditEligible={canUseCredit && chargeCreditEligible && isReachable}
          creditAvailableMvr={chargeCreditAvailable}
          canPayCredit={canUseCredit && isReachable}
          hasAttachedCustomer={!!cart.attachedCustomer}
          creditLastRefreshedAt={chargeCreditRefreshedAt}
          onSelectCredit={() => { void refreshChargeCreditSummary(); }}
          walletEligible={canUseWallet && chargeWalletEligible && isReachable}
          walletAvailableMvr={chargeWalletAvailable}
          isOffline={!isReachable}
          allowedTenders={{
            cash: canPayCash,
            card: canPayCard,
            qr: canPayCard,
            digital_wallet: canPayCard,
            split: canPaySplit,
          }}
          submitting={order.isSubmitting}
          errorMessage={order.statusMessage}
          rewardWarning={order.rewardWarning}
          pendingPaymentOrderId={order.pendingPaymentForOrderId}
          onClose={() => setShowCharge(false)}
          onConfirm={async (rows) => {
            // Clear any stale error (e.g. from a previous attempt) so
            // a fresh confirm tap doesn't show the old message while
            // the new request is in flight.
            order.setStatusMessage("");
            const ok = await order.handleCharge(rows);
            if (ok) {
              setShowCharge(false);
              return;
            }
            // FIX 8 — settle rejected. If the cashier tried to
            // charge house_account we re-pull the credit summary so
            // the banner immediately shows the true available balance
            // instead of the stale value they saw a moment ago (which
            // is likely why the server said no).
            const involvedCredit = rows.some((r) => r.method === "house_account");
            if (involvedCredit) {
              void refreshChargeCreditSummary();
            }
          }}
        />
      )}

      {order.discountApproval && (
        <DiscountApprovalModal
          error={order.discountApproval.error}
          busy={order.discountApproval.busy}
          resending={order.discountApproval.resending}
          onConfirm={(code) => order.confirmDiscountApprovalCode(code)}
          onResend={() => order.resendDiscountApproval()}
          onCancel={() => order.cancelDiscountApproval()}
        />
      )}

      {showSaveTicket && (
        <SaveTicketModal
          attachedCustomer={cart.attachedCustomer}
          tables={tables}
          selectedTableId={selectedTableId}
          setSelectedTableId={setSelectedTableId}
          orderType={orderType}
          setOrderType={handleOrderTypeToggle}
          onConfirm={handleSaveTicketSubmit}
          onCancel={() => setShowSaveTicket(false)}
        />
      )}

      {showCloseShift && canCloseShift && (
        <CloseShiftModal
          summary={shift.summary}
          pendingOfflineCount={offlinePendingCount}
          pendingOfflineCashTotal={offlinePendingTotals.cash}
          pendingOfflineCardTotal={offlinePendingTotals.card}
          pendingOfflineTransferTotal={offlinePendingTotals.transfer}
          onSyncNow={() => {
            setShowCloseShift(false);
            setShowOfflineSyncPanel(true);
          }}
          onReviewCount={handleCountAttempt}
          onConfirm={handleCloseShift}
          onCancel={() => setShowCloseShift(false)}
        />
      )}

      {showOpenShift && canOpenShift && (
        <OpenShiftModal
          onConfirm={handleOpenShift}
          onCancel={() => setShowOpenShift(false)}
          busy={openShiftBusy}
        />
      )}

      {showOfflineSyncPanel && (
        <Suspense fallback={<PaneFallback />}>
          <OfflineSyncPanel
          shiftId={shift.current?.id ?? null}
          onClose={() => {
            setShowOfflineSyncPanel(false);
            void refreshOfflineCounts();
          }}
          onEditInCart={(offlineOrder) => {
            handleClearCart();
            cart.setCartItems(offlineOrderToCartItems(offlineOrder));
            setOrderType(offlineTypeToPos(offlineOrder.type));
            if (offlineOrder.restaurant_table_id != null) {
              setSelectedTableId(offlineOrder.restaurant_table_id);
            }
            if (offlineOrder.discount_amount != null && offlineOrder.discount_amount > 0) {
              cart.setDiscountAmount(String(offlineOrder.discount_amount));
            }
            const payMethod = offlineOrder.payment.method === 'bank_transfer'
              ? 'cash'
              : offlineOrder.payment.method === 'qr'
                ? 'qr'
                : offlineOrder.payment.method === 'card'
                  ? 'card'
                  : 'cash';
            cart.setPayments([{
              id: crypto.randomUUID(),
              method: payMethod,
              amount: offlineOrder.payment.amount > 0
                ? offlineOrder.payment.amount.toFixed(2)
                : '',
            }]);
            setPane('sales');
            void refreshOfflineCounts();
          }}
        />
        </Suspense>
      )}

      {/* Per-line kitchen note picker. We look up the active cart line
          by key so the picker stays correct even if other lines are
          added/removed underneath while the modal is open. If the line
          was removed entirely (rare race), we just dismiss via the
          effect below — calling setState inside this IIFE during render
          tripped React's "Cannot update a component while rendering"
          warning and occasionally desynced the modal on iPad. */}
      {notePickerKey !== null && (() => {
        const line = cart.cartItems.find(
          (ci) => makeCartKey(ci.id, ci.modifiers, ci.variant_id, ci.notes, ci.packaging_option_id) === notePickerKey,
        );
        if (!line) {
          return null;
        }
        const label = line.variant_name
          ? `${line.name} — ${line.variant_name}`
          : line.name;
        return (
          <NotePickerModal
            options={quickNotes}
            initialSelected={line.notes ?? []}
            itemLabel={label}
            onCancel={() => setNotePickerKey(null)}
            onSave={(selected) => {
              // Replacing notes on a line changes its cart key (notes
              // are part of makeCartKey), so we must also reconcile
              // duplicates: if there's already another line with the
              // exact same item/variant/modifiers/notes combo, merge
              // quantities into it and drop the original.
              const newKey = makeCartKey(line.id, line.modifiers, line.variant_id, selected, line.packaging_option_id);
              cart.setCartItems(
                cart.cartItems
                  .map((ci) => (ci === line ? { ...ci, notes: selected } : ci))
                  .reduce<typeof cart.cartItems>((acc, ci) => {
                    const k = makeCartKey(ci.id, ci.modifiers, ci.variant_id, ci.notes, ci.packaging_option_id);
                    if (k === newKey) {
                      const existing = acc.find(
                        (a) => makeCartKey(a.id, a.modifiers, a.variant_id, a.notes, a.packaging_option_id) === newKey,
                      );
                      if (existing) {
                        existing.quantity += ci.quantity;
                        return acc;
                      }
                    }
                    acc.push(ci);
                    return acc;
                  }, []),
              );
              setNotePickerKey(null);
            }}
          />
        );
      })()}

      {packagingPickerLines && packagingPickerLines.length > 0 && (
        <PackagingReconcileModal
          lines={packagingPickerLines}
          onConfirm={handlePackagingReconcileConfirm}
        />
      )}

      <OnlineOrderToasts
        toasts={onlineOrderWatcher.toasts}
        onDismiss={onlineOrderWatcher.dismiss}
        onOpen={(id) => {
          setReceiptsFocusOrderId(id);
          setPane("receipts");
        }}
      />
    </div>
  );
}
