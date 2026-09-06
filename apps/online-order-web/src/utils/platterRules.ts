/**
 * Platter picker helpers for the online order app.
 *
 * The rules themselves live in `@shared/utils` — the POS picker uses the same
 * ones, and two copies would eventually disagree. Only the tomorrow-mode
 * availability question is the order app's own.
 */
import { isItemOrderableForDay } from './itemAvailability';

export {
  resolveGroupCounts,
  countSelectionsForGroup,
  surchargeTotal,
  remainingPicksNeeded,
  platterPickHint,
  isPlatterSelectionValid,
  platterSelectionsKey,
  adjustPlatterSelection,
} from '@shared/utils';
export type { PlatterGroupCounts } from '@shared/utils';

export function isPlatterChildSelectable(
  child: {
    is_available?: boolean;
    available_now?: boolean;
    allow_pre_order?: boolean;
    tomorrow_remaining?: number | null;
  } | null | undefined,
  orderDay: 'today' | 'tomorrow',
): boolean {
  if (!child) return false;
  return isItemOrderableForDay(child, orderDay);
}
