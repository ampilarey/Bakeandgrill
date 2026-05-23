/**
 * Force the iPad/Android standalone POS to load the latest deploy from the
 * network. Workbox precache otherwise keeps serving old index.html + JS
 * even after location.assign().
 *
 * Does NOT touch localStorage (pos_token, preferences, etc.) or IndexedDB
 * (offline orders / menu cache) — unsynced sales must survive SW updates.
 */
export async function purgePosCachesAndReload(): Promise<void> {
  const navigate = () => {
    const url = `${window.location.origin}/pos/?_u=${Date.now().toString(36)}`;
    window.location.href = url;
  };

  const safetyTimer = window.setTimeout(navigate, 2500);

  try {
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
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
