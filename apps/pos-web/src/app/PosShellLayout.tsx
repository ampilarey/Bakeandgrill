import { makeCartKey } from '../hooks/useCart';
import { MenuGrid } from '../components/MenuGrid';
import { OrderCart } from '../components/OrderCart';
import { OpsPanel } from '../components/OpsPanel';
import { SendBillPanel } from '../components/SendBillPanel';
import { NotePickerModal } from '../components/NotePickerModal';
import { OpenShiftModal } from '../components/OpenShiftModal';
import { CloseShiftModal } from '../components/CloseShiftModal';
import { SaveTicketModal } from '../components/SaveTicketModal';
import { OpenTicketsPanel } from '../components/OpenTicketsPanel';
import { KitchenReceivingPanel } from '../components/KitchenReceivingPanel';
import { ReceiptsPanel } from '../components/ReceiptsPanel';
import { ShiftPanel } from '../components/ShiftPanel';
import { ShiftHistoryPanel } from '../components/ShiftHistoryPanel';
import { SalesReportPanel } from '../components/SalesReportPanel';
import { ExpensesPanel } from '../components/ExpensesPanel';
import { PosPreferencesModal } from '../components/PosPreferencesModal';
import { SideDrawer } from '../components/SideDrawer';
import { ChargeOverlay } from '../components/ChargeOverlay';
import { OfflineSyncPanel } from '../components/OfflineSyncPanel';
import type { OfflineOrderRecord } from '../offline/db';
import { ReceiptActionsBanner } from '../components/ReceiptActionsBanner';
import { PosUpdateBanner } from '../components/PosUpdateBanner';
import { OnlineOrderToasts } from '../components/OnlineOrderToasts';
import { RequestItemModal } from '../components/RequestItemModal';
import { MyPurchaseRequestsPanel } from '../components/MyPurchaseRequestsPanel';
import { AssignedBuyingListPanel } from '../components/AssignedBuyingListPanel';
import { POS_BUILD_INFO } from '../posBuildInfo';
import { closeTable, mergeTables, openTable } from '../api';
import { palette } from '../theme';
import { validateDeliveryDetails, type PosOrderType } from '../orderTypes';
import type { CartItem } from '../types';
import { usePosAppContext } from './PosAppProvider';
import { paneTitle, Banner, NoticeBanner, shouldShowStatusBanner } from './posUiHelpers';
import type { Pane } from './types';

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
    isLoggedIn, isLocked, pane, setPane, drawerOpen, setDrawerOpen, cashierName, deviceId,
    shift, shiftOpen, canEnterPosShell, canOpenShift, canCloseShift, canRingSales, canHoldResume,
    canViewActiveOrders, canViewReceipts, canViewShiftHistory, canViewReports, canManageExpenses,
    canAccessOps, canVoidOrders,
    canManageOrderStatus, canSendBill, canSendPayLink, canRefund, canCreatePurchaseRequest,
    canLockScreen, canPayCash,
    canPayCard, canPaySplit, canUseCredit, canUseWallet, canApplyDiscount, canUseRewards,
    canOpsInventory, canOpsPreparedStock,
    canCashInOut, isReachable, offlineQueueCount, offlinePendingCount,
    offlinePendingTotals, showOfflineSyncPanel, setShowOfflineSyncPanel, deviceBlockedMessage,
    receiptBanner, setReceiptBanner, orderType, setOrderType, deliveryDetails, setDeliveryDetails,
    customerAddresses, selectedDeliveryAddressId, setSelectedDeliveryAddressId, applyPosDeliveryAddress, tables,
    selectedTableId, setSelectedTableId, quickNotes, smsNotifications, notePickerKey,
    setNotePickerKey, menu, cart, deliveryFeeEst, ops, filteredItems, refreshOpenTickets,
    order, chargeTotal, handleAttachCustomer, handleDetachCustomer, posUpdate, refreshAll,
    refreshTables, isRefreshingAll, openTicketsCount, openTicketsCritical, kitchenHandoverSettings, handleClearCart,
    handleLogout, lockScreen, handleOpenShift, handleCloseShift, handleSaveTicketSubmit,
    refreshOfflineCounts, drawerItems, showPreferences, setShowPreferences,
    showRequestItemModal, setShowRequestItemModal, showSendBill, setShowSendBill,
    showCharge, setShowCharge, chargeCreditEligible, chargeCreditAvailable,
    chargeWalletEligible, chargeWalletAvailable, showSaveTicket, setShowSaveTicket,
    showCloseShift, setShowCloseShift, showOpenShift, setShowOpenShift, openShiftBusy,
    receiptsFocusOrderId, setReceiptsFocusOrderId, idleLockMinutes, setIdleLockMinutes,
    onlineOrderWatcher,
  } = app;

  return (
    <div className="pos-shell" style={{
      minHeight: '100dvh',
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

        <div className="pos-topbar-right">
          {/* Sales chip — quick at-a-glance shift KPI */}
          {shift.summary && (
            <span className="pos-topbar-chip" style={{
              padding: '4px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700,
              background: '#0F172A', color: '#fff',
            }}>
              {shift.summary.sales_summary.order_count} orders · MVR {Number(shift.summary.sales_summary.net_sales ?? 0).toFixed(0)}
            </span>
          )}

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

      {deviceBlockedMessage && (
        <div className="pos-device-blocked-banner">
          {deviceBlockedMessage}
        </div>
      )}

      {receiptBanner && (
        <div style={{ padding: "8px 16px 0" }}>
          <ReceiptActionsBanner
            orderId={receiptBanner.orderId}
            customerPhone={receiptBanner.customerPhone}
            paidOnCredit={receiptBanner.paidOnCredit}
            receiptResendEnabled={smsNotifications.receipt_resend}
            onDismiss={() => setReceiptBanner(null)}
          />
        </div>
      )}

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
      <main className="pos-main" style={{ flex: 1, display: 'flex', minHeight: 0, padding: 12, gap: 12 }}>
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
            <OrderCart
              orderType={orderType}
              setOrderType={setOrderType}
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
              onUnlockEdit={() => order.setIsEditingActive(true)}
              onSaveActiveChanges={() => void order.handleSaveActiveChanges().then(refreshOpenTickets)}
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
              dataError={menu.dataError}
              selectedItem={cart.selectedItem}
              selectedModifiers={cart.selectedModifiers}
              handleSelectItem={cart.handleSelectItem}
              toggleModifier={cart.toggleModifier}
              addToCart={cart.addToCart}
              clearSelectedItem={() => cart.setSelectedItem(null)}
              barcode={order.barcode}
              setBarcode={order.setBarcode}
              onBarcodeSubmit={(e) => order.handleBarcodeSubmit(e, menu.items, cart.addToCart)}
              // Bug-055: the menu was disabled the moment ANY ticket
              // was resumed, including edit mode — the cashier
              // couldn't add items even though the cart was unlocked.
              // Lock the menu only in charge-only resume (where the
              // cart is read-only). In edit mode the cashier MUST be
              // able to tap items to add them to the open ticket.
              readOnly={order.resumedOrderId !== null && !order.isEditingActive}
              onRefreshMenu={refreshAll}
              isRefreshingMenu={isRefreshingAll || menu.isRefreshing}
              lastRefreshedAt={menu.lastRefreshedAt}
            />
          </>
          )
        )}

        {pane === 'receipts' && (
          <ReceiptsPanel
            onClose={() => {
              setReceiptsFocusOrderId(null);
              setPane(shiftOpen && canRingSales ? "sales" : canAccessOps ? "ops" : "shift_history");
            }}
            shiftId={shift.current?.id ?? null}
            initialOrderId={receiptsFocusOrderId}
            receiptResendEnabled={smsNotifications.receipt_resend}
            canRefund={canRefund && shiftOpen}
          />
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
            onClose={() => setPane(shiftOpen && canRingSales ? "sales" : canAccessOps ? "ops" : "shift_history")}
            onResume={(t) => {
              // Tap-to-open active ticket: load the order into the main
              // POS cart in edit mode (cart unlocked, "Save changes"
              // button appears) so the cashier can add/remove items
              // before charging. For PARKED tickets edit mode is the
              // natural fit; for COOKING/READY it lets the cashier
              // patch a missed line without re-ringing the whole
              // ticket. Surfaces resume errors instead of swallowing
              // them so the cashier sees what went wrong.
              order.handleEditActiveTicket(t.id)
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
          />
        )}

        {pane === 'shift_history' && (
          <ShiftHistoryPanel onClose={() => setPane(canAccessOps ? "ops" : "shift")} />
        )}

        {pane === 'sales_report' && canViewReports && (
          <SalesReportPanel
            onClose={() => setPane(canRingSales && shiftOpen ? "sales" : canAccessOps ? "ops" : "shift")}
            onOpenReceipts={
              canViewReceipts && shiftOpen ? () => setPane("receipts") : undefined
            }
            onOpenShiftHistory={
              canViewShiftHistory ? () => setPane("shift_history") : undefined
            }
          />
        )}

        {pane === 'expenses' && canManageExpenses && (
          <ExpensesPanel
            onClose={() => setPane(canRingSales && shiftOpen ? "sales" : canAccessOps ? "ops" : "shift")}
          />
        )}

        {pane === 'ops' && (
          <OpsPanel
            {...ops}
            permissions={{
              inventory: canOpsInventory,
              preparedStock: canOpsPreparedStock,
              refunds: canRefund,
              shiftOpen,
            }}
            onRequestItem={canCreatePurchaseRequest ? () => setShowRequestItemModal(true) : undefined}
          />
        )}

        {pane === 'my_requests' && (
          <MyPurchaseRequestsPanel
            onClose={() => setPane(canRingSales && shiftOpen ? "sales" : canAccessOps ? "ops" : "shift_history")}
            onRequestNew={canCreatePurchaseRequest ? () => setShowRequestItemModal(true) : undefined}
          />
        )}

        {pane === 'buying_list' && (
          <AssignedBuyingListPanel
            onClose={() => setPane(canRingSales && shiftOpen ? "sales" : canAccessOps ? "ops" : "shift_history")}
          />
        )}

        {pane === 'kitchen_receiving' && (
          <KitchenReceivingPanel
            onClose={() => setPane(canViewActiveOrders && shiftOpen ? "open_tickets" : canRingSales && shiftOpen ? "sales" : "shift_history")}
            onReceived={() => void refreshOpenTickets()}
          />
        )}
      </main>

      <SideDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        items={drawerItems}
        active={pane}
        cashierName={cashierName}
        shiftLabel={shift.current ? `Shift #${shift.current.id} · MVR ${Number(shift.summary?.cash_drawer.expected_cash ?? 0).toFixed(2)} in drawer` : 'No open shift'}
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
          deliveryFee={
            orderType === "Delivery" && order.resumedOrderId === null
              ? deliveryFeeEst
              : undefined
          }
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
          onClose={() => setShowCharge(false)}
          onConfirm={async (rows) => {
            // Clear any stale error (e.g. from a previous attempt) so
            // a fresh confirm tap doesn't show the old message while
            // the new request is in flight.
            order.setStatusMessage("");
            const ok = await order.handleCharge(rows);
            if (ok) setShowCharge(false);
          }}
        />
      )}

      {showSaveTicket && (
        <SaveTicketModal
          attachedCustomer={cart.attachedCustomer}
          tables={tables}
          selectedTableId={selectedTableId}
          setSelectedTableId={setSelectedTableId}
          orderType={orderType}
          setOrderType={setOrderType}
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
          (ci) => makeCartKey(ci.id, ci.modifiers, ci.variant_id, ci.notes) === notePickerKey,
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
              const newKey = makeCartKey(line.id, line.modifiers, line.variant_id, selected);
              cart.setCartItems(
                cart.cartItems
                  .map((ci) => (ci === line ? { ...ci, notes: selected } : ci))
                  .reduce<typeof cart.cartItems>((acc, ci) => {
                    const k = makeCartKey(ci.id, ci.modifiers, ci.variant_id, ci.notes);
                    if (k === newKey) {
                      const existing = acc.find(
                        (a) => makeCartKey(a.id, a.modifiers, a.variant_id, a.notes) === newKey,
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
