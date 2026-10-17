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
 *
 * Owner, 2026-10-17: "update now does not go." The button used to delete every
 * cache and then navigate to /admin/ while the old service worker was still in
 * charge of that address. With its precache gone, that worker failed the
 * navigation and the page stayed put (or came straight back on the old bundle).
 * A waiting worker has to be told to take over first. If none is waiting, the
 * tab has to leave /admin/ — the worker's scope — so the next document is the
 * server's, not the worker's.
 */

const SKIP_WAITING = { type: 'SKIP_WAITING' } as const;

function leaveFor(url: string): void {
  if (typeof window.location.replace === 'function') {
    window.location.replace(url);
    return;
  }
  window.location.href = url;
}

function waitForControllerChange(timeoutMs: number): Promise<boolean> {
  if (!('serviceWorker' in navigator)) return Promise.resolve(false);
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => resolve(false), timeoutMs);
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      window.clearTimeout(timer);
      resolve(true);
    }, { once: true });
  });
}

/** The worker Workbox has installed but not yet put in charge. */
async function stagedWorker(reg: ServiceWorkerRegistration): Promise<ServiceWorker | null> {
  if (reg.waiting) return reg.waiting;
  const installing = reg.installing;
  if (!installing) return null;
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => resolve(reg.waiting), 2500);
    installing.addEventListener('statechange', () => {
      if (installing.state === 'installed' || installing.state === 'redundant') {
        window.clearTimeout(timer);
        resolve(reg.waiting);
      }
    });
  });
}

/**
 * Tell the staged admin worker to become the one in charge.
 * Returns true once this tab hears that happen.
 */
async function activateStagedAdminWorker(): Promise<boolean> {
  if (!('serviceWorker' in navigator) || typeof navigator.serviceWorker.getRegistration !== 'function') {
    return false;
  }
  const reg = await navigator.serviceWorker.getRegistration('/admin/');
  if (!reg) return false;

  let worker = await stagedWorker(reg);
  if (!worker) {
    try {
      await reg.update();
    } catch {
      // Offline, or the browser refused the check. Fall through.
    }
    worker = reg.waiting ?? await stagedWorker(reg);
  }
  if (!worker) return false;

  const changed = waitForControllerChange(2500);
  worker.postMessage(SKIP_WAITING);
  return changed;
}

export async function purgeAdminCachesAndReload(): Promise<void> {
  const origin = window.location.origin;
  // Outside the service worker scope (/admin/), so the worker still controlling
  // this tab cannot answer it. The route redirects straight back into /admin/.
  const bounce = `${origin}/admin-reload`;
  const home = `${origin}/admin/?_u=${Date.now().toString(36)}`;
  let target = bounce;

  // Longer than the waits inside activateStagedAdminWorker. If those hang,
  // this still leaves the scope instead of reloading /admin/ under the old worker.
  const safetyTimer = window.setTimeout(() => leaveFor(target), 8000);

  try {
    const activated = await activateStagedAdminWorker();
    if (activated) {
      // The new worker is in charge. Its precache is the new app — do not
      // delete it, and do not unregister it.
      target = home;
      return;
    }

    const regs = ('serviceWorker' in navigator && typeof navigator.serviceWorker.getRegistrations === 'function')
      ? await navigator.serviceWorker.getRegistrations()
      : [];
    if (regs.length === 0) {
      // Nothing is holding the old shell. A reload of /admin/ is the new page.
      // (Dev has no service worker; bouncing to /admin-reload would leave the app.)
      target = home;
      return;
    }
    await Promise.all(regs.map((reg) => reg.unregister()));
    target = bounce;
  } catch {
    // Still leave — a fresh page is better than a stuck old bundle.
    target = bounce;
  } finally {
    window.clearTimeout(safetyTimer);
    leaveFor(target);
  }
}

/** Reload onto the build already installed. */
export function softReloadAdmin(): void {
  window.location.href = `${window.location.origin}/admin/`;
}
