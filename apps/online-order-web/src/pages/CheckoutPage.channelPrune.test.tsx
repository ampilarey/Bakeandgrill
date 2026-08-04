/**
 * Channel-prune toast wiring — mirrors CheckoutPage effect without full mount.
 */
import { describe, expect, it, vi } from 'vitest';

function toastPruneMessage(
  prune: { count: number; at: number } | null,
  lastAt: number | null,
  t: (key: string) => string,
): { message: string | null; nextAt: number | null } {
  if (!prune || prune.at === lastAt) return { message: null, nextAt: lastAt };
  const pruneKey = prune.count === 1 ? 'menu.toast_prune_one' : 'menu.toast_prune_many';
  return {
    message: t(pruneKey).replace('{n}', String(prune.count)),
    nextAt: prune.at,
  };
}

describe('CheckoutPage channel prune toast', () => {
  it('toasts when lastChannelPrune reports removed items', () => {
    const t = (key: string) => {
      const map: Record<string, string> = {
        'menu.toast_prune_one': '{n} cart item removed for this order mode.',
        'menu.toast_prune_many': '{n} cart items removed for this order mode.',
      };
      return map[key] ?? key;
    };
    const showToast = vi.fn();
    const result = toastPruneMessage({ count: 2, at: 1000 }, null, t);
    if (result.message) showToast(result.message);
    expect(showToast).toHaveBeenCalledWith('2 cart items removed for this order mode.');
    expect(result.nextAt).toBe(1000);
  });

  it('does not re-toast the same prune event', () => {
    const t = (key: string) => key;
    const again = toastPruneMessage({ count: 2, at: 1000 }, 1000, t);
    expect(again.message).toBeNull();
  });
});
