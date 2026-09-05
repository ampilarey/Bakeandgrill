import { useCallback, useEffect, useState } from "react";
import { fetchItemsToReceive, receivePurchaseRequestItem, type ToReceiveItem } from "../api";
import { palette, radius, space, type } from "../theme";

/*
 * "To receive" — the box has arrived, put it on the shelf.
 *
 * Owner, 2026-09-05: once something is bought there should be a delivery list,
 * and the staff on shift accept it when it turns up. Until now only a manager
 * could, so a delivery at the back door waited for one.
 *
 * Accepting is not a tick. It is the moment the stock rises and the cost
 * lands, so the screen says that in the button rather than hiding it behind
 * the word "verify" — and it will not let the person who bought a line be the
 * person who accepts it. That guard is the server's; this screen only shows
 * the answer early, greyed with the reason, so nobody taps into a refusal.
 */

type Props = {
  onClose: () => void;
  /** Ops screens elsewhere re-read stock after an acceptance. */
  onReceived?: () => void;
};

export function ToReceivePanel({ onClose, onReceived }: Props) {
  const [items, setItems] = useState<ToReceiveItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [notes, setNotes] = useState<Record<number, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetchItemsToReceive();
      setItems(res.items);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const accept = async (item: ToReceiveItem) => {
    setBusyId(item.id);
    setError("");
    try {
      await receivePurchaseRequestItem(item.request_id, item.id, {
        verified_notes: notes[item.id]?.trim() || undefined,
      });
      // Drop it from the list rather than refetching: the shelf is the point,
      // and a full reload on a slow connection makes the tap feel lost.
      setItems((prev) => prev.filter((i) => i.id !== item.id));
      onReceived?.();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div style={{ padding: space.m, display: "flex", flexDirection: "column", gap: space.m }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: space.s }}>
        <div>
          <h2 style={{ margin: 0, fontSize: type.title.fontSize }}>To receive</h2>
          <p style={{ margin: "4px 0 0", color: palette.panelMuted, fontSize: type.bodySm.fontSize }}>
            Bought and on its way. Accepting adds it to stock.
          </p>
        </div>
        <div style={{ display: "flex", gap: space.s }}>
          <button
            type="button"
            onClick={() => void load()}
            style={{ padding: "10px 14px", borderRadius: radius.m, border: `1px solid ${palette.border}`, background: palette.panel, cursor: "pointer" }}
          >
            ↻
          </button>
          <button
            type="button"
            onClick={onClose}
            style={{ padding: "10px 16px", borderRadius: radius.m, border: `1px solid ${palette.border}`, background: palette.panel, cursor: "pointer" }}
          >
            Close
          </button>
        </div>
      </div>

      {error && <p style={{ color: "#ef4444", fontSize: type.bodySm.fontSize, margin: 0 }}>{error}</p>}

      {loading ? (
        <p style={{ color: palette.panelMuted }}>Loading…</p>
      ) : items.length === 0 ? (
        <p data-testid="to-receive-empty" style={{ color: palette.panelMuted }}>
          Nothing waiting. Anything bought will show up here.
        </p>
      ) : (
        <div data-testid="to-receive-list" style={{ display: "flex", flexDirection: "column", gap: space.s }}>
          {items.map((item) => (
            <div
              key={item.id}
              style={{
                border: `1px solid ${palette.border}`, borderRadius: radius.m,
                padding: space.m, display: "flex", flexDirection: "column", gap: 8,
                background: palette.panel,
                opacity: item.can_receive ? 1 : 0.75,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: space.s, flexWrap: "wrap" }}>
                <span style={{ fontWeight: 800, fontSize: type.body.fontSize }}>
                  {item.qty} {item.unit} · {item.name}
                </span>
                {item.partial && (
                  <span style={{ fontSize: type.bodySm.fontSize, fontWeight: 700, color: "#b45309" }}>
                    Part only
                  </span>
                )}
              </div>

              <div style={{ fontSize: type.bodySm.fontSize, color: palette.panelMuted }}>
                {item.shop ? `From ${item.shop}` : "Shop not recorded"}
                {item.bought_by ? ` · bought by ${item.bought_by}` : ""}
                {item.requested_by ? ` · for ${item.requested_by}` : ""}
                {item.request_no ? ` · ${item.request_no}` : ""}
              </div>

              {item.can_receive ? (
                <>
                  <input
                    aria-label={`Note for ${item.name}`}
                    placeholder="Note (optional) — damage, short delivery…"
                    value={notes[item.id] ?? ""}
                    onChange={(e) => setNotes((n) => ({ ...n, [item.id]: e.target.value }))}
                    style={{ padding: 10, borderRadius: radius.m, border: `1px solid ${palette.border}`, fontSize: 16, boxSizing: "border-box" }}
                  />
                  <button
                    type="button"
                    disabled={busyId === item.id}
                    onClick={() => void accept(item)}
                    style={{
                      minHeight: 48, borderRadius: radius.m, border: "none",
                      background: "#1C1408", color: "#fff", fontWeight: 700,
                      fontSize: type.body.fontSize,
                      cursor: busyId === item.id ? "not-allowed" : "pointer",
                      opacity: busyId === item.id ? 0.5 : 1,
                    }}
                  >
                    {busyId === item.id ? "Adding to stock…" : "Accept — add to stock"}
                  </button>
                </>
              ) : (
                <p style={{ margin: 0, fontSize: type.bodySm.fontSize, fontWeight: 600, color: "#b45309" }}>
                  {item.blocked_reason ?? "Somebody else has to accept this one."}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
