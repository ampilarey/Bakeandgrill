import { useCallback, useEffect, useMemo, useState } from "react";
import {
  cancelStockCount,
  fetchActiveStockCount,
  openStockCount,
  postStockCount,
  reopenStockCount,
  saveStockCounts,
  submitStockCount,
  type StockCountLine,
  type StockCountPayload,
  type StockCountSession,
} from "../api";

const C = {
  text: "#0F172A",
  muted: "#64748B",
  subtle: "#94A3B8",
  border: "#E2E8F0",
  success: "#10B981",
  warn: "#F59E0B",
  danger: "#EF4444",
  rail: "#0F172A",
};

/**
 * Counting the store room, on the phone that is already in the counter's hand.
 *
 * Three things this screen does that a "type the new stock level" form cannot:
 *
 *  - it never shows what the system expects. The expected figure is not in the
 *    payload while the sheet is open (the server decides that, not this file),
 *    because a number on screen is a number people count towards.
 *  - it saves each entry as it is made. An hour of counting must not depend on
 *    the phone staying awake or the wifi reaching the back of the store room.
 *  - it ends by handing the sheet to somebody else. Nothing has moved when the
 *    counter puts the phone down.
 */
export function StockCountTab({ setOpsMessage }: { setOpsMessage: (msg: string) => void }) {
  /*
   * Whether this person may review is taken from the server's `can_review`,
   * not from a prop. The same field decides whether the variance is in the
   * payload at all, so one answer governs both what is shown and what exists
   * to show — a client-side flag could only ever disagree with it.
   */
  const [payload, setPayload] = useState<StockCountPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  /** Entries typed but not yet acknowledged by the server, keyed by line id. */
  const [pending, setPending] = useState<Record<number, string>>({});
  const [savedAt, setSavedAt] = useState<string>("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setPayload(await fetchActiveStockCount());
    } catch (e) {
      setOpsMessage((e as Error).message || "Could not load the stock count.");
    } finally {
      setLoading(false);
    }
  }, [setOpsMessage]);

  useEffect(() => { void load(); }, [load]);

  const session: StockCountSession | null = payload?.session ?? null;
  const lines = useMemo(() => payload?.lines ?? [], [payload]);
  const isOpen = session?.status === "open";
  const isSubmitted = session?.status === "submitted";
  const canReview = !!payload?.can_review;

  const countedTotal = lines.filter((l) => l.counted_qty !== null).length;

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return lines;

    return lines.filter((l) => (l.name ?? "").toLowerCase().includes(q)
      || (l.sku ?? "").toLowerCase().includes(q));
  }, [lines, search]);

  const run = async (fn: () => Promise<StockCountPayload>, ok: string) => {
    setBusy(true);
    try {
      setPayload(await fn());
      setPending({});
      setOpsMessage(ok);
    } catch (e) {
      setOpsMessage((e as Error).message || "That did not go through.");
    } finally {
      setBusy(false);
    }
  };

  /*
   * One line, saved on blur.
   *
   * Deliberately not debounced-as-you-type: a half-typed "1" on the way to
   * "12" is a real number to the server, and a count that records 1kg of rice
   * because somebody paused is worse than one that saves a moment later.
   */
  const commitLine = async (line: StockCountLine) => {
    const raw = pending[line.id];
    if (raw === undefined) return;
    const trimmed = raw.trim();
    const value = trimmed === "" ? null : Number(trimmed);
    if (value !== null && (!Number.isFinite(value) || value < 0)) {
      setOpsMessage(`${line.name ?? "That item"} needs a number, or nothing at all.`);

      return;
    }
    if (!session) return;

    try {
      const next = await saveStockCounts(session.id, [{ line_id: line.id, counted_qty: value }]);
      setPayload(next);
      setPending((p) => {
        const { [line.id]: _drop, ...rest } = p;

        return rest;
      });
      setSavedAt(new Date().toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }));
    } catch (e) {
      // Left in `pending` on purpose, so the number stays on screen to retry.
      setOpsMessage((e as Error).message || "That count did not save — check the connection.");
    }
  };

  if (loading) {
    return <div style={{ padding: 16, color: C.muted, fontSize: 13 }}>Loading…</div>;
  }

  if (!session) {
    return (
      <div style={{ padding: 16 }}>
        <p style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 800, color: C.text }}>Stock count</p>
        <p style={{ margin: "0 0 14px", fontSize: 12, color: C.muted, lineHeight: 1.5 }}>
          Count the store room without seeing what the system expects. Your entries
          save as you go, and nothing moves until someone else accepts the count.
        </p>
        <button
          type="button"
          data-testid="stock-count-open"
          disabled={busy}
          onClick={() => run(() => openStockCount({}), "Counting sheet ready.")}
          style={{
            width: "100%", minHeight: 48, borderRadius: 10, border: "none",
            background: C.rail, color: "#fff", fontWeight: 800, fontSize: 15,
            cursor: busy ? "wait" : "pointer", fontFamily: "inherit", touchAction: "manipulation",
          }}
        >
          Start a stock count
        </button>
      </div>
    );
  }

  return (
    <div style={{ padding: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: C.text }}>
            {session.reference}
            <span style={{
              marginLeft: 8, fontSize: 11, fontWeight: 700,
              color: isSubmitted ? C.warn : C.success,
            }}>
              {isSubmitted ? "AWAITING REVIEW" : "COUNTING"}
            </span>
          </div>
          <div style={{ fontSize: 11, color: C.subtle }}>
            {countedTotal} of {lines.length} counted
            {savedAt ? ` · saved ${savedAt}` : ""}
          </div>
        </div>
      </div>

      {isSubmitted && !canReview && (
        <div style={{
          padding: "10px 12px", borderRadius: 8, background: "#FFFBEB",
          border: "1px solid #FDE68A", fontSize: 12, color: "#92400E", marginBottom: 10,
        }}>
          Handed over. A manager or owner reviews the differences and accepts the count —
          nothing has moved yet.
        </div>
      )}

      {isSubmitted && canReview && (
        <ReviewPanel
          lines={lines}
          totalVariance={payload?.variance_value_mvr ?? null}
          busy={busy}
          onPost={() => run(() => postStockCount(session.id), "Count posted — stock updated.")}
          onSendBack={() => run(() => reopenStockCount(session.id), "Sent back for another look.")}
        />
      )}

      {isOpen && (
        <>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Find an item…"
            aria-label="Find an item to count"
            style={{
              width: "100%", minHeight: 44, marginBottom: 8, padding: "10px 12px",
              borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 14,
              fontFamily: "inherit", boxSizing: "border-box",
            }}
          />

          <div data-testid="stock-count-lines" style={{
            border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden",
          }}>
            {visible.map((line) => {
              const typed = pending[line.id];
              const value = typed !== undefined
                ? typed
                : (line.counted_qty === null ? "" : String(line.counted_qty));

              return (
                <div
                  key={line.id}
                  style={{
                    display: "flex", alignItems: "center", gap: 10, padding: "8px 10px",
                    borderBottom: `1px solid ${C.border}`, minHeight: 52,
                    background: line.counted_qty !== null ? "#F0FDF4" : "transparent",
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{line.name}</div>
                    <div style={{ fontSize: 11, color: C.subtle }}>
                      {line.unit ?? ""}{line.sku ? ` · ${line.sku}` : ""}
                    </div>
                  </div>
                  <input
                    value={value}
                    inputMode="decimal"
                    aria-label={`Counted quantity for ${line.name ?? "item"}`}
                    data-testid={`stock-count-input-${line.id}`}
                    onChange={(e) => setPending((p) => ({ ...p, [line.id]: e.target.value }))}
                    onBlur={() => void commitLine(line)}
                    style={{
                      width: 92, minHeight: 44, padding: "8px 10px", borderRadius: 8,
                      border: `1px solid ${typed !== undefined ? C.warn : C.border}`,
                      fontSize: 16, fontWeight: 700, textAlign: "right",
                      fontFamily: "inherit", boxSizing: "border-box",
                    }}
                  />
                </div>
              );
            })}
            {visible.length === 0 && (
              <div style={{ padding: 12, fontSize: 12, color: C.muted }}>Nothing matches that.</div>
            )}
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button
              type="button"
              disabled={busy}
              onClick={() => run(() => cancelStockCount(session.id), "Count cancelled — nothing moved.")}
              style={{
                flex: 1, minHeight: 48, borderRadius: 10, border: `1px solid ${C.border}`,
                background: "#fff", color: C.danger, fontWeight: 700, fontSize: 14,
                cursor: "pointer", fontFamily: "inherit", touchAction: "manipulation",
              }}
            >
              Cancel count
            </button>
            <button
              type="button"
              data-testid="stock-count-submit"
              disabled={busy || countedTotal === 0}
              onClick={() => run(() => submitStockCount(session.id), "Handed over for review.")}
              style={{
                flex: 2, minHeight: 48, borderRadius: 10, border: "none",
                background: countedTotal === 0 ? "#A7F3D0" : C.success,
                color: "#fff", fontWeight: 800, fontSize: 15,
                cursor: countedTotal === 0 ? "not-allowed" : "pointer",
                fontFamily: "inherit", touchAction: "manipulation",
              }}
            >
              Hand over for review
            </button>
          </div>
          <p style={{ margin: "8px 2px 0", fontSize: 11, color: C.subtle, lineHeight: 1.5 }}>
            Leave an item blank if you did not get to it — blank is skipped, not zero.
          </p>
        </>
      )}
    </div>
  );
}

/** What a reviewer sees, and only once the sheet has been handed over. */
function ReviewPanel({
  lines, totalVariance, busy, onPost, onSendBack,
}: {
  lines: StockCountLine[];
  totalVariance: number | null;
  busy: boolean;
  onPost: () => void;
  onSendBack: () => void;
}) {
  const differences = lines
    .filter((l) => l.counted_qty !== null && Math.abs(l.variance ?? 0) > 0.0005)
    .sort((a, b) => (b.variance_value_mvr ?? 0) - (a.variance_value_mvr ?? 0));
  const blocked = differences.some((l) => l.needs_reason && !(l.note ?? "").trim());

  return (
    <div data-testid="stock-count-review" style={{ marginBottom: 12 }}>
      <div style={{
        padding: "10px 12px", borderRadius: 8, background: "#F8FAFC",
        border: `1px solid ${C.border}`, marginBottom: 8,
      }}>
        <div style={{ fontSize: 12, color: C.muted }}>Difference found</div>
        <div style={{ fontSize: 22, fontWeight: 800, color: C.text }}>
          MVR {(totalVariance ?? 0).toFixed(2)}
        </div>
      </div>

      {differences.length === 0 ? (
        <div style={{ padding: 12, fontSize: 12, color: C.muted }}>
          Everything counted matched the books.
        </div>
      ) : (
        <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
          {differences.map((l) => (
            <div key={l.id} style={{
              padding: "8px 10px", borderBottom: `1px solid ${C.border}`,
              background: l.needs_reason && !(l.note ?? "").trim() ? "#FEF2F2" : "transparent",
            }}>
              <div style={{ display: "flex", gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{l.name}</div>
                  <div style={{ fontSize: 11, color: C.subtle }}>
                    expected {l.snapshot_qty} · counted {l.counted_qty} {l.unit ?? ""}
                  </div>
                </div>
                <div style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                  <div style={{
                    fontSize: 13, fontWeight: 800,
                    color: (l.variance ?? 0) < 0 ? C.danger : C.success,
                  }}>
                    {(l.variance ?? 0) > 0 ? "+" : ""}{l.variance}
                  </div>
                  <div style={{ fontSize: 11, color: C.muted }}>
                    MVR {(l.variance_value_mvr ?? 0).toFixed(2)}
                  </div>
                </div>
              </div>
              {l.note ? (
                <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>“{l.note}”</div>
              ) : l.needs_reason ? (
                <div style={{ fontSize: 11, color: C.danger, marginTop: 4, fontWeight: 700 }}>
                  Needs a reason before this count can be accepted.
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <button
          type="button"
          disabled={busy}
          onClick={onSendBack}
          style={{
            flex: 1, minHeight: 48, borderRadius: 10, border: `1px solid ${C.border}`,
            background: "#fff", color: C.text, fontWeight: 700, fontSize: 14,
            cursor: "pointer", fontFamily: "inherit", touchAction: "manipulation",
          }}
        >
          Send back
        </button>
        <button
          type="button"
          data-testid="stock-count-post"
          disabled={busy || blocked}
          onClick={onPost}
          style={{
            flex: 2, minHeight: 48, borderRadius: 10, border: "none",
            background: blocked ? "#FCA5A5" : C.success, color: "#fff",
            fontWeight: 800, fontSize: 15,
            cursor: blocked ? "not-allowed" : "pointer",
            fontFamily: "inherit", touchAction: "manipulation",
          }}
        >
          {blocked ? "A reason is needed first" : "Accept and update stock"}
        </button>
      </div>
    </div>
  );
}
