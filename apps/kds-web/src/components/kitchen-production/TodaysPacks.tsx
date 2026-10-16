import { useState } from "react";
import { failureMessage, labelSheetUrl, productionStickerLinks, type KdsPlanTask, type KitchenStickerSize, type StickerLang } from "../../api";

/*
 * Today's packs (label audit, Batch D, 2026-10-16): every batch made for
 * today's plan of an item that prints labels, in one list with how many
 * stickers have printed for each (from the tasks the screen already reads),
 * and one Print for the ones ticked. Each
 * batch keeps its own batch number and dates on its stickers, and its print
 * is logged against it; two batches of one item are two rows on the same
 * sheet, each with a print code of its own.
 * The PDF's window opens in the tap itself, as for a single batch.
 */

/** A batch made today, as the list shows it. */
export type TodaysPack = { pi: number; item: { id: number; name: string }; size: number | null; batch: string; mfg: string | null; exp: string | null; qty: number; printed: number; locked: boolean };

type Props = {
  token: string;
  size: KitchenStickerSize;
  lang: StickerLang;
  tasks: KdsPlanTask[];
  /** Reads the tasks again, for the printed counts. */
  onPrinted: () => Promise<void> | void;
};

/** Today's batches of items that print labels, newest first. */
export function packsOf(tasks: KdsPlanTask[]): TodaysPack[] {
  return tasks
    .filter((t) => t.label_enabled !== false)
    .flatMap((t) => (t.batches ?? []).map((b) => ({ pi: b.pi, item: { id: t.item_id, name: t.name }, size: t.variant_id > 0 ? t.variant_id : null, batch: b.batch_no, mfg: b.mfg ?? null, exp: b.expires_at, qty: Math.round(b.qty), printed: b.printed ?? 0, locked: Boolean(t.stickers_locked) })))
    .sort((a, b) => b.pi - a.pi);
}

/** The ticked packs that go in the print: every one ticked, except what the wording lock refuses. */
export function nextSet(packs: TodaysPack[], ticked: Record<number, boolean>): TodaysPack[] {
  return packs.filter((p) => ticked[p.pi] && !p.locked);
}

export function TodaysPacks({ token, size, lang, tasks, onPrinted }: Props) {
  const [open, setOpen] = useState(false);
  const packs = packsOf(tasks);
  // Not printed yet is ticked to start with; a print unticks what it took.
  const [ticked, setTicked] = useState<Record<number, boolean>>({});
  const [counts, setCounts] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState<{ pdf: string; count: number } | null>(null);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    setErr(""); setDone(null);
    if (next) setTicked(Object.fromEntries(packs.map((p) => [p.pi, p.printed === 0 && !p.locked])));
  };

  const countOf = (p: TodaysPack) => Math.max(1, Math.min(400, Math.round(Number(counts[p.pi] ?? "") > 0 ? Number(counts[p.pi]) : p.qty || 1)));
  const set = nextSet(packs, ticked);
  const stickers = set.reduce((n, p) => n + countOf(p), 0);

  const print = async () => {
    if (set.length === 0) return;
    setBusy(true); setErr(""); setDone(null);
    const win = window.open("", "_blank");
    try {
      const r = await productionStickerLinks(token, {
        items: set.map((p) => ({ id: p.item.id, copies: countOf(p), pi: p.pi, ...(p.size ? { size: p.size } : {}), batch: p.batch || null, mfg: p.mfg, exp: p.exp })),
        layout: size.layout, w: size.w, h: size.h, lang, fill: true, mfg: null, exp: null, roll: size.roll ?? null,
      });
      const pdf = labelSheetUrl(r.pdf_url);
      if (win) { win.location.href = pdf; } else { window.open(pdf, "_blank", "noopener"); }
      setDone({ pdf, count: stickers });
      setTicked((t) => ({ ...t, ...Object.fromEntries(set.map((p) => [p.pi, false])) }));
      await onPrinted();
    } catch (e) {
      win?.close();
      setErr(failureMessage(e, "Could not prepare the stickers."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div data-testid="kds-todays-packs" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        data-testid="kds-todays-packs-toggle"
        style={{ alignSelf: "flex-start", padding: "8px 12px", borderRadius: 8, border: "1px solid #EDE4D4", background: open ? "#B74B0C" : "#fff", color: open ? "#fff" : "#2A1E0C", fontWeight: 700, cursor: "pointer", fontSize: 13 }}
      >
        Print stickers for today's packs
      </button>
      {open && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: 10, borderRadius: 8, background: "#FFF8F3", border: "1px dashed #B74B0C", color: "#2A1E0C" }}>
          {packs.length === 0 && <p style={{ margin: 0, fontSize: 13 }}>No packs made today of an item that prints labels.</p>}
          {packs.map((p) => (
            <label key={p.pi} data-testid={`kds-pack-${p.pi}`} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", fontSize: 13, minHeight: 36 }}>
              <input type="checkbox" disabled={p.locked} checked={Boolean(ticked[p.pi]) && !p.locked} onChange={(e) => setTicked((t) => ({ ...t, [p.pi]: e.target.checked }))} aria-label={`Print ${p.item.name}, batch ${p.batch || "—"}`} style={{ width: 20, height: 20 }} />
              <span style={{ fontWeight: 700 }}>{p.item.name}</span>
              <span>Batch {p.batch || "—"}{p.exp ? ` · use by ${p.exp}` : ""}</span>
              <span style={{ color: p.printed > 0 ? "#6B5D4F" : "#B74B0C", fontWeight: 600 }}>{p.printed > 0 ? `${p.printed} printed` : "Not printed yet"}</span>
              {p.locked && <span style={{ color: "#991B1B", fontWeight: 600 }}>Wording not signed off: prints once it is</span>}
              <input
                type="number" min={1} max={400} step={1} inputMode="numeric"
                aria-label={`Stickers for ${p.item.name}, batch ${p.batch || "—"}`}
                value={counts[p.pi] ?? String(Math.max(1, p.qty))}
                onChange={(e) => setCounts((c) => ({ ...c, [p.pi]: e.target.value }))}
                style={{ width: 72, padding: 6, borderRadius: 8, border: "1px solid #EDE4D4", fontSize: 15, fontWeight: 700, textAlign: "center" }}
              />
            </label>
          ))}
          {packs.length > 0 && (
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <button
                type="button"
                disabled={busy || set.length === 0}
                onClick={() => void print()}
                data-testid="kds-todays-packs-print"
                style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #B74B0C", background: "#B74B0C", color: "#fff", fontWeight: 700, cursor: set.length === 0 ? "not-allowed" : "pointer", opacity: set.length === 0 ? 0.5 : 1, fontSize: 13 }}
              >
                {busy ? "Preparing…" : set.length === 0 ? "Tick the packs to print" : `Print ${stickers} ${stickers === 1 ? "sticker" : "stickers"} for ${set.length} ${set.length === 1 ? "pack" : "packs"}`}
              </button>
              <span style={{ fontSize: 12, color: "#6B5D4F" }}>On {size.name}.</span>
            </div>
          )}
          {done && (
            <a href={done.pdf} target="_blank" rel="noreferrer" data-testid="kds-todays-packs-ready" style={{ fontSize: 12, color: "#B74B0C", fontWeight: 700 }}>
              {done.count} ready · open the PDF again
            </a>
          )}
          {err && <div role="alert" style={{ padding: 8, background: "#FEE2E2", color: "#991B1B", borderRadius: 8, fontSize: 13 }}>{err}</div>}
        </div>
      )}
    </div>
  );
}
