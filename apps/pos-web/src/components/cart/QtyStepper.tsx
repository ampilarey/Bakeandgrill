import { useCallback, useEffect, useRef } from "react";
import { palette } from "../../theme";

/**
 * The quantity control on a ticket line: one segmented pill, `[ − | 2 | + ]`.
 *
 * Owner, 2026-09-02: the old loose 26px buttons were "small and difficult
 * to use". Three rules shape the replacement:
 *
 *  - **Every part of the pill is a target.** The buttons fill the pill to its
 *    edges and the pill is sized by CSS (`.pos-qty-stepper`, 36px on a
 *    tablet, 44px on a phone) so the media query really applies. The old
 *    inline width beat the CSS class, which is why the phone rule never did.
 *  - **Hold to keep going.** Pressing and holding + or − repeats after half
 *    a second, so six of something is one press, not six taps. A hold never
 *    removes the line: − stops at 1, and only a deliberate tap takes it to 0.
 *  - **A tap on the pill is not a tap on the row.** The row itself adds one
 *    when tapped, so the buttons stop the click before it reaches the row.
 */
const HOLD_DELAY_MS = 500;
const HOLD_REPEAT_MS = 140;

export function QtyStepper({
  quantity,
  onDelta,
  disabled = false,
  disabledTitle,
  itemName,
}: {
  quantity: number;
  /** Called with +1 or −1 for each step. */
  onDelta: (delta: 1 | -1) => void;
  disabled?: boolean;
  disabledTitle?: string;
  /** For the accessible names: "Add one more Masroshi". */
  itemName?: string;
}) {
  const qtyRef = useRef(quantity);
  qtyRef.current = quantity;
  const onDeltaRef = useRef(onDelta);
  onDeltaRef.current = onDelta;

  const timer = useRef<number | null>(null);
  const interval = useRef<number | null>(null);
  const held = useRef(false);

  const stop = useCallback(() => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    if (interval.current !== null) window.clearInterval(interval.current);
    timer.current = null;
    interval.current = null;
  }, []);
  useEffect(() => stop, [stop]);

  const start = (delta: 1 | -1) => (e: React.PointerEvent) => {
    if (disabled) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    held.current = false;
    stop();
    timer.current = window.setTimeout(() => {
      timer.current = null;
      held.current = true;
      const step = () => {
        // A hold walks down to 1 and no further; taking the line off the
        // ticket has to be a deliberate tap.
        if (delta === -1 && qtyRef.current <= 1) {
          stop();
          return;
        }
        onDeltaRef.current(delta);
      };
      step();
      interval.current = window.setInterval(step, HOLD_REPEAT_MS);
    }, HOLD_DELAY_MS);
  };

  const tap = (delta: 1 | -1) => (e: React.MouseEvent) => {
    e.stopPropagation();
    if (disabled) return;
    // The click that lands when a hold is released is not another step.
    if (held.current) {
      held.current = false;
      return;
    }
    onDelta(delta);
  };

  const suffix = itemName ? ` ${itemName}` : "";
  const holdHandlers = (delta: 1 | -1) => ({
    onPointerDown: start(delta),
    onPointerUp: stop,
    onPointerLeave: stop,
    onPointerCancel: stop,
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  });

  // Colour says what each end does before it is pressed: + is the brand
  // orange (the "add" colour everywhere else on the till), − is quiet grey
  // until the line is at 1, when it turns red because the next tap removes
  // the line. The number sits on a soft orange field between them.
  const removes = quantity <= 1;

  return (
    <div
      className="pos-qty-stepper"
      role="group"
      aria-label="Quantity"
      onClick={(e) => e.stopPropagation()}
      style={{
        display: "inline-flex", alignItems: "stretch", flexShrink: 0,
        borderRadius: 10, border: `1px solid ${palette.primaryLight}`,
        background: palette.panel, overflow: "hidden",
        opacity: disabled ? 0.4 : 1,
      }}
    >
      <button
        type="button"
        aria-label={`Decrease quantity${suffix}`}
        title={disabled ? disabledTitle : removes ? "Remove from ticket" : "Hold to keep going"}
        disabled={disabled}
        onClick={tap(-1)}
        {...holdHandlers(-1)}
        style={btnStyle(disabled, removes
          ? { background: palette.dangerBg, color: palette.danger }
          : { background: palette.panel, color: palette.panelMuted })}
      >
        −
      </button>
      <span
        key={quantity}
        className="pos-qty-stepper-value"
        aria-live="polite"
        style={{
          display: "flex", alignItems: "center", justifyContent: "center",
          minWidth: 28, padding: "0 2px",
          fontSize: 13, fontWeight: 800, color: palette.primaryDark,
          fontVariantNumeric: "tabular-nums",
          background: palette.primaryBg,
        }}
      >
        {quantity}
      </span>
      <button
        type="button"
        aria-label={`Increase quantity${suffix}`}
        title={disabled ? disabledTitle : "Hold to keep going"}
        disabled={disabled}
        onClick={tap(1)}
        {...holdHandlers(1)}
        style={btnStyle(disabled, { background: palette.primary, color: "#FFFFFF" })}
      >
        +
      </button>
    </div>
  );
}

function btnStyle(disabled: boolean, tone: { background: string; color: string }): React.CSSProperties {
  return {
    border: "none", padding: 0, margin: 0,
    background: tone.background, color: tone.color,
    fontSize: 17, fontWeight: 700, lineHeight: 1,
    cursor: disabled ? "not-allowed" : "pointer",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontFamily: "inherit",
    WebkitTapHighlightColor: "transparent",
    touchAction: "manipulation",
  };
}
