import { useEffect, useRef, useState } from "react";

/**
 * Cash entry input with a built-in on-screen decimal numpad.
 *
 * Why: on iPad, `<input inputMode="decimal">` still pops the full
 * alphanumeric soft keyboard (iPad has no numeric-only variant). That
 * keyboard covers half the screen, which is brutal in a modal where
 * the cashier needs to see the running variance update as they type.
 *
 * Solution: suppress the OS keyboard with `inputMode="none"` and
 * provide our own 3×4 numpad with the decimal point. The component
 * also accepts free-text edits from a hardware bluetooth keyboard,
 * and auto-selects on focus so a single tap-and-type overwrites the
 * pre-filled value cleanly.
 */

type Props = {
  value: string;
  onChange: (v: string) => void;
  autoFocus?: boolean;
  placeholder?: string;
  /** Hide the numpad (input becomes display-only — useful when the
   *  value is purely confirmatory and editing is rare). */
  showNumpad?: boolean;
};

const C = {
  text: "#0F172A",
  muted: "#64748B",
  border: "#E2E8F0",
  border2: "#CBD5E1",
  bg: "#F8FAFC",
  primary: "#D4813A",
  danger: "#B91C1C",
};

export function CashInput({
  value, onChange, autoFocus, placeholder = "0.00", showNumpad = true,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  // Validate / sanitize an arbitrary string keypress so the value
  // stays a well-formed decimal: at most one ".", digits only.
  const apply = (next: string) => {
    if (next === "") { onChange(""); return; }
    // Reject anything with more than one decimal point.
    if ((next.match(/\./g) ?? []).length > 1) return;
    // Reject non-numeric except a single leading minus (we don't want
    // negatives here, but keep the regex narrow anyway).
    if (!/^\d*\.?\d{0,2}$/.test(next)) return;
    onChange(next);
  };

  const press = (k: string) => {
    if (k === "back") return onChange(value.slice(0, -1));
    if (k === "clear") return onChange("");
    if (k === ".") {
      if (value.includes(".")) return;
      return onChange(value === "" ? "0." : value + ".");
    }
    // Strip a leading "0" so "07" becomes "7".
    if (value === "0" && k !== ".") return onChange(k);

    const appended = value + k;
    // Pre-filled exact amounts (e.g. "1.08") already use both decimal
    // places — appending another digit silently fails validation and
    // looks like a dead numpad. Treat the next key as a fresh entry,
    // same as selecting-all then typing on a hardware keyboard.
    if (!/^\d*\.?\d{0,2}$/.test(appended)) return onChange(k);

    apply(appended);
  };

  return (
    <div>
      <div style={{ position: "relative" }} onClick={() => inputRef.current?.focus()}>
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => apply(e.target.value)}
          onFocus={(e) => { setFocused(true); e.currentTarget.select(); }}
          onBlur={() => setFocused(false)}
          type="text"
          // inputMode="none" → tell iPad/Android Safari NOT to pop a
          // soft keyboard. Hardware keyboards keep working.
          inputMode="none"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          placeholder={placeholder}
          aria-label="Amount in MVR"
          style={{
            width: "100%", boxSizing: "border-box",
            padding: "14px 16px", borderRadius: 10,
            border: `2px solid ${focused ? C.primary : C.border2}`,
            fontSize: 24, fontWeight: 700,
            textAlign: "right", background: "#fff",
            // Empty value uses muted placeholder color; filled amounts stay dark.
            color: value === "" ? C.muted : C.text,
            outline: "none",
            fontVariantNumeric: "tabular-nums",
            caretColor: "transparent",
            cursor: "pointer",
          }}
        />
        <span
          aria-hidden="true"
          style={{
            position: "absolute", left: 16, top: "50%",
            transform: "translateY(-50%)",
            fontSize: 12, fontWeight: 700, color: C.muted, letterSpacing: "0.06em",
          }}
        >
          MVR
        </span>
      </div>

      {showNumpad && <DecimalNumpad onPress={press} />}
    </div>
  );
}

function DecimalNumpad({ onPress }: { onPress: (k: string) => void }) {
  const keys: Array<{ k: string; label: string; variant?: "muted" | "danger" }> = [
    { k: "1", label: "1" }, { k: "2", label: "2" }, { k: "3", label: "3" },
    { k: "4", label: "4" }, { k: "5", label: "5" }, { k: "6", label: "6" },
    { k: "7", label: "7" }, { k: "8", label: "8" }, { k: "9", label: "9" },
    { k: ".", label: ".", variant: "muted" },
    { k: "0", label: "0" },
    { k: "back", label: "⌫", variant: "danger" },
  ];

  return (
    <div
      className="pos-cash-numpad"
      style={{
        marginTop: 10,
        display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6,
      }}
    >
      {keys.map(({ k, label, variant }) => {
        const isMuted = variant === "muted";
        const isDanger = variant === "danger";
        const bg = isDanger ? "#FEE2E2" : isMuted ? C.bg : "#FFFFFF";
        const fg = isDanger ? C.danger : isMuted ? C.muted : C.text;
        const border = isDanger ? "#FCA5A5" : C.border2;
        return (
          <button
            key={k}
            type="button"
            className="pos-cash-numpad-key"
            onClick={() => onPress(k)}
            aria-label={k === "back" ? "Backspace" : `Digit ${label}`}
            style={{
              padding: "14px 0",
              borderRadius: 10,
              border: `1px solid ${border}`,
              background: bg,
              color: fg,
              fontSize: 20,
              fontWeight: 700,
              cursor: "pointer",
              minHeight: 52,
              fontVariantNumeric: "tabular-nums",
              userSelect: "none",
              touchAction: "manipulation",
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
