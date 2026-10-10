import type { OrderMode } from '../../context/OrderModeContext';
import { ORDER_MODE_ICONS } from '../../utils/emojiIcon';

type Props = {
  /** Shown once the day and mode bar has scrolled off the top. */
  visible: boolean;
  /** Nothing chosen yet: it asks instead of showing a choice. */
  unset: boolean;
  mode: OrderMode;
  modeLabel: string;
  dayLabel: string;
  chooseLabel: string;
  onOpen: () => void;
};

/**
 * The day and order type, folded into a button at the head of the category
 * rail once the full bar has scrolled away (owner, 2026-10-07: "Minimize not
 * to a strip. But a small button floats on top"). On a phone the bar took a
 * fifth of the screen on every scroll; this keeps the choice in view for the
 * width of the rail. A tap drops the full bar back down over the dishes.
 */
export function RailOrderButton({ visible, unset, mode, modeLabel, dayLabel, chooseLabel, onOpen }: Props) {
  const ModeIcon = ORDER_MODE_ICONS[mode];
  return (
    <button
      type="button"
      className={`rail-order-btn${visible ? ' is-on' : ''}${unset ? ' is-unset' : ''}`}
      data-testid="rail-order-btn"
      aria-hidden={!visible || undefined}
      tabIndex={visible ? 0 : -1}
      aria-label={unset ? `${chooseLabel}, ${dayLabel}` : `${modeLabel}, ${dayLabel}. Change`}
      onClick={onOpen}
    >
      <span className="rail-order-btn__badge" aria-hidden="true">{unset ? '?' : <ModeIcon size={15} strokeWidth={2.2} />}</span>
      <span className="rail-order-btn__mode">{unset ? chooseLabel : modeLabel}</span>
      <span className="rail-order-btn__day">
        {dayLabel}
        <svg viewBox="0 0 12 12" width="8" height="8" aria-hidden="true"><path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </span>
    </button>
  );
}
