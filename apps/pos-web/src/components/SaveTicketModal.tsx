import { useState } from "react";
import { Card, Field, Overlay } from "./OpenShiftModal";

type Props = {
  defaultName?: string;
  onConfirm: (name: string, note?: string) => Promise<void>;
  onCancel: () => void;
};

/**
 * Loyverse-style "Save ticket" sheet. Multiple parked tickets are
 * essential when one cashier juggles drive-through + dine-in walk-ins.
 * Name is required so the cashier can find the right one again — that's
 * the main reason the old single-held-order flow was painful.
 */
export function SaveTicketModal({ defaultName, onConfirm, onCancel }: Props) {
  const [name, setName] = useState(defaultName ?? "");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const submit = async () => {
    const n = name.trim();
    if (!n) { setErr("Give the ticket a name so you can find it later."); return; }
    setBusy(true);
    try { await onConfirm(n, note.trim() || undefined); }
    catch (e) { setErr((e as Error).message || "Could not save ticket."); }
    finally { setBusy(false); }
  };

  return (
    <Overlay>
      <Card title="Save ticket" subtitle="Park this order so you can ring up the next customer and come back to it later.">
        <Field label="Ticket name">
          <input
            autoFocus
            value={name}
            onChange={(e) => { setName(e.target.value); setErr(""); }}
            placeholder="e.g. Table 4, Aisha"
            style={{
              width: "100%", boxSizing: "border-box",
              padding: "12px 14px", borderRadius: 10,
              border: "1px solid #CBD5E1", fontSize: 16, background: "#fff",
            }}
          />
        </Field>
        <Field label="Note (optional)">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. No ice"
            style={{
              width: "100%", boxSizing: "border-box",
              padding: "12px 14px", borderRadius: 10,
              border: "1px solid #CBD5E1", fontSize: 14, background: "#fff",
            }}
          />
        </Field>
        {err && <div style={{ marginTop: 10, padding: "10px 12px", borderRadius: 8, background: "#FEE2E2", color: "#B91C1C", fontSize: 13 }}>{err}</div>}
        <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
          <button onClick={onCancel} disabled={busy} style={{
            flex: 1, padding: "12px 18px", borderRadius: 10,
            border: "1px solid #CBD5E1", background: "#fff", color: "#475569",
            fontWeight: 600, fontSize: 14, cursor: "pointer",
          }}>Cancel</button>
          <button onClick={submit} disabled={busy} style={{
            flex: 1, padding: "12px 18px", borderRadius: 10,
            border: "none", background: "#D4813A", color: "#fff",
            fontWeight: 700, fontSize: 14, cursor: "pointer",
          }}>{busy ? "Saving…" : "Save ticket"}</button>
        </div>
      </Card>
    </Overlay>
  );
}
