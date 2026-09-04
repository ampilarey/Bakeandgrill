import { useEffect } from "react";

/**
 * Bug-035: trap Tab focus inside an open dialog.
 *
 * Cashiers on the POS rarely use a keyboard, but accessibility
 * tools (VoiceOver / Talkback / a manager auditing the kitchen
 * tablet with a Bluetooth keyboard) expect Tab to cycle inside
 * the modal instead of escaping into the (visually hidden) sales
 * UI behind. Without the trap, Tab could land on a hidden
 * "Charge" button in the background and trigger payment for the
 * underlying ticket while a confirm dialog is open — a Loyverse
 * has had a CVE for exactly this scenario.
 *
 * Usage:
 *   const ref = useRef<HTMLDivElement>(null);
 *   useFocusTrap(ref, active, onEscape);
 *   return <div ref={ref}>…modal markup…</div>;
 *
 * - `active` toggles the trap on/off. Pass `true` when the
 *   modal is mounted; we still clean up on unmount.
 * - `onEscape` is invoked when the user hits Esc. Keep your own
 *   Escape handler if you have other cleanup; this is only the
 *   focus-trap's own Escape signal.
 * - On mount the first focusable element gets focus. On unmount
 *   focus is restored to whatever was focused before the modal
 *   opened.
 */
export function useFocusTrap(
  ref: React.RefObject<HTMLElement | null>,
  active: boolean,
  onEscape?: () => void,
) {
  useEffect(() => {
    if (!active) return;
    const root = ref.current;
    if (!root) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;

    const focusable = (): HTMLElement[] => {
      const sel =
        'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
      return Array.from(root.querySelectorAll<HTMLElement>(sel)).filter(
        (el) => el.offsetWidth > 0 || el.offsetHeight > 0 || el === document.activeElement,
      );
    };

    // Initial focus on the first focusable element. If a child
    // already auto-focused itself (autoFocus prop), leave it
    // alone — overriding fights the React render.
    //
    // Except a text field on a touch screen. iOS answers a programmatic
    // focus() on an input inside a fixed dialog by scrolling the visual
    // viewport to bring it into view — with no keyboard coming, since the
    // POS fields are inputmode="none" — and the dialog is then painted
    // against one viewport and hit-tested against the other until the
    // cashier scrolls by hand. A keyboard user on a tablet loses nothing:
    // the first Tab still lands inside the dialog, because the trap below
    // wraps Tab from "nothing focused" onto the first item.
    if (!root.contains(document.activeElement)) {
      const first = focusable()[0];
      const isField = first instanceof HTMLInputElement
        || first instanceof HTMLTextAreaElement
        || first instanceof HTMLSelectElement;
      const touch = typeof window.matchMedia === "function"
        && window.matchMedia("(pointer: coarse)").matches;
      if (first && !(isField && touch)) first.focus();
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && onEscape) {
        e.preventDefault();
        onEscape();
        return;
      }
      if (e.key !== "Tab") return;
      const items = focusable();
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const idx = items.indexOf(document.activeElement as HTMLElement);
      if (e.shiftKey) {
        if (idx <= 0) {
          e.preventDefault();
          items[items.length - 1].focus();
        }
      } else {
        if (idx === items.length - 1 || idx === -1) {
          e.preventDefault();
          items[0].focus();
        }
      }
    };

    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      // Restore focus to whatever was focused before — typical
      // pattern is the button that opened the modal.
      previouslyFocused?.focus?.();
    };
  }, [ref, active, onEscape]);
}
