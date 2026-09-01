import { useLongPress } from "../hooks/useLongPress";
import type { Pane } from "../app/types";

export type ShortcutTarget = { id: Pane; label: string; icon: string };

/**
 * Pinned destinations in the top bar.
 *
 * The header carried the title on one side and the status pill on the other,
 * with dead space between — on an iPad, a lot of it. A cashier who lives in
 * Receipts or Active Orders was opening the drawer for every trip. Owner,
 * 2026-09-01.
 *
 * Tap goes there. Press and hold takes it off again — the same gesture that
 * put it there, which is the only thing that makes an invisible affordance
 * learnable: whatever you held to create, you hold to undo.
 */
export function HeaderShortcuts({
  items, active, onSelect, onRequestRemove,
}: {
  items: ShortcutTarget[];
  active: string;
  onSelect: (pane: Pane) => void;
  onRequestRemove: (item: ShortcutTarget) => void;
}) {
  if (items.length === 0) return null;

  return (
    <div className="pos-topbar-shortcuts" role="group" aria-label="Shortcuts">
      {items.map((item) => (
        <ShortcutButton
          key={item.id}
          item={item}
          active={active === item.id}
          onSelect={onSelect}
          onRequestRemove={onRequestRemove}
        />
      ))}
    </div>
  );
}

function ShortcutButton({
  item, active, onSelect, onRequestRemove,
}: {
  item: ShortcutTarget;
  active: boolean;
  onSelect: (pane: Pane) => void;
  onRequestRemove: (item: ShortcutTarget) => void;
}) {
  const { handlers, clickGuard } = useLongPress(() => onRequestRemove(item));

  return (
    <button
      type="button"
      className={`pos-topbar-shortcut${active ? " is-active" : ""}`}
      data-testid={`header-shortcut-${item.id}`}
      // The label carries the gesture, because nothing on screen can: a
      // screen-reader user has no way to discover a press-and-hold.
      aria-label={`${item.label} — press and hold to remove from header`}
      title={item.label}
      onClick={clickGuard(() => onSelect(item.id))}
      {...handlers}
    >
      <span aria-hidden="true" className="pos-topbar-shortcut-icon">{item.icon}</span>
      <span className="pos-topbar-shortcut-label">{item.label}</span>
    </button>
  );
}
