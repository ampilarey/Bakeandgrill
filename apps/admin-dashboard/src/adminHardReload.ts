/**
 * Get a phone's home-screen admin onto the latest deploy.
 *
 * Workbox precache otherwise keeps serving the old shell and JS even after a
 * plain reload. Same two moves the POS makes: a purge-and-reload when there is
 * genuinely something newer, a plain reload when there is not — tearing the
 * caches down on an up-to-date app only buys a cold start.
 *
 * Neither touches localStorage (token, theme, sidebar state) — signing the
 * owner out is not part of updating.
 */

export async function purgeAdminCachesAndReload(): Promise<void> {
  const navigate = () => {
    window.location.href = `${window.location.origin}/admin/?_u=${Date.now().toString(36)}`;
  };

  const safetyTimer = window.setTimeout(navigate, 2500);

  try {
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    }
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((reg) => reg.unregister()));
    }
  } catch {
    // Still navigate — a fresh page is better than a stuck old bundle.
  } finally {
    window.clearTimeout(safetyTimer);
    navigate();
  }
}

/** Reload onto the build already installed. */
export function softReloadAdmin(): void {
  window.location.href = `${window.location.origin}/admin/`;
}
