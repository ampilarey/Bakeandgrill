/**
 * Force the iPad/Android standalone POS to load the latest deploy from the
 * network. Workbox precache otherwise keeps serving old index.html + JS
 * even after location.assign().
 *
 * Does NOT touch localStorage (pos_token, preferences, etc.) or IndexedDB
 * (offline orders / menu cache) — unsynced sales must survive SW updates.
 */

/**
 * Caches worth keeping across an update.
 *
 * Owner, 2026-09-04: "after each time when I update **or when I click update
 * app even though there is no new update** … get stuck for about 30 seconds".
 *
 * This function used to delete every cache there was. That includes
 * `pos-media-v1`, which holds the owner-uploaded note photos — the very thing
 * whose cold fetch makes the first Charge slow. So each tap of Update threw
 * away the bundle AND the photos and pulled all of it down again over the
 * phone connection, which is the thirty seconds.
 *
 * The media cache is content-addressed by filename and expires on its own, so
 * a new deploy has no reason to drop it. Keep it.
 */
const KEEP_CACHE = /^pos-media/;

export async function purgePosCachesAndReload(): Promise<void> {
  const navigate = () => {
    const url = `${window.location.origin}/pos/?_u=${Date.now().toString(36)}`;
    window.location.href = url;
  };

  const safetyTimer = window.setTimeout(navigate, 2500);

  try {
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((key) => !KEEP_CACHE.test(key)).map((key) => caches.delete(key)),
      );
    }

    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((reg) => reg.unregister()));
    }
  } catch {
    // Still navigate — getting offline is better than a stuck old bundle.
  } finally {
    window.clearTimeout(safetyTimer);
    navigate();
  }
}

/**
 * Reload onto the build that is already installed.
 *
 * When the till is on the current build there is nothing to fetch, so tearing
 * down the caches and the service worker only guarantees a cold start. This
 * just reloads — the service worker serves the bundle it already has, and the
 * till is usable immediately.
 */
export function softReloadPos(): void {
  window.location.href = `${window.location.origin}/pos/`;
}
