import type { MenuItem } from '../../api';
import { SALES_CHANNELS } from './menuItemForm';

/**
 * Which channels an item is switched off for, said out loud on the list.
 *
 * Owner, 2026-09-05: "I have 2 item in one category. Blade menu shows it. But
 * order all doesnt show it." The website menu asks only that an item is active
 * and available; the order app additionally needs an enabled row in
 * `item_channel_availability`. So an item can be perfectly alive on the menu
 * list — green "On menu", green "Selling" — and be orderable nowhere, with the
 * switch that did it buried three tabs deep in the editor.
 *
 * Catering is left out on purpose. It is opt-in and off for nearly everything,
 * so counting it would put a warning on every ordinary dish and teach the owner
 * to ignore the warning.
 */
export const ORDERING_CHANNELS = SALES_CHANNELS.filter((c) => c.id !== 'catering');

/**
 * The backend reads a missing row exactly as it reads a disabled one — see
 * `KitchenMenuResolver::isItemVisibleForChannel`, which returns false for
 * `$row === null`. So do we. Showing "on" for a channel with no row would be
 * the same lie in a new place.
 */
export function offOrderingChannels(item: MenuItem): string[] {
  const rows = item.channel_availabilities;
  if (!rows) return [];

  return ORDERING_CHANNELS
    .filter(({ id }) => !rows.some((r) => r.channel === id && r.is_enabled))
    .map(({ label }) => label);
}

export type ChannelWarning = { label: string; title: string; severe: boolean };

/**
 * Null when every ordering channel is on — the ordinary case, which should stay
 * silent rather than decorate all four hundred rows.
 */
export function channelWarning(item: MenuItem): ChannelWarning | null {
  const off = offOrderingChannels(item);
  if (off.length === 0) return null;

  if (off.length === ORDERING_CHANNELS.length) {
    return {
      label: 'Nowhere to order',
      title: 'Switched off for every channel: customers can see it but cannot order it anywhere. '
        + 'Edit the item and tick the channels under "Where can this be ordered?".',
      severe: true,
    };
  }

  return {
    label: `Off: ${off.join(', ')}`,
    title: `Customers can see this but cannot order it for ${off.join(', ')}. `
      + 'Edit the item to change that under "Where can this be ordered?".',
    severe: false,
  };
}
