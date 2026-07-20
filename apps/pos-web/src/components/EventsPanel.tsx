import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  cancelPosEvent,
  fetchPosEvents,
  firePosEvent,
  type FireShortage,
  type PosEvent,
} from "../api/events";
import { palette, radius, space, type } from "../theme";
import { EmptyState, PanelShell } from "./openTickets/PanelShell";

function mvrFromLaar(laar: number): string {
  return `MVR ${(laar / 100).toFixed(2)}`;
}

function chipLabel(chip: string): string {
  switch (chip) {
    case "awaiting_payment": return "Awaiting payment";
    case "confirmed": return "Confirmed";
    case "in_prep": return "In prep";
    case "completed": return "Completed";
    case "cancelled": return "Cancelled";
    default: return chip.replace(/_/g, " ");
  }
}

function chipStyle(chip: string): CSSProperties {
  const base: CSSProperties = {
    display: "inline-block",
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: 0.3,
    textTransform: "uppercase",
    padding: "3px 8px",
    borderRadius: 999,
    border: "1px solid",
  };
  switch (chip) {
    case "awaiting_payment":
      return { ...base, background: "#FFFBEB", color: "#92400E", borderColor: "#FDE68A" };
    case "confirmed":
      return { ...base, background: "#ECFDF5", color: "#065F46", borderColor: "#A7F3D0" };
    case "in_prep":
      return { ...base, background: "#EFF6FF", color: "#1E40AF", borderColor: "#BFDBFE" };
    case "completed":
      return { ...base, background: "#F3F4F6", color: "#374151", borderColor: "#D1D5DB" };
    case "cancelled":
      return { ...base, background: "#FEF2F2", color: "#991B1B", borderColor: "#FECACA" };
    default:
      return { ...base, background: palette.bgAlt, color: palette.panelInk, borderColor: palette.border };
  }
}

function groupByDate(events: PosEvent[], today: string): Array<{ date: string; isToday: boolean; events: PosEvent[] }> {
  const map = new Map<string, PosEvent[]>();
  for (const e of events) {
    const d = e.event_date ?? "unknown";
    const list = map.get(d) ?? [];
    list.push(e);
    map.set(d, list);
  }
  const dates = [...map.keys()].sort((a, b) => {
    if (a === today) return -1;
    if (b === today) return 1;
    return a.localeCompare(b);
  });
  return dates.map((date) => ({
    date,
    isToday: date === today,
    events: map.get(date) ?? [],
  }));
}

type Props = {
  canManageEvents: boolean;
  shiftOpen: boolean;
  onClose: () => void;
  onSettleBalance: (orderId: number) => void;
};

export function EventsPanel({ canManageEvents, shiftOpen, onClose, onSettleBalance }: Props) {
  const [events, setEvents] = useState<PosEvent[]>([]);
  const [today, setToday] = useState(() => new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [rowMsg, setRowMsg] = useState<string | null>(null);
  const [dietaryOpen, setDietaryOpen] = useState<PosEvent | null>(null);
  const [shortagePrompt, setShortagePrompt] = useState<{
    event: PosEvent;
    shortages: FireShortage[];
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const res = await fetchPosEvents();
      setEvents(res.events);
      setToday(res.meta.today);
    } catch (e) {
      setErr((e as Error).message || "Could not load events");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const groups = useMemo(() => groupByDate(events, today), [events, today]);

  const handleFire = async (event: PosEvent, confirmShortages = false) => {
    setBusyId(event.id);
    setRowMsg(null);
    try {
      const res = await firePosEvent(event.id, confirmShortages);
      if (res.requires_confirmation && res.shortages?.length) {
        setShortagePrompt({ event, shortages: res.shortages });
        return;
      }
      setRowMsg(res.message);
      await load();
    } catch (e) {
      setRowMsg((e as Error).message || "Fire failed");
    } finally {
      setBusyId(null);
    }
  };

  const handleCancel = async (event: PosEvent) => {
    if (!window.confirm(`Cancel event ${event.reference ?? event.id}?`)) return;
    setBusyId(event.id);
    setRowMsg(null);
    try {
      const res = await cancelPosEvent(event.id);
      setRowMsg(res.message);
      await load();
    } catch (e) {
      setRowMsg((e as Error).message || "Cancel failed");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <PanelShell
      title="Events"
      subtitle="Upcoming catering & event orders — independent of your shift"
      onClose={onClose}
    >
      <div data-testid="events-panel" style={{ display: "flex", flexDirection: "column", gap: space.m, padding: space.m, overflow: "auto", flex: 1, minHeight: 0 }}>
        {loading && <p style={{ color: palette.panelMuted, fontSize: 14 }}>Loading events…</p>}
        {err && <p role="alert" style={{ color: "#991B1B", fontSize: 14 }}>{err}</p>}
        {rowMsg && <p role="status" style={{ color: palette.panelInk, fontSize: 13 }}>{rowMsg}</p>}

        {!loading && !err && groups.length === 0 && (
          <EmptyState emoji="📅" title="No upcoming events" body="Confirmed and awaiting-payment events will show here." />
        )}

        {groups.map((g) => (
          <section
            key={g.date}
            data-testid={g.isToday ? "events-group-today" : `events-group-${g.date}`}
            style={{
              borderRadius: radius.l,
              border: g.isToday ? `2px solid ${palette.primary}` : `1px solid ${palette.border}`,
              background: g.isToday ? "#FFF7ED" : palette.panel,
              padding: space.m,
            }}
          >
            <h3 style={{ ...type.subtitle, margin: `0 0 ${space.s}px`, color: palette.panelInk }}>
              {g.isToday ? "Today" : g.date}
              <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 600, color: palette.panelMuted }}>
                {g.events.length}
              </span>
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: space.s }}>
              {g.events.map((ev) => (
                <EventCard
                  key={ev.id}
                  event={ev}
                  canManage={canManageEvents}
                  shiftOpen={shiftOpen}
                  busy={busyId === ev.id}
                  onFire={() => void handleFire(ev)}
                  onSettle={() => ev.order && onSettleBalance(ev.order.id)}
                  onCancel={() => void handleCancel(ev)}
                  onDietary={() => setDietaryOpen(ev)}
                />
              ))}
            </div>
          </section>
        ))}
      </div>

      {dietaryOpen?.dietary_notes && (
        <div
          role="dialog"
          aria-label="Dietary notes"
          data-testid="dietary-modal"
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)",
            display: "flex", alignItems: "center", justifyContent: "center", zIndex: 80, padding: 16,
          }}
          onClick={() => setDietaryOpen(null)}
        >
          <div
            style={{ background: "#fff", borderRadius: 12, padding: 20, maxWidth: 420, width: "100%" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: "0 0 8px" }}>Dietary / allergy notes</h3>
            <p style={{ margin: "0 0 16px", whiteSpace: "pre-wrap", fontSize: 15 }}>{dietaryOpen.dietary_notes}</p>
            <button type="button" onClick={() => setDietaryOpen(null)} style={btnPrimary}>Close</button>
          </div>
        </div>
      )}

      {shortagePrompt && (
        <div
          role="dialog"
          aria-label="Stock shortages"
          data-testid="shortage-modal"
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)",
            display: "flex", alignItems: "center", justifyContent: "center", zIndex: 80, padding: 16,
          }}
        >
          <div style={{ background: "#fff", borderRadius: 12, padding: 20, maxWidth: 460, width: "100%" }}>
            <h3 style={{ margin: "0 0 8px", color: "#92400E" }}>Stock / availability warning</h3>
            <p style={{ margin: "0 0 12px", fontSize: 14, color: palette.panelMuted }}>
              Some lines are short. Events can still be sent to kitchen — confirm to proceed.
            </p>
            <ul style={{ margin: "0 0 16px", paddingLeft: 18, fontSize: 14 }}>
              {shortagePrompt.shortages.map((s) => (
                <li key={s.order_item_id}>
                  <strong>{s.item_name}</strong>
                  {s.reason === "insufficient_stock"
                    ? ` — need ${s.requested}, have ${s.available ?? 0}`
                    : ` — ${s.reason.replace(/_/g, " ")}`}
                </li>
              ))}
            </ul>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button type="button" style={btnGhost} onClick={() => setShortagePrompt(null)}>Back</button>
              <button
                type="button"
                style={btnPrimary}
                data-testid="confirm-shortages"
                onClick={() => {
                  const ev = shortagePrompt.event;
                  setShortagePrompt(null);
                  void handleFire(ev, true);
                }}
              >
                Send anyway
              </button>
            </div>
          </div>
        </div>
      )}
    </PanelShell>
  );
}

function EventCard({
  event,
  canManage,
  shiftOpen,
  busy,
  onFire,
  onSettle,
  onCancel,
  onDietary,
}: {
  event: PosEvent;
  canManage: boolean;
  shiftOpen: boolean;
  busy: boolean;
  onFire: () => void;
  onSettle: () => void;
  onCancel: () => void;
  onDietary: () => void;
}) {
  const lineSummary = event.lines
    .slice(0, 4)
    .map((l) => `${l.quantity}× ${l.name}`)
    .join(", ")
    + (event.lines.length > 4 ? ` +${event.lines.length - 4} more` : "");

  const bal = event.order?.balance_laar ?? 0;
  const paid = event.order?.paid_laar ?? 0;
  const canFire = canManage
    && event.status === "confirmed"
    && !!event.order
    && !event.order.fired_at;
  const canSettle = canManage && !!event.order && bal > 0 && shiftOpen;
  const canCancel = canManage && event.status !== "cancelled" && event.status !== "completed";

  return (
    <article
      data-testid={`event-card-${event.id}`}
      style={{
        border: `1px solid ${palette.border}`,
        borderRadius: radius.m,
        padding: space.m,
        background: "#fff",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 15 }}>{event.reference ?? `Event #${event.id}`}</div>
          <div style={{ fontSize: 13, color: palette.panelMuted, marginTop: 2 }}>
            {event.contact_name}
            {event.headcount ? ` · ${event.headcount} guests` : ""}
          </div>
        </div>
        <span style={chipStyle(event.display_status)} data-testid="event-status-chip">
          {chipLabel(event.display_status)}
        </span>
      </div>

      <div style={{ marginTop: 8, fontSize: 13, color: palette.panelInk, lineHeight: 1.45 }}>
        <div>
          <strong style={{ textTransform: "capitalize" }}>{event.fulfillment_method}</strong>
          {event.setup_time ? ` · Setup ${event.setup_time}` : ""}
          {event.fulfillment_time ? ` · Event ${event.fulfillment_time}` : ""}
        </div>
        {event.venue_name && <div>Venue: {event.venue_name}</div>}
        {event.handled_by && (
          <div data-testid="handled-by">Handled by: {event.handled_by.name}</div>
        )}
        {lineSummary && <div style={{ marginTop: 4, color: palette.panelMuted }}>{lineSummary}</div>}
      </div>

      <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        {event.dietary_notes && (
          <button
            type="button"
            data-testid="dietary-badge"
            onClick={onDietary}
            style={{
              background: "#7F1D1D",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              fontWeight: 800,
              fontSize: 12,
              letterSpacing: 0.4,
              padding: "6px 10px",
              minHeight: 36,
              cursor: "pointer",
            }}
          >
            DIETARY
          </button>
        )}
        {event.order && (
          <span style={{ fontSize: 13, fontWeight: 700 }}>
            Paid {mvrFromLaar(paid)}
            {bal > 0 ? ` · Balance ${mvrFromLaar(bal)}` : " · Settled"}
          </span>
        )}
        {!event.order && event.display_status === "awaiting_payment" && (
          <span style={{ fontSize: 13, color: "#92400E", fontWeight: 700 }}>Awaiting customer payment</span>
        )}
      </div>

      {canManage && (
        <div
          data-testid="event-actions"
          style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 8 }}
        >
          {canFire && (
            <button type="button" style={btnPrimary} disabled={busy} onClick={onFire} data-testid="fire-to-kitchen">
              Send to kitchen
            </button>
          )}
          {canSettle && (
            <button type="button" style={btnPrimary} disabled={busy} onClick={onSettle} data-testid="settle-balance">
              Settle balance
            </button>
          )}
          {canCancel && (
            <button type="button" style={btnDanger} disabled={busy} onClick={onCancel} data-testid="cancel-event">
              Cancel event
            </button>
          )}
        </div>
      )}
    </article>
  );
}

const btnPrimary: CSSProperties = {
  minHeight: 44,
  padding: "0 14px",
  borderRadius: 10,
  border: "none",
  background: palette.primary,
  color: "#fff",
  fontWeight: 800,
  fontSize: 13,
  cursor: "pointer",
};

const btnGhost: CSSProperties = {
  ...btnPrimary,
  background: palette.bgAlt,
  color: palette.panelInk,
  border: `1px solid ${palette.border}`,
};

const btnDanger: CSSProperties = {
  ...btnPrimary,
  background: "#FEF2F2",
  color: "#991B1B",
  border: "1px solid #FECACA",
};
