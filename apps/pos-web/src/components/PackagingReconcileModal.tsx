import { useMemo, useState } from "react";
import type { PackagingOption } from "../types";
import { palette, radius, shadow, space, type, z, btnPrimary } from "../theme";
import type { PackagingPickerLine } from "../hooks/packagingReconcile";

type Props = {
  lines: PackagingPickerLine[];
  onConfirm: (selections: Record<string, number>) => void;
};

/**
 * Forced packaging picker when switching Dine-in → Takeaway/Pickup/Delivery.
 * No close, cancel, Esc, or backdrop dismiss — Confirm stays disabled until
 * every listed line has an option selected.
 */
export function PackagingReconcileModal({ lines, onConfirm }: Props) {
  const [selections, setSelections] = useState<Record<string, number>>({});

  const allChosen = useMemo(
    () => lines.length > 0 && lines.every((l) => selections[l.lineKey] != null),
    [lines, selections],
  );

  const pick = (lineKey: string, optionId: number) => {
    setSelections((curr) => ({ ...curr, [lineKey]: optionId }));
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Select packaging"
      data-testid="packaging-reconcile-modal"
      // Forced: backdrop clicks do nothing
      onClick={(e) => e.stopPropagation()}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15, 23, 42, 0.55)",
        zIndex: z.modalBackdrop,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: space.l,
      }}
    >
      <div
        data-testid="packaging-reconcile-panel"
        style={{
          width: "min(520px, 100%)",
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          background: palette.panel,
          borderRadius: radius.xl,
          boxShadow: shadow.xl,
          overflow: "hidden",
        }}
      >
        <div style={{ padding: "18px 20px 12px", borderBottom: `1px solid ${palette.border}` }}>
          <div style={{ ...type.title, fontSize: 17, fontWeight: 800, color: palette.panelInk }}>
            Select packaging
          </div>
          <div style={{ marginTop: 6, fontSize: 13, color: palette.panelMuted, lineHeight: 1.4 }}>
            These items need a packaging choice for this order type. Pick one for each line to continue.
          </div>
        </div>

        <div style={{ padding: 16, overflow: "auto", flex: 1, display: "flex", flexDirection: "column", gap: 16 }}>
          {lines.map((line) => (
            <PackagingLineBlock
              key={line.lineKey}
              line={line}
              selectedId={selections[line.lineKey] ?? null}
              onPick={(id) => pick(line.lineKey, id)}
            />
          ))}
        </div>

        <div style={{ padding: 16, borderTop: `1px solid ${palette.border}` }}>
          <button
            type="button"
            data-testid="packaging-reconcile-confirm"
            disabled={!allChosen}
            onClick={() => {
              if (!allChosen) return;
              onConfirm(selections);
            }}
            style={{
              ...btnPrimary(!allChosen),
              width: "100%",
              minHeight: 48,
            }}
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}

function PackagingLineBlock({
  line,
  selectedId,
  onPick,
}: {
  line: PackagingPickerLine;
  selectedId: number | null;
  onPick: (optionId: number) => void;
}) {
  return (
    <div data-testid={`packaging-line-${line.lineKey}`}>
      <div style={{ fontSize: 14, fontWeight: 700, color: palette.panelInk, marginBottom: 8 }}>
        {line.itemName}
        <span style={{ fontWeight: 600, color: palette.panelMuted }}> ×{line.quantity}</span>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))",
          gap: 8,
        }}
      >
        {line.options.map((opt) => (
          <OptionChip
            key={opt.id}
            opt={opt}
            active={selectedId === opt.id}
            onClick={() => onPick(opt.id)}
          />
        ))}
      </div>
    </div>
  );
}

function OptionChip({
  opt,
  active,
  onClick,
}: {
  opt: PackagingOption;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "12px 12px",
        borderRadius: 10,
        border: `2px solid ${active ? palette.panelInk : palette.borderStrong}`,
        background: active ? palette.panelInk : "#FFFFFF",
        color: active ? "#FFFFFF" : palette.panelInk,
        cursor: "pointer",
        textAlign: "left",
        display: "flex",
        flexDirection: "column",
        gap: 4,
        minHeight: 56,
        fontFamily: "inherit",
      }}
    >
      <span style={{ fontSize: 13, fontWeight: 700 }}>{opt.name}</span>
      <span style={{ fontSize: 12, fontWeight: 700, opacity: 0.9, fontVariantNumeric: "tabular-nums" }}>
        {Number(opt.fee) > 0 ? `+MVR ${Number(opt.fee).toFixed(2)}` : "No fee"}
      </span>
    </button>
  );
}
