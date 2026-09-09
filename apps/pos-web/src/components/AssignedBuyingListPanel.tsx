import { useEffect, useState } from "react";
import {
  fetchAssignedPurchaseRequests,
  markPurchaseRequestItemBought,
  markPurchaseRequestItemNotAvailable,
  markPurchaseRequestItemPartial,
  uploadPurchaseRequestAttachment,
  type PosPurchaseRequest,
  type PosPurchaseRequestItem,
} from "../api";
import { palette, radius, space, type } from "../theme";

type Props = {
  onClose: () => void;
};

type ItemDraft = {
  actualQty: string;
  unitCostMvr: string;
  shopName: string;
  /** The brand on the tin — what makes a shop run comparable across brands. */
  brand: string;
  notes: string;
  /** The day it was bought. Defaults to today; a past date catches up a late entry. */
  boughtOn: string;
};

/** Today as YYYY-MM-DD in the device's own timezone, not UTC. */
function todayIso(): string {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function emptyDraft(): ItemDraft {
  return { actualQty: "", unitCostMvr: "", shopName: "", brand: "", notes: "", boughtOn: todayIso() };
}

export function AssignedBuyingListPanel({ onClose }: Props) {
  const [rows, setRows] = useState<PosPurchaseRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [drafts, setDrafts] = useState<Record<number, ItemDraft>>({});
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    setErr("");
    try {
      const res = await fetchAssignedPurchaseRequests();
      setRows(res.data ?? []);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const getDraft = (item: PosPurchaseRequestItem): ItemDraft => {
    return drafts[item.id] ?? {
      ...emptyDraft(),
      actualQty: String(item.approved_qty ?? item.requested_qty),
    };
  };

  const setDraft = (item: PosPurchaseRequestItem, patch: Partial<ItemDraft>) => {
    setDrafts((prev) => ({
      ...prev,
      [item.id]: {
        ...(prev[item.id] ?? { ...emptyDraft(), actualQty: String(item.approved_qty ?? item.requested_qty) }),
        ...patch,
      },
    }));
  };

  const mvrToLaar = (mvr: string): number | undefined => {
    const n = parseFloat(mvr);
    if (isNaN(n) || n < 0) return undefined;
    return Math.round(n * 100);
  };

  const runItem = async (
    requestId: number,
    item: PosPurchaseRequestItem,
    action: "bought" | "partial" | "na",
    receipt?: File | null,
  ) => {
    const d = getDraft(item);
    setBusyId(item.id);
    setErr("");
    try {
      const payload = {
        actual_qty: parseFloat(d.actualQty) || item.requested_qty,
        actual_unit_cost_laar: mvrToLaar(d.unitCostMvr),
        supplier_name_text: d.shopName.trim() || undefined,
        brand: d.brand.trim() || undefined,
        buyer_notes: d.notes.trim() || undefined,
        // Only sent when it isn't today, so the normal case posts nothing extra.
        bought_at: d.boughtOn && d.boughtOn !== todayIso() ? d.boughtOn : undefined,
      };
      if (action === "bought") await markPurchaseRequestItemBought(requestId, item.id, payload);
      else if (action === "partial") await markPurchaseRequestItemPartial(requestId, item.id, payload);
      else await markPurchaseRequestItemNotAvailable(requestId, item.id, d.notes.trim() || undefined);
      if (receipt) await uploadPurchaseRequestAttachment(requestId, receipt, "receipt", item.id);
      void load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div style={{ padding: space.m, maxWidth: 820, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: space.m }}>
        <h2 style={{ margin: 0, fontSize: type.title.fontSize }}>Buying list</h2>
        <button type="button" onClick={onClose} style={{ padding: "8px 12px", borderRadius: radius.m, border: `1px solid ${palette.border}`, background: "#fff", cursor: "pointer" }}>
          Back
        </button>
      </div>
      <p style={{ color: palette.panelMuted, fontSize: type.bodySm.fontSize, marginTop: 0 }}>
        Mark items bought when you return. Stock is not updated until a manager verifies.
      </p>

      {err && <p style={{ color: "#ef4444" }}>{err}</p>}
      {loading ? <p>Loading…</p> : rows.length === 0 ? (
        <p style={{ color: palette.panelMuted }}>Nothing assigned to you right now.</p>
      ) : (
        rows.map((r) => (
          <div key={r.id} style={{ marginBottom: space.l, background: palette.panel, borderRadius: radius.l, padding: space.m, border: `1px solid ${palette.border}` }}>
            <div style={{ fontWeight: 700, marginBottom: space.s }}>{r.request_no} · {r.priority}</div>
            {r.items.filter((i) => !["received", "not_available", "cancelled", "bought"].includes(i.status)).map((item) => {
              const d = getDraft(item);
              const receiptId = `receipt-${item.id}`;
              return (
                <div key={item.id} style={{ borderTop: `1px solid ${palette.border}`, paddingTop: space.s, marginTop: space.s }}>
                  <div style={{ fontWeight: 600 }}>{item.name}</div>
                  {/*
                    The packets, so the person holding the phone can match the
                    shelf. Owner, 2026-09-09: "upload a pic of different brand
                    of item to know which brand is this". Tapping one fills the
                    brand box, so the record of what was bought writes itself.
                  */}
                  {(item.brand_photos ?? []).length > 0 && (
                    <div style={{ display: "flex", gap: space.s, overflowX: "auto", padding: `${space.s}px 0` }} data-testid={`brand-photos-${item.id}`}>
                      {(item.brand_photos ?? []).map((p) => {
                        const chosen = d.brand.trim().toLowerCase() === p.brand.trim().toLowerCase();
                        return (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => setDraft(item, { brand: chosen ? "" : p.brand })}
                            aria-pressed={chosen}
                            aria-label={`${p.brand} — tap if this is the one you bought`}
                            style={{
                              flexShrink: 0, width: 84, padding: 4, cursor: "pointer",
                              background: chosen ? palette.primaryBg : "transparent",
                              border: `2px solid ${chosen ? palette.primary : palette.border}`,
                              borderRadius: radius.m, textAlign: "center",
                            }}
                          >
                            <img
                              src={p.url}
                              alt={p.brand}
                              style={{ width: "100%", height: 64, objectFit: "cover", borderRadius: radius.s, display: "block" }}
                            />
                            <span style={{ fontSize: 11, fontWeight: 600, display: "block", marginTop: 2, wordBreak: "break-word" }}>
                              {p.brand}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                  <div style={{ fontSize: type.bodySm.fontSize, color: palette.panelMuted, marginBottom: space.s }}>
                    Need {item.approved_qty ?? item.requested_qty} {item.requested_unit}
                    {item.brand && <> · Usually {item.brand}</>}
                    {item.price_hint?.cheapest && (
                      <> · Cheapest {item.price_hint.cheapest.supplier_name ?? "shop"} @ MVR {item.price_hint.cheapest.unit_price.toFixed(2)}</>
                    )}
                    {item.price_hint?.last_paid != null && (
                      <> · Last MVR {item.price_hint.last_paid.toFixed(2)}</>
                    )}
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: space.s, marginBottom: space.s }}>
                    <input placeholder="Actual qty" value={d.actualQty} onChange={(e) => setDraft(item, { actualQty: e.target.value })} style={{ padding: 8, borderRadius: radius.m, border: `1px solid ${palette.border}` }} />
                    <input
                      placeholder="Unit cost MVR"
                      value={d.unitCostMvr}
                      onChange={(e) => setDraft(item, { unitCostMvr: e.target.value })}
                      style={{ padding: 8, borderRadius: radius.m, border: `1px solid ${palette.border}` }}
                    />
                    {item.price_hint?.cheapest && !d.unitCostMvr && (
                      <button
                        type="button"
                        onClick={() => setDraft(item, {
                          unitCostMvr: String(item.price_hint!.cheapest!.unit_price),
                          shopName: item.price_hint!.cheapest!.supplier_name ?? d.shopName,
                        })}
                        style={{ padding: "8px 12px", borderRadius: radius.m, border: `1px solid ${palette.border}`, background: "#fff", cursor: "pointer", fontSize: 12 }}
                      >
                        Use cheapest
                      </button>
                    )}
                    <input placeholder="Bought from" aria-label="Bought from" value={d.shopName} onChange={(e) => setDraft(item, { shopName: e.target.value })} style={{ padding: 8, borderRadius: radius.m, border: `1px solid ${palette.border}` }} />
                    <input placeholder="Brand (as on the tin)" aria-label="Brand" value={d.brand} onChange={(e) => setDraft(item, { brand: e.target.value })} style={{ padding: 8, borderRadius: radius.m, border: `1px solid ${palette.border}` }} />
                    <label style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: 11, color: palette.panelMuted }}>
                      Bought on
                      <input
                        type="date"
                        data-testid={`bought-on-${item.id}`}
                        value={d.boughtOn}
                        max={todayIso()}
                        onChange={(e) => setDraft(item, { boughtOn: e.target.value })}
                        style={{ padding: 8, borderRadius: radius.m, border: `1px solid ${palette.border}`, fontFamily: "inherit" }}
                      />
                    </label>
                  </div>
                  <textarea placeholder="Buyer note" value={d.notes} onChange={(e) => setDraft(item, { notes: e.target.value })} rows={2} style={{ width: "100%", padding: 8, borderRadius: radius.m, border: `1px solid ${palette.border}`, boxSizing: "border-box", marginBottom: space.s }} />
                  <label style={{ fontSize: type.bodySm.fontSize, display: "block", marginBottom: space.s }}>
                    Receipt photo
                    <input id={receiptId} type="file" accept="image/*,.heic,.heif" style={{ display: "block", marginTop: 4 }} />
                  </label>
                  <div style={{ display: "flex", gap: space.s, flexWrap: "wrap" }}>
                    <button type="button" disabled={busyId === item.id} onClick={() => {
                      const file = (document.getElementById(receiptId) as HTMLInputElement)?.files?.[0] ?? null;
                      void runItem(r.id, item, "bought", file);
                    }} style={{ padding: "8px 12px", borderRadius: radius.m, border: "none", background: "#16a34a", color: "#fff", fontWeight: 600, cursor: "pointer" }}>
                      Bought
                    </button>
                    <button type="button" disabled={busyId === item.id} onClick={() => {
                      const file = (document.getElementById(receiptId) as HTMLInputElement)?.files?.[0] ?? null;
                      void runItem(r.id, item, "partial", file);
                    }} style={{ padding: "8px 12px", borderRadius: radius.m, border: `1px solid ${palette.border}`, background: "#fff", cursor: "pointer" }}>
                      Partial
                    </button>
                    <button type="button" disabled={busyId === item.id} onClick={() => void runItem(r.id, item, "na")} style={{ padding: "8px 12px", borderRadius: radius.m, border: `1px solid ${palette.border}`, background: "#fff", cursor: "pointer" }}>
                      Not available
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ))
      )}
    </div>
  );
}
