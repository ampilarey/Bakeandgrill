/**
 * Register the order app's service worker.
 *
 * Audit, 2026-09-17: this lived as an inline `<script>` at the foot of
 * index.html, and the page's own Content-Security-Policy — `script-src
 * 'self'`, no inline — refused it on every load. Not one customer's browser
 * ever installed the worker: no offline shell, push notifications waiting
 * on a `navigator.serviceWorker.ready` that never resolved, and the whole
 * build-stamp / reset / reload-on-controllerchange machinery idle. The file
 * even explains, two lines above, why `reset.js` had to be external.
 *
 * Same behaviour as the inline script, from inside the bundle where the
 * policy allows it: install, tell a waiting worker to take over, and reload
 * exactly once when the new worker takes control so the fresh asset URLs
 * are picked up.
 */
export function registerServiceWorker(
  sw: ServiceWorkerContainer | undefined = typeof navigator !== 'undefined' ? navigator.serviceWorker : undefined,
): void {
  if (!sw) return;

  const run = async () => {
    try {
      const reg = await sw.register('/order/sw.js', { scope: '/order/' });
      if (reg.waiting) reg.waiting.postMessage('SKIP_WAITING');
      reg.addEventListener('updatefound', () => {
        const installing = reg.installing;
        if (!installing) return;
        installing.addEventListener('statechange', () => {
          if (installing.state === 'installed' && sw.controller) {
            installing.postMessage('SKIP_WAITING');
          }
        });
      });
      let reloaded = false;
      sw.addEventListener('controllerchange', () => {
        if (reloaded) return;
        reloaded = true;
        window.location.reload();
      });
    } catch (e) {
      console.error('SW registration failed', e);
    }
  };

  if (document.readyState === 'complete') void run();
  else window.addEventListener('load', () => void run(), { once: true });
}
