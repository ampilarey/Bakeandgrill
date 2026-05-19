import { useEffect, useState } from "react";
import {
  palette, radius, shadow, space, type, z,
  btnPrimary, btnSecondary,
} from "../theme";

type Props = {
  /** Owner-curated chip library from `pos_quick_notes` site setting. */
  options: string[];
  /** Notes already attached to this cart line. Pre-selected when the
   *  picker opens so re-opening it doesn't drop existing selections. */
  initialSelected: string[];
  /** Optional context line (e.g. item name + variant) so the cashier
   *  knows WHICH line they're annotating. */
  itemLabel?: string;
  onCancel: () => void;
  /** Commit the picker's selection back to the cart line. Empty array
   *  is valid — that clears all notes on the line. */
  onSave: (selected: string[]) => void;
};

/**
 * Chip-only kitchen note picker. Tap-driven so no soft keyboard is
 * required (the audit found that on iPad the existing free-text
 * special-instruction flow was unusable in PWA fullscreen).
 *
 * Multi-select: cashier can tap several chips ("No salt" + "Well done")
 * and they all attach to the cart line. Re-opening the picker shows
 * the current selection so tapping a chip again deselects it.
 */
export function NotePickerModal({ options, initialSelected, itemLabel, onCancel, onSave }: Props) {
  const [selected, setSelected] = useState<string[]>(initialSelected);

  // Esc to cancel, Enter to save — matches the rest of the POS modals.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
      else if (e.key === "Enter") onSave(selected);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel, onSave, selected]);

  const toggle = (note: string) => {
    setSelected((curr) =>
      curr.includes(note) ? curr.filter((n) => n !== note) : [...curr, note],
    );
  };

  const clear = () => setSelected([]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Add kitchen note"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15, 23, 42, 0.45)",
        zIndex: z.modalBackdrop,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: space.l,
        animation: "pos-fade-in 120ms ease",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(480px, 100%)",
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          background: palette.panel,
          borderRadius: radius.xl,
          boxShadow: shadow.xl,
          overflow: "hidden",
          animation: "pos-scale-in 140ms ease",
        }}
      >
        {/* Header */}
        <div style={{
          padding: `${space.l}px ${space.xl}px`,
          borderBottom: `1px solid ${palette.border}`,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: space.m,
        }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ ...type.subtitle, color: palette.panelInk }}>Kitchen note</div>
            {itemLabel ? (
              <div style={{
                ...type.bodySm,
                color: palette.panelMuted,
                marginTop: 2,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}>
                {itemLabel}
              </div>
            ) : (
              <div style={{ ...type.bodySm, color: palette.panelMuted, marginTop: 2 }}>
                Tap to add. Notes print on the kitchen ticket.
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Close"
            style={{
              background: "none",
              border: "none",
              fontSize: 24,
              cursor: "pointer",
              color: palette.panelMuted,
              padding: space.xxs,
              lineHeight: 1,
              minHeight: 32,
              minWidth: 32,
            }}
          >
            ×
          </button>
        </div>

        {/* Chip grid */}
        <div style={{ padding: space.xl, overflow: "auto", flex: 1 }}>
          {options.length === 0 ? (
            <div style={{
              ...type.bodySm,
              color: palette.panelMuted,
              textAlign: "center",
              padding: `${space.xl}px ${space.m}px`,
            }}>
              No quick notes set up yet. Ask the owner to add some in
              Admin → Settings → Website Settings → POS — Quick Notes.
            </div>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: space.s }}>
              {options.map((note) => {
                const active = selected.includes(note);
                return (
                  <button
                    key={note}
                    type="button"
                    onClick={() => toggle(note)}
                    aria-pressed={active}
                    style={{
                      padding: `${space.s + 2}px ${space.l}px`,
                      borderRadius: radius.pill,
                      border: `2px solid ${active ? palette.primary : palette.border}`,
                      background: active ? palette.primary : palette.panel,
                      color: active ? "#FFFFFF" : palette.panelInk,
                      fontSize: type.body.fontSize,
                      fontWeight: 700,
                      cursor: "pointer",
                      minHeight: 44,
                      transition: "background 0.12s, transform 60ms ease",
                      boxShadow: active ? "0 2px 8px rgba(212,129,58,0.25)" : "none",
                    }}
                    onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.97)")}
                    onMouseUp={(e) => (e.currentTarget.style.transform = "")}
                    onMouseLeave={(e) => (e.currentTarget.style.transform = "")}
                  >
                    {active && <span style={{ marginRight: 6 }}>✓</span>}
                    {note}
                  </button>
                );
              })}
            </div>
          )}

          {selected.length > 0 && (
            <button
              type="button"
              onClick={clear}
              style={{
                marginTop: space.l,
                background: "none",
                border: "none",
                color: palette.panelMuted,
                fontSize: type.bodySm.fontSize,
                fontWeight: 600,
                cursor: "pointer",
                textDecoration: "underline",
                padding: space.xxs,
              }}
            >
              Clear all
            </button>
          )}
        </div>

        {/* Footer actions */}
        <div style={{
          padding: space.l,
          borderTop: `1px solid ${palette.border}`,
          display: "flex",
          gap: space.s,
        }}>
          <button type="button" onClick={onCancel} style={{ ...btnSecondary(), flex: 1 }}>
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onSave(selected)}
            style={{ ...btnPrimary(), flex: 2 }}
          >
            {selected.length > 0
              ? `Save ${selected.length} note${selected.length > 1 ? "s" : ""}`
              : "Save (no notes)"}
          </button>
        </div>
      </div>
    </div>
  );
}
