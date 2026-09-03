import { useEffect, useRef, useState } from "react";
import type { PosQuickLayoutSource } from "../api";
import { z } from "../theme";
import type { QuickScope, ScopedQuickTab } from "../utils/quickTabs";

export type QuickTabPromptState =
  | { mode: "edit"; tab: ScopedQuickTab; index: number; count: number }
  | { mode: "new"; scope: QuickScope };

export type QuickTabPromptResult =
  | { kind: "save"; name: string; from: string | null; to: string | null }
  | { kind: "create"; scope: QuickScope; name: string; from: string | null; to: string | null }
  | { kind: "move"; delta: -1 | 1 }
  | { kind: "delete" }
  | { kind: "copy"; fromUserId: number };

type Props = {
  state: QuickTabPromptState;
  canManageShared: boolean;
  /** Cashiers whose tabs can be copied — loaded when the sheet opens for a new tab of my own. */
  loadSources?: () => Promise<PosQuickLayoutSource[]>;
  onResult: (result: QuickTabPromptResult) => void;
  onClose: () => void;
};

const field: React.CSSProperties = {
  width: "100%", minHeight: 44, padding: "0 12px", borderRadius: 10,
  border: "1px solid #CBD5E1", fontSize: 16, fontFamily: "inherit", color: "#0F172A",
  background: "#fff", boxSizing: "border-box",
};
const label: React.CSSProperties = { display: "block", fontSize: 12, fontWeight: 700, color: "#475569", marginBottom: 4 };
const button = (tone: "primary" | "plain" | "danger"): React.CSSProperties => ({
  minHeight: 44, borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: "pointer", padding: "0 14px",
  background: tone === "primary" ? "#D4813A" : tone === "danger" ? "#FEE2E2" : "#F8FAFC",
  border: `1px solid ${tone === "primary" ? "#B86820" : tone === "danger" ? "#FCA5A5" : "#CBD5E1"}`,
  color: tone === "primary" ? "#fff" : tone === "danger" ? "#B91C1C" : "#0F172A",
  textAlign: "left",
});

/**
 * The sheet a press-and-hold on a Quick tab pill raises, and the one the
 * "+ Tab" pill opens.
 *
 * Owner, 2026-09-02: "add more than one quick tab … rename the tabs … re
 * arrange the tabs", switch by time of day, and copy another cashier's
 * layout. Name and hours here; items are added from the tiles.
 */
export function QuickTabPrompt({ state, canManageShared, loadSources, onResult, onClose }: Props) {
  const editState = state.mode === "edit" ? state : null;
  const editing = editState?.tab ?? null;
  const [name, setName] = useState(editing?.name ?? "");
  const [from, setFrom] = useState(editing?.from ?? "");
  const [to, setTo] = useState(editing?.to ?? "");
  const [scope, setScope] = useState<QuickScope>(state.mode === "new" ? state.scope : state.tab.scope);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [sources, setSources] = useState<PosQuickLayoutSource[] | null>(null);
  const [copying, setCopying] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  // Focus once, on open. The parent hands down a fresh onClose on every
  // render, and re-running this for each one pulled focus back to Name
  // while the cashier was in a time field.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onCloseRef.current(); };
    window.addEventListener("keydown", onKey);
    window.setTimeout(() => nameRef.current?.focus(), 0);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Only a new tab of my own can be replaced by a copy of somebody else's.
  const canCopy = state.mode === "new" && scope === "mine" && !!loadSources;
  useEffect(() => {
    if (!canCopy) return;
    let alive = true;
    loadSources!().then((list) => { if (alive) setSources(list); }).catch(() => { if (alive) setSources([]); });
    return () => { alive = false; };
  }, [canCopy, loadSources]);

  const hoursValid = (from === "" && to === "") || (from !== "" && to !== "");
  const canSave = name.trim() !== "" && hoursValid;
  const hours = { from: from || null, to: to || null };

  return (
    <>
      <div
        onClick={onClose}
        style={{ position: "fixed", inset: 0, zIndex: z.drawerBackdrop, background: "rgba(15,23,42,0.55)" }}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={editing ? `Quick tab: ${editing.name}` : "New Quick tab"}
        data-testid="quick-tab-prompt"
        style={{
          position: "fixed", zIndex: z.drawerPanel,
          left: "50%", top: "50%", transform: "translate(-50%, -50%)",
          width: "min(400px, calc(100vw - 40px))",
          maxHeight: "min(85dvh, 680px)", overflowY: "auto",
          background: "#fff", borderRadius: 16, padding: 18,
          boxShadow: "0 20px 60px rgba(15,23,42,0.28)",
        }}
      >
        <p style={{ margin: "0 0 12px", fontWeight: 800, fontSize: 16, color: "#0F172A" }}>
          {editing ? "Quick tab" : "New Quick tab"}
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <label style={label} htmlFor="quick-tab-name">Name</label>
            <input
              id="quick-tab-name"
              ref={nameRef}
              value={name}
              maxLength={24}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Morning, Tea time, Regulars"
              style={field}
            />
          </div>

          <div>
            <span style={label}>Opens itself between (optional)</span>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input aria-label="From" type="time" value={from} onChange={(e) => setFrom(e.target.value)} style={{ ...field, flex: 1 }} />
              <span style={{ color: "#64748B" }}>to</span>
              <input aria-label="To" type="time" value={to} onChange={(e) => setTo(e.target.value)} style={{ ...field, flex: 1 }} />
            </div>
            <p style={{ margin: "6px 0 0", fontSize: 12, color: "#64748B", lineHeight: 1.4 }}>
              {!hoursValid
                ? "Set both times, or clear both."
                : from !== "" && from === to
                  ? "Same start and end means all day: the till opens this tab whenever the ticket is empty."
                  : "The till switches to this tab when its hours start, once the ticket is empty. Leave blank for a tab you open by hand."}
            </p>
          </div>

          {state.mode === "new" && canManageShared && (
            <div>
              <span style={label}>Who is it for</span>
              <div style={{ display: "flex", gap: 8 }}>
                {(["mine", "shared"] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    aria-pressed={scope === s}
                    onClick={() => setScope(s)}
                    style={{ ...button(scope === s ? "primary" : "plain"), flex: 1, textAlign: "center" }}
                  >
                    {s === "mine" ? "Just me" : "Everyone (shared)"}
                  </button>
                ))}
              </div>
            </div>
          )}

          {editing ? (
            <>
              <button type="button" disabled={!canSave} onClick={() => onResult({ kind: "save", name: name.trim(), ...hours })} style={{ ...button("primary"), opacity: canSave ? 1 : 0.5 }}>
                Save
              </button>
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" disabled={editState!.index === 0} onClick={() => onResult({ kind: "move", delta: -1 })} style={{ ...button("plain"), flex: 1, opacity: editState!.index === 0 ? 0.4 : 1 }}>
                  ◀ Move left
                </button>
                <button type="button" disabled={editState!.index >= editState!.count - 1} onClick={() => onResult({ kind: "move", delta: 1 })} style={{ ...button("plain"), flex: 1, textAlign: "right", opacity: editState!.index >= editState!.count - 1 ? 0.4 : 1 }}>
                  Move right ▶
                </button>
              </div>
              {confirmDelete ? (
                <button type="button" onClick={() => onResult({ kind: "delete" })} style={button("danger")}>
                  Yes, delete “{editing.name}” and its {editing.items.length} item{editing.items.length === 1 ? "" : "s"}
                </button>
              ) : (
                <button type="button" onClick={() => setConfirmDelete(true)} style={button("danger")}>
                  Delete this tab
                </button>
              )}
            </>
          ) : (
            <>
              <button type="button" disabled={!canSave} onClick={() => onResult({ kind: "create", scope, name: name.trim(), ...hours })} style={{ ...button("primary"), opacity: canSave ? 1 : 0.5 }}>
                Create tab
              </button>
              {canCopy && sources && sources.length > 0 && (
                <div data-testid="quick-tab-copy">
                  <span style={label}>Or start from another cashier’s tabs</span>
                  <p style={{ margin: "0 0 8px", fontSize: 12, color: "#64748B", lineHeight: 1.4 }}>
                    Takes a copy of all their tabs as your own. It replaces any tabs you have now.
                  </p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {sources.map((s) => (
                      <button
                        key={s.user_id}
                        type="button"
                        disabled={copying}
                        onClick={() => { setCopying(true); onResult({ kind: "copy", fromUserId: s.user_id }); }}
                        style={{ ...button("plain"), display: "flex", justifyContent: "space-between" }}
                      >
                        <span>Copy {s.name}’s tabs</span>
                        <span style={{ color: "#64748B", fontWeight: 600 }}>{s.tabs} tab{s.tabs === 1 ? "" : "s"}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          <button type="button" onClick={onClose} style={{ ...button("plain"), background: "#fff", border: "none", color: "#64748B", textAlign: "center" }}>
            Cancel
          </button>
        </div>
      </div>
    </>
  );
}
