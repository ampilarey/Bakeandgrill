import { useState } from "react";
import { palette, type } from "../theme";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { type OpenTicket, useOpenTickets } from "../hooks/useOpenTickets";
import {
  ticketDisplayTotal,
  ticketStage,
  type TicketStage,
} from "../utils/openTicketUtils";
import { MergeModeBanner } from "./openTickets/MergeModeBanner";
import { MergeConfirmModal } from "./openTickets/MergeConfirmModal";
import { OpenTicketsFilterBar } from "./openTickets/OpenTicketsFilterBar";
import { OpenTicketsScopeBar } from "./openTickets/OpenTicketsScopeBar";
import { EmptyState, PanelShell } from "./openTickets/PanelShell";
import { PhonePromptModal } from "./openTickets/PhonePromptModal";
import { PrintBillFallbackModal } from "./openTickets/PrintBillFallbackModal";
import { SplitItemPicker } from "./openTickets/SplitItemPicker";
import { TicketList } from "./openTickets/TicketList";
import { VoidConfirmModal } from "./openTickets/VoidConfirmModal";

export type { OpenTicket, TicketStage };
export { ticketDisplayTotal, ticketStage };
export { PanelShell, EmptyState } from "./openTickets/PanelShell";

type Props = {
  canVoidOrders?: boolean;
  canHoldResume?: boolean;
  canManageOrderStatus?: boolean;
  canSendBill?: boolean;
  canSendPayLink?: boolean;
  requirePosReceivingBeforeReady?: boolean;
  onResume: (ticket: OpenTicket) => void;
  onClose: () => void;
  cartCustomerPhone?: string | null;
  smsNotifications?: { send_bill: boolean; send_pay_link: boolean };
  /** Clear pending-payment UI when this order is voided. */
  onOrderCancelled?: (orderId: number) => void;
};

export function OpenTicketsPanel({
  canVoidOrders = true,
  canHoldResume = true,
  canManageOrderStatus = true,
  canSendBill = true,
  canSendPayLink = true,
  requirePosReceivingBeforeReady = false,
  onResume,
  onClose,
  cartCustomerPhone,
  smsNotifications = { send_bill: true, send_pay_link: true },
  onOrderCancelled,
}: Props) {
  const hook = useOpenTickets({ cartCustomerPhone, onOrderCancelled });
  const {
    tickets,
    loading,
    err,
    listScope,
    selectListScope,
    busyId,
    rowMsg,
    phonePrompt,
    setPhonePrompt,
    activeFilter,
    setActiveFilter,
    searchOpen,
    search,
    setSearch,
    toggleSearchOpen,
    mergeTargetId,
    mergeConfirm,
    setMergeConfirm,
    mergeBusy,
    splitFor,
    setSplitFor,
    filteredTickets,
    allCount,
    paymentCounts,
    typeCounts,
    stageCounts,
    handleFireToKitchen,
    handleSendPayLink,
    handleStartCooking,
    handleMarkReady,
    confirmVoidTicket,
    handleMarkPickedUp,
    handleSendBill,
    submitPhonePrompt,
    handlePrintBill,
    handleStartMerge,
    handleCancelMerge,
    handlePickMergeSource,
    handleConfirmMerge,
    handleSplitConfirm,
    printBillFallback,
    closePrintBillFallback,
  } = hook;

  const [voidPrompt, setVoidPrompt] = useState<{ ticket: OpenTicket; reason: string } | null>(null);
  const [voidBusy, setVoidBusy] = useState(false);
  const isNarrow = useMediaQuery("(max-width: 840px)");

  const handleConfirmVoid = async () => {
    if (!voidPrompt) return;
    const t = voidPrompt.ticket;
    const reason = voidPrompt.reason.trim();
    if (reason.length === 0) return;

    setVoidBusy(true);
    try {
      await confirmVoidTicket(t, reason);
      setVoidPrompt(null);
    } finally {
      setVoidBusy(false);
    }
  };

  const subtitle =
    mergeTargetId !== null
      ? (isNarrow ? "Tap another ticket to merge" : "Tap any other ticket to preview the merge (you'll confirm before anything changes)")
      : listScope === "all"
        ? (isNarrow ? "All staff tickets" : "All staff — parked, cooking, and ready-for-pickup")
        : listScope === "online"
          ? (isNarrow ? "Online pickup & delivery" : "Online orders — pickup and delivery from the ordering app")
          : (isNarrow ? "My tickets this shift" : "My tickets — ones I created on this shift");

  return (
    <PanelShell
      title={mergeTargetId !== null ? "Merge tickets" : "Active orders"}
      subtitle={subtitle}
      onClose={onClose}
      toolbar={
        <>
          {mergeTargetId !== null && (
            <MergeModeBanner mergeTargetId={mergeTargetId} onCancel={handleCancelMerge} />
          )}
          {mergeTargetId === null && (
            <OpenTicketsScopeBar listScope={listScope} selectListScope={selectListScope} />
          )}
          <OpenTicketsFilterBar
            allCount={allCount}
            stageCounts={stageCounts}
            typeCounts={typeCounts}
            paymentCounts={paymentCounts}
            activeFilter={activeFilter}
            setActiveFilter={setActiveFilter}
            searchOpen={searchOpen}
            search={search}
            setSearch={setSearch}
            toggleSearchOpen={toggleSearchOpen}
          />
        </>
      }
    >
      {loading && <p style={{ color: palette.panelMuted, fontSize: type.bodySm.fontSize }}>Loading…</p>}
      {err && <p style={{ color: palette.dangerDark, fontSize: type.bodySm.fontSize }}>{err}</p>}
      {!loading && tickets.length === 0 && (
        <EmptyState
          emoji="🎫"
          title="No active orders"
          body="Parked, cooking, and ready-for-pickup tickets will show up here."
        />
      )}
      {!loading && tickets.length > 0 && filteredTickets.length === 0 && (
        <EmptyState
          emoji="🔍"
          title="No matches"
          body="Tap All to see every active ticket, or change your search."
        />
      )}

      <TicketList
        filteredTickets={filteredTickets}
        busyId={busyId}
        rowMsg={rowMsg}
        mergeTargetId={mergeTargetId}
        canVoidOrders={canVoidOrders}
        canHoldResume={canHoldResume}
        canManageOrderStatus={canManageOrderStatus}
        canSendBill={canSendBill}
        canSendPayLink={canSendPayLink}
        requirePosReceivingBeforeReady={requirePosReceivingBeforeReady}
        smsNotifications={smsNotifications}
        onResume={onResume}
        onVoid={(t) => setVoidPrompt({ ticket: t, reason: "" })}
        onSplit={setSplitFor}
        handleFireToKitchen={handleFireToKitchen}
        handleSendPayLink={handleSendPayLink}
        handleStartCooking={handleStartCooking}
        handleMarkReady={handleMarkReady}
        handleMarkPickedUp={handleMarkPickedUp}
        handleSendBill={handleSendBill}
        handlePrintBill={handlePrintBill}
        handleStartMerge={handleStartMerge}
        handlePickMergeSource={handlePickMergeSource}
      />

      {phonePrompt && (
        <PhonePromptModal
          ticketLabel={phonePrompt.ticket.ticket_name || `Order ${phonePrompt.ticket.order_number}`}
          phone={phonePrompt.phone}
          onPhoneChange={(phone) => setPhonePrompt((p) => p ? { ...p, phone } : p)}
          onCancel={() => setPhonePrompt(null)}
          onSubmit={submitPhonePrompt}
          title={phonePrompt.purpose === "pay_link" ? "Send pay link SMS" : "Send bill SMS"}
          submitLabel={phonePrompt.purpose === "pay_link" ? "Send pay link" : "Send SMS"}
        />
      )}
      {splitFor && (
        <SplitItemPicker
          ticket={splitFor}
          onCancel={() => setSplitFor(null)}
          onConfirm={(itemIds) => void handleSplitConfirm(splitFor.id, itemIds)}
        />
      )}
      {mergeConfirm && (
        <MergeConfirmModal
          target={mergeConfirm.target}
          source={mergeConfirm.source}
          busy={mergeBusy}
          onCancel={() => {
            if (mergeBusy) return;
            setMergeConfirm(null);
          }}
          onConfirm={() => void handleConfirmMerge()}
        />
      )}
      {voidPrompt && (
        <VoidConfirmModal
          ticket={voidPrompt.ticket}
          reason={voidPrompt.reason}
          busy={voidBusy}
          onReasonChange={(reason) => setVoidPrompt((p) => p ? { ...p, reason } : p)}
          onCancel={() => {
            if (voidBusy) return;
            setVoidPrompt(null);
          }}
          onConfirm={() => void handleConfirmVoid()}
        />
      )}
      {printBillFallback && (
        <PrintBillFallbackModal
          url={printBillFallback.url}
          ticketLabel={
            printBillFallback.ticket.ticket_name
              ?? `Order ${printBillFallback.ticket.order_number}`
          }
          onClose={closePrintBillFallback}
        />
      )}
    </PanelShell>
  );
}
