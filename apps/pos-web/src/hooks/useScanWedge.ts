import { useEffect, useRef } from "react";

/**
 * Hear a barcode gun wherever focus is.
 *
 * A USB or Bluetooth scanner types like a keyboard: the whole code in a
 * burst, a few milliseconds a character, then Enter. A person cannot type
 * that fast, so a run of quick keystrokes ending in Enter is a scan. Inside
 * a text field the field gets the keystrokes as before (the menu search
 * already handles a gun there); this listens everywhere else, so a cashier
 * with the ticket open can scan a gift card without first tapping a box.
 */
export function useScanWedge(
  onScan: (code: string) => void,
  { enabled = true, maxGapMs = 60, minLength = 4 }: { enabled?: boolean; maxGapMs?: number; minLength?: number } = {},
) {
  const buffer = useRef("");
  const lastAt = useRef(0);
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select" || t?.isContentEditable) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const now = Date.now();
      if (now - lastAt.current > maxGapMs) buffer.current = "";
      lastAt.current = now;

      if (e.key === "Enter") {
        const code = buffer.current;
        buffer.current = "";
        if (code.length >= minLength) {
          e.preventDefault();
          onScanRef.current(code);
        }
        return;
      }
      if (e.key.length === 1) buffer.current += e.key;
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled, maxGapMs, minLength]);
}
