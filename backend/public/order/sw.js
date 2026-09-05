/*
 * Bake & Grill — Service Worker
 *
 * Responsibilities:
 *  1. Offline shell — pre-cache index, manifest, logo, offline fallback
 *  2. Stale-while-revalidate for hashed Vite build assets
 *  3. Network-first w/ cache fallback for the menu API so customers
 *     can still browse the last-seen menu offline
 *  4. Network-only for everything else (POST/PUT/DELETE, auth, etc.)
 *  5. Push notifications (existing behaviour, preserved)
 *
 * Bump CACHE_VERSION whenever the install routine changes so old
 * caches are cleaned up on activation.
 */

/*
 * Replaced at build time with a hash of the emitted bundle (see the
 * stampServiceWorkerVersion plugin in vite.config.ts). It must not go back to
 * a hand-edited constant: a worker whose bytes never change is a worker the
 * browser never replaces, and its caches then outlive every deploy.
 */
const CACHE_VERSION = 'bg-pwa-b88be2e26c35';

/**
 * How old a cached menu response may be and still be served after a failed
 * fetch. Past this, an unreachable network is reported as a failure rather
 * than answered with an old menu — the app can retry and say so, where a menu
 * from hours ago just quietly lies about what is on sale.
 */
const STALE_API_MS = 10 * 60 * 1000;
const CACHED_AT_HEADER = 'x-bg-cached-at';
const STATIC_CACHE  = `${CACHE_VERSION}-static`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;
const API_CACHE     = `${CACHE_VERSION}-api`;

const PRECACHE_URLS = [
    '/order/',
    '/order/index.html',
    '/order/manifest.json',
    '/order/offline.html',
    '/logo.png',
];

// Only cache GET responses for these read-only menu/category endpoints.
const CACHEABLE_API_PATTERNS = [
    /\/api\/categories(\?|$)/,
    /\/api\/items(\?|$)/,
    /\/api\/site-settings\/public(\?|$)/,
    /\/api\/content(\?|$)/,
    /\/api\/ordering\/status(\?|$)/,
    /\/api\/service-status(\?|$)/,
];

function isVideoRequest(request, url) {
    const path = url.pathname.toLowerCase();
    if (path.endsWith('.mp4') || path.endsWith('.webm')) return true;
    const accept = request.headers.get('Accept') || '';
    if (accept.includes('video/')) return true;
    // Range/206 responses corrupt cache.put — never cache range fetches.
    if (request.headers.has('Range')) return true;
    return false;
}

// ── Install — pre-cache the shell ──────────────────────────────────────────
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(STATIC_CACHE).then((cache) => {
            // addAll fails atomically if any single URL 404s — wrap each
            // entry in its own request so a missing file doesn't poison
            // the whole install.
            return Promise.all(
                PRECACHE_URLS.map((url) =>
                    cache.add(new Request(url, { cache: 'reload' })).catch(() => null)
                )
            );
        })
    );
    self.skipWaiting();
});

// ── Activate — purge old caches ────────────────────────────────────────────
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(
                keys
                    .filter((k) => !k.startsWith(CACHE_VERSION))
                    .map((k) => caches.delete(k))
            )
        )
    );
    self.clients.claim();
});

// ── Helpers ────────────────────────────────────────────────────────────────
function isApiRequest(url) {
    return url.pathname.startsWith('/api/');
}
function isCacheableApi(url) {
    return CACHEABLE_API_PATTERNS.some((re) => re.test(url.pathname + url.search));
}
function isStaticBuildAsset(url) {
    // Vite emits hashed assets under /order/assets/…
    return url.pathname.startsWith('/order/assets/');
}
function isNavigationRequest(req) {
    return req.mode === 'navigate' ||
        (req.method === 'GET' && req.headers.get('accept')?.includes('text/html'));
}

// ── Fetch — routing ────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
    const { request } = event;
    if (request.method !== 'GET') return;

    const url = new URL(request.url);

    // 1. Cross-origin: let the browser handle it.
    if (url.origin !== self.location.origin) return;

    // 2. Cacheable menu API — network first, cache fallback for offline only.
    if (isApiRequest(url) && isCacheableApi(url)) {
        event.respondWith(menuNetworkFirst(request, API_CACHE));
        return;
    }

    // 3. Any other API call — bypass cache entirely so we never serve
    //    a stale POST/PUT/DELETE response and never accidentally cache
    //    customer-specific data.
    if (isApiRequest(url)) return;

    // 4. Hashed build assets — stale-while-revalidate (immutable URLs).
    if (isStaticBuildAsset(url)) {
        event.respondWith(staleWhileRevalidate(request, RUNTIME_CACHE));
        return;
    }

    // 5. Navigation requests — network first, fallback to cached shell
    //    then to /order/offline.html.
    if (isNavigationRequest(request)) {
        event.respondWith(navigationHandler(request));
        return;
    }

    // 5b. Video / range responses — network only (never cache.put 206s).
    if (isVideoRequest(request, url)) return;

    // 6. Everything else (images, fonts) — stale-while-revalidate.
    event.respondWith(staleWhileRevalidate(request, RUNTIME_CACHE));
});

async function networkFirst(request, cacheName) {
    const cache = await caches.open(cacheName);
    try {
        const fresh = await fetch(request);
        if (fresh && fresh.ok) cache.put(request, fresh.clone());
        return fresh;
    } catch (e) {
        const cached = await cache.match(request);
        if (cached) return cached;
        throw e;
    }
}

/** Re-wrap a response so we can tell later how old the cached copy is. */
async function withCacheStamp(response) {
    const body = await response.clone().blob();
    const headers = new Headers(response.headers);
    headers.set(CACHED_AT_HEADER, String(Date.now()));
    return new Response(body, {
        status: response.status,
        statusText: response.statusText,
        headers,
    });
}

function cachedAgeMs(response) {
    const stamped = Number(response.headers.get(CACHED_AT_HEADER));
    // An entry from before stamping existed has no age we can trust; treat it
    // as ancient rather than assume it is current.
    return Number.isFinite(stamped) && stamped > 0 ? Date.now() - stamped : Infinity;
}

/**
 * The menu, and only ever as fresh as we can honestly claim.
 *
 * Owner, 2026-09-05: an item added at 15:51 was missing from the installed app
 * at 20:20 while the API had served it all afternoon. A network-first cache
 * that falls back on *any* failure will, on a phone, quietly answer from a copy
 * made hours ago and look exactly like a working menu.
 *
 * So the fallback is now for being offline, not for being unlucky: a genuinely
 * offline device still gets the last menu it saw, a momentary blip online is
 * covered by a recent copy, and an old copy while online is not served at all —
 * the app is told the fetch failed and can retry and say so.
 */
async function menuNetworkFirst(request, cacheName) {
    const cache = await caches.open(cacheName);
    try {
        const fresh = await fetch(request);
        if (fresh && fresh.ok) cache.put(request, await withCacheStamp(fresh));
        return fresh;
    } catch (e) {
        const cached = await cache.match(request);
        if (!cached) throw e;
        if (self.navigator.onLine === false) return cached;
        if (cachedAgeMs(cached) <= STALE_API_MS) return cached;
        throw e;
    }
}

async function staleWhileRevalidate(request, cacheName) {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(request);
    const fetchPromise = fetch(request)
        .then((response) => {
            if (response && response.ok) cache.put(request, response.clone());
            return response;
        })
        .catch(() => cached);
    return cached || fetchPromise;
}

async function navigationHandler(request) {
    try {
        const fresh = await fetch(request);
        if (fresh && fresh.ok) {
            const cache = await caches.open(RUNTIME_CACHE);
            cache.put(request, fresh.clone());
        }
        return fresh;
    } catch (e) {
        const cached =
            (await caches.match(request)) ||
            (await caches.match('/order/index.html')) ||
            (await caches.match('/order/'));
        if (cached) return cached;
        const offline = await caches.match('/order/offline.html');
        if (offline) return offline;
        throw e;
    }
}

// ── Push notifications (preserved from earlier SW) ─────────────────────────
self.addEventListener('push', (event) => {
    const data = event.data ? safeJson(event.data) : {};
    const title = data.title ?? 'Bake & Grill';
    const body  = data.body  ?? 'You have a new notification.';
    const url   = data.url   ?? '/order/';

    event.waitUntil(
        self.registration.showNotification(title, {
            body,
            icon: '/logo.png',
            badge: '/logo.png',
            data: { url },
        })
    );
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const url = event.notification.data?.url ?? '/order/';
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
            // Focus an existing tab if one is already on this origin.
            for (const win of wins) {
                if ('focus' in win) return win.navigate(url).then(() => win.focus()).catch(() => clients.openWindow(url));
            }
            return clients.openWindow(url);
        })
    );
});

function safeJson(eventData) {
    try { return eventData.json(); } catch { return {}; }
}

// ── Allow the page to force a SW update ────────────────────────────────────
self.addEventListener('message', (event) => {
    if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
