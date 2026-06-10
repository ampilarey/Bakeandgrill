import { LoginPage } from '../pages/LoginPage';
import { TimeClockPanel } from '../components/TimeClockPanel';
import { LockScreen } from '../components/LockScreen';
import { KitchenStaffLanding } from '../components/KitchenStaffLanding';
import { RequestItemModal } from '../components/RequestItemModal';
import { MyPurchaseRequestsPanel } from '../components/MyPurchaseRequestsPanel';
import { AssignedBuyingListPanel } from '../components/AssignedBuyingListPanel';
import { ShiftClosedGate } from '../components/ShiftClosedGate';
import { OpenShiftModal } from '../components/OpenShiftModal';
import { evaluateOfflineGate } from '../offline/offlineGate';
import { usePosAppContext } from './PosAppProvider';
import { PosShellLayout } from './PosShellLayout';

export function PosRouter() {
  const app = usePosAppContext();
  const {
    showTimeClock, setShowTimeClock, isLoggedIn, username, setUsername, pin, setPin,
    deviceId, authError, handleLogin, canTimeClock, isLocked, cashierName, handleUnlock,
    handleLogout, canLockScreen, lockScreen, canKitchenOnly, kitchenPane, setKitchenPane,
    showRequestItemModal, setShowRequestItemModal, canCreatePurchaseRequest,
    canViewOwnPurchaseRequests, canBuyAssigned, shift, canEnterPosShell, showOpenShift,
    setShowOpenShift, handleOpenShift, openShiftBusy, canOpenShift, isReachable,
    offlineGate, setOfflineGate, menu, canRingSales, connectivity,
  } = app;

  if (showTimeClock) {
    return <TimeClockPanel deviceId={deviceId} onBack={() => setShowTimeClock(false)} />;
  }

  if (!isLoggedIn) {
    return (
      <>
        <LoginPage
          username={username} setUsername={setUsername}
          pin={pin} setPin={setPin}
          deviceId={deviceId}
          authError={authError} onLogin={handleLogin}
        />
        {canTimeClock && (
        <button
          onClick={() => setShowTimeClock(true)}
          style={{
            position: "fixed", bottom: 24, right: 24, zIndex: 5,
            padding: "12px 18px", borderRadius: 999,
            background: "#fff", border: "none", color: "#0F172A",
            fontWeight: 700, fontSize: 14, cursor: "pointer",
            boxShadow: "0 10px 30px rgba(0,0,0,0.3)",
          }}
        >⏰ Time Clock</button>
        )}
      </>
    );
  }

  if (isLocked) {
    return (
      <LockScreen
        cashierName={cashierName}
        onUnlock={handleUnlock}
        onSwitchUser={handleLogout}
      />
    );
  }

  if (canKitchenOnly) {
    if (kitchenPane === "my_requests") {
      return (
        <MyPurchaseRequestsPanel
          onClose={() => setKitchenPane("home")}
          onRequestNew={canCreatePurchaseRequest ? () => setShowRequestItemModal(true) : undefined}
        />
      );
    }
    if (kitchenPane === "buying_list") {
      return <AssignedBuyingListPanel onClose={() => setKitchenPane("home")} />;
    }
    return (
      <>
        <KitchenStaffLanding
          cashierName={cashierName}
          onLogout={handleLogout}
          onSwitchUser={canLockScreen ? lockScreen : undefined}
          onRequestItems={canCreatePurchaseRequest ? () => setShowRequestItemModal(true) : undefined}
          onMyRequests={canViewOwnPurchaseRequests ? () => setKitchenPane("my_requests") : undefined}
          onBuyingList={canBuyAssigned ? () => setKitchenPane("buying_list") : undefined}
        />
        {showRequestItemModal && (
          <RequestItemModal onClose={() => setShowRequestItemModal(false)} />
        )}
      </>
    );
  }

  // Hard shift gate — sales-only cashiers must open a shift first.
  if (!shift.loading && !shift.current && !canEnterPosShell) {
    return (
      <>
        <ShiftClosedGate
          onOpenShift={() => setShowOpenShift(true)}
          onLogout={handleLogout}
          onSwitchUser={canLockScreen ? lockScreen : undefined}
          canOpenShift={canOpenShift}
          error={shift.error || undefined}
        />
        {showOpenShift && canOpenShift && (
          <OpenShiftModal
            onConfirm={handleOpenShift}
            onCancel={() => setShowOpenShift(false)}
            busy={openShiftBusy}
          />
        )}
      </>
    );
  }

  if (!isReachable && offlineGate && !offlineGate.allowed && !menu.isLoading && !shift.loading) {
    const activeSessionFallback =
      !!localStorage.getItem("pos_token")
      && (shift.current != null || !canRingSales)
      && (shift.current != null ? menu.items.length > 0 : true);

    if (!activeSessionFallback) {
    return (
      <div style={{
        minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
        padding: 24, background: "#F8FAFC", color: "#0F172A",
      }}>
        <div style={{
          maxWidth: 480, width: "100%", background: "#fff", borderRadius: 12,
          padding: 24, boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
        }}>
          <h1 style={{ margin: "0 0 8px", fontSize: 22 }}>Offline mode unavailable</h1>
          <p style={{ margin: 0, color: "#64748B", lineHeight: 1.5 }}>
            {offlineGate.reason ?? "Connect while online once to cache menu, shift, and staff session."}
          </p>
          <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => void connectivity.ping().then(() => evaluateOfflineGate({ requireShift: canRingSales }).then(setOfflineGate))}
              style={{
                minHeight: 44, padding: "0 16px", borderRadius: 8,
                border: "none", background: "#0F172A", color: "#fff", fontWeight: 700, cursor: "pointer",
              }}
            >
              Retry connection
            </button>
            <button
              type="button"
              onClick={handleLogout}
              style={{
                minHeight: 44, padding: "0 16px", borderRadius: 8,
                border: "1px solid #E2E8F0", background: "#fff", fontWeight: 600, cursor: "pointer",
              }}
            >
              Log out
            </button>
          </div>
        </div>
      </div>
    );
    }
  }

  return <PosShellLayout />;
}
