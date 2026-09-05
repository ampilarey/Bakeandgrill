/*
 * Bake & Grill — one tap that throws away this device's saved copy of the app.
 *
 * Owner, 2026-09-05: an item added in the afternoon was still missing from the
 * order app that evening, on a device where the API, the deployed bundle and a
 * clean browser all had it. There was no way for anyone — the owner or me — to
 * clear that device's copy or even to see which build it was running, so the
 * same report came back three times.
 *
 * Open /order/reset (or add ?fresh=1 to any order-app URL) and this unregisters
 * every service worker, deletes every cache, and reloads clean. It then shows
 * the build it landed on, so a device that is still wrong can be reported as a
 * build rather than as "still same".
 *
 * This is an external file on purpose: the page's Content-Security-Policy
 * allows `script-src 'self'` and no inline script, so anything written inline
 * in index.html is silently refused.
 */
(function () {
  var BUILD = '__SW_BUILD_ID__';
  var loc = window.location;
  var path = String(loc.pathname || '').replace(/\/+$/, '');
  var wanted = path === '/order/reset' || /[?&]fresh=1(&|$)/.test(loc.search || '');
  if (!wanted) return;

  /*
   * An overlay rather than a rewrite of the document: replacing <body> takes
   * #root with it and the app then throws on mount, and two paints racing to
   * assign innerHTML can land in either order. This keeps one element, always
   * showing whatever was asked for last, whenever the body turns up.
   */
  var pending = null;
  var overlay = null;
  var waiting = false;

  function paint() {
    if (!document.body) return;
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.setAttribute('style', 'position:fixed;inset:0;z-index:2147483647;overflow:auto;'
        + 'background:#f8f6f3;color:#1c1408;padding:2rem;text-align:center;'
        + 'font:16px/1.5 system-ui,-apple-system,sans-serif');
      document.body.appendChild(overlay);
    }
    overlay.innerHTML = pending;
  }

  function show(html) {
    pending = html;
    if (document.body) { paint(); return; }
    if (waiting) return;
    waiting = true;
    document.addEventListener('DOMContentLoaded', paint);
  }

  show('<p>Clearing this device&rsquo;s saved copy of the menu&hellip;</p>');

  function unregisterWorkers() {
    if (!('serviceWorker' in navigator)) return Promise.resolve();
    return navigator.serviceWorker.getRegistrations().then(function (regs) {
      return Promise.all(regs.map(function (r) { return r.unregister(); }));
    });
  }

  function deleteCaches() {
    if (typeof caches === 'undefined' || !caches.keys) return Promise.resolve();
    return caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) { return caches.delete(k); }));
    });
  }

  function finish() {
    /*
     * Deliberately not a redirect. A device that is still wrong after this has
     * a build number worth reporting, and an automatic bounce back to the menu
     * would hide it. The link is a normal navigation, so it refetches.
     */
    show(
      '<p style="font-size:1.1rem;font-weight:600">Cleared.</p>'
      + '<p style="color:#6b5d4f">Build <code>' + BUILD + '</code></p>'
      + '<p style="margin-top:1.5rem"><a href="/order/menu" style="display:inline-block;'
      + 'background:#d4813a;color:#fff;text-decoration:none;padding:.75rem 1.5rem;'
      + 'border-radius:8px;font-weight:600">Open the menu</a></p>'
      + '<p style="color:#9c8e7e;font-size:.875rem;margin-top:2rem">If the menu is still '
      + 'missing something after this, the build number above is what to report.</p>',
    );
  }

  // Clearing is best-effort: a browser that refuses one step should still land
  // the customer somewhere usable rather than on a spinner.
  unregisterWorkers()
    .catch(function () { /* nothing to unregister, or blocked */ })
    .then(deleteCaches)
    .catch(function () { /* storage may be denied in private mode */ })
    .then(finish, finish);
})();
