import { useEffect, useRef } from "react";
import { z } from "../theme";

export type ShortcutPromptState =
  | { kind: "add"; id: string; label: string; icon: string }
  | { kind: "remove"; id: string; label: string; icon: string }
  | { kind: "full"; id: string; label: string; icon: string };

/**
 * The little sheet a press-and-hold raises.
 *
 * Deliberately a confirm rather than a silent toggle. A hold is easy to do by
 * accident on a busy till — a thumb resting on a menu row while reading it —
 * and a header that rearranges itself under your hand with no explanation is
 * how a cashier stops trusting the screen.
 */
export function ShortcutPrompt({
  state, onConfirm, onClose, max,
}: {
  state: ShortcutPromptState;
  onConfirm: () => void;
  onClose: () => void;
  max: number;
}) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    window.setTimeout(() => confirmRef.current?.focus(), 0);

    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const copy = {
    add: {
      title: `Add ${state.label} to the header?`,
      body: "It sits next to the page title, one tap from anywhere. Press and hold it there to take it off again.",
      cta: "Add shortcut",
    },
    remove: {
      title: `Remove ${state.label} from the header?`,
      body: "It stays in the menu — this only takes it out of the top bar.",
      cta: "Remove",
    },
    full: {
      title: "The header is full",
      body: `There is room for ${max} shortcuts. Press and hold one in the header to make space.`,
      cta: "",
    },
  }[state.kind];

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
        aria-label={copy.title}
        data-testid="shortcut-prompt"
        style={{
          position: "fixed", zIndex: z.drawerPanel,
          left: "50%", top: "50%", transform: "translate(-50%, -50%)",
          width: "min(340px, calc(100vw - 40px))",
          background: "#fff", borderRadius: 16, padding: 20,
          boxShadow: "0 20px 60px rgba(15,23,42,0.28)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
          <span aria-hidden="true" style={{ fontSize: 26 }}>{state.icon}</span>
          <p style={{ margin: 0, fontWeight: 800, fontSize: 16, color: "#0F172A" }}>{copy.title}</p>
        </div>
        <p style={{ margin: "0 0 18px", fontSize: 13, lineHeight: 1.5, color: "#475569" }}>
          {copy.body}
        </p>
        <div style={{ display: "flex", gap: 10 }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              flex: 1, minHeight: 44, borderRadius: 10, fontWeight: 700, fontSize: 14,
              background: "#fff", border: "1px solid #CBD5E1", color: "#475569", cursor: "pointer",
            }}
          >
            {state.kind === "full" ? "Close" : "Cancel"}
          </button>
          {state.kind !== "full" && (
            <button
              ref={confirmRef}
              type="button"
              data-testid="shortcut-prompt-confirm"
              onClick={onConfirm}
              style={{
                flex: 1, minHeight: 44, borderRadius: 10, fontWeight: 800, fontSize: 14,
                background: state.kind === "remove" ? "#B91C1C" : "#0F172A",
                border: "none", color: "#fff", cursor: "pointer",
              }}
            >
              {copy.cta}
            </button>
          )}
        </div>
      </div>
    </>
  );
}
