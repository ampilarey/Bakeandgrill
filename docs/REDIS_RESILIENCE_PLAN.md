# Redis Resilience — stop Redis outages from 500ing the site

**Status:** Ready for implementation
**Severity:** 🔴 Production incidents (intermittent 500s reported by the owner)
**Goal:** A Redis outage should degrade performance, never take the site down. Today Redis is a hard dependency on the hottest paths, with no fallback, no working retries, and no monitoring.

---

## 1. Evidence

`backend/storage/logs/laravel-2026-07-22.log` — **508 Redis-related lines**. The error:

```
Predis\Connection\ConnectionException:
No such file or directory [unix:/home/bakeandgrill/.redis/redis.sock]
```

Not a timeout, not auth — **the socket file does not exist**. On cPanel, per-user Redis is a user-level service: it is stopped by host maintenance, killed under memory pressure, or dies without auto-restart, and the socket disappears with it. That is why the 500s are intermittent.

Relevant `.env.example` settings:

```
CACHE_STORE=redis          # 34 cache call sites + ALL rate limiting
QUEUE_CONNECTION=redis     # 34 dispatch sites
SESSION_DRIVER=database    # ✅ safe — sessions survive an outage
REDIS_CLIENT=predis
REDIS_SCHEME=unix
REDIS_PATH=/home/bakeandgrill/.redis/redis.sock
```

---

## 2. Blast radius (audited)

### 2.1 🔴 Rate limiting — the largest surface

**108 `throttle:` route definitions.** Laravel's `throttle` middleware writes to the **default cache store**, and `config/cache.php` has no separate `limiter` store, so throttling runs on Redis. When Redis is down, throttled routes fail **in middleware, before the controller runs** — so the failure is not caught by anything in `app/`.

Plus **63** `RateLimiter::` / `Cache::lock()` usages.

### 2.2 🔴 Cached reads on hot paths — no fallback anywhere

A grep for `RedisException`, `Predis\`, `ConnectionException` or any cache fallback across `app/` returns **zero results**. There is no error handling at all. The worst offender runs on every public page:

```php
// app/Domains/Content/ContentResolver.php:145 — website homepage + order-app boot
return Cache::rememberForever($this->cacheKey(), ...);
```

Redis down → **the entire public site 500s**, not one feature. Other cache-dependent services (14 files):
`SiteSetting`, `AutoPromotionPricing`, `OffersService`, `GiftCardPurchaseDeliveryWindow`, `SignageResolver`, `SignageCache`, `ContentDraftStore`, `ContentResolver`, `VipSettingsService`, `PickupSlotService`, `GstSettingsService`, `ServiceAvailabilityService`, `SchedulerRunTracker`, `PrayerCacheVersion`.

### 2.3 🟠 Queue dispatches in the request path

`QUEUE_CONNECTION=redis` with **34 dispatch sites**. Any `dispatch()` executed inline during a request throws when Redis is down. Dispatches routed through `DeferAfterResponse` are safe (see 2.5).

### 2.4 🟠 Retry/backoff config is inert

`config/database.php` sets `max_retries`, `backoff_algorithm`, `backoff_base`, `backoff_cap` on both Redis connections. **These are phpredis-only options.** With `REDIS_CLIENT=predis` they do nothing — the app has **zero** retries despite the config implying three.

No `connect_timeout` / `read_write_timeout` is configured either, so predis uses its defaults and a hung socket can block a worker.

### 2.5 ✅ Already resilient (do not change)

- `DeferAfterResponse` (`app/Support/DeferAfterResponse.php:65`) catches `Throwable` and logs — this is why the `OrderStatusChanged` / `OrderPaid` Redis errors in the log were **logged, not 500s**.
- `RedisEventPublisher` — try/catch + `Log::warning`; realtime push degrades silently.
- `SseStreamService` — try/catch around the subscribe loop.
- `SESSION_DRIVER=database` — logins survive a Redis outage.

### 2.6 🟠 No monitoring

`SystemHealthController` has **no Redis check**. The first signal of an outage is customers hitting 500s.

---

## 3. Fix

### 3.0 Immediate mitigation (no deploy — do this first)

In production `.env`: `CACHE_STORE=file`, then `php artisan config:clear`. This alone stops the 500s: file cache has no daemon to die. Slower than Redis but ample at current traffic. Everything below then makes Redis *safe to re-enable*.

### 3.1 Isolate rate limiting from Redis

Add a dedicated limiter store so throttling never depends on Redis:

- `config/cache.php`: add a `limiter` store (database or file).
- Point the throttle middleware / `RateLimiter` at it (`RateLimiter::for(...)` with an explicit store, or set `'limiter' => env('CACHE_LIMITER_STORE', 'database')` and use it in the throttle resolution).
- Rationale: a throttle failure is a **middleware-level** 500 that no application code can catch.

### 3.2 A resilient cache wrapper

Add `App\Support\ResilientCache` with `remember(key, ttl, callback)` / `rememberForever(key, callback)` / `forget(key)` that:

1. Try the configured cache store.
2. On `Throwable` from the store: **log once per request** (guard against 100s of identical lines — the 508-line log shows how noisy this gets) and **execute the callback directly**, returning the fresh value.
3. Never let a cache failure propagate.

Migrate the 14 cache-dependent services in §2.2 to it. Start with `ContentResolver` — that one alone converts a total site outage into a slow page.

**Writes** (`Cache::put`/`forget`) must also be wrapped: a failed bust must not 500 an admin save.

### 3.3 Make retries real

- Prefer `REDIS_CLIENT=phpredis` when the extension is available — faster, and it makes the existing `max_retries`/backoff config actually function.
- Keep predis working as a fallback. Under predis, set explicit `connect_timeout` and `read_write_timeout` (e.g. 1.5s / 2s) so a dead socket fails fast instead of hanging a php-fpm worker.
- Document in `.env.example` that the retry/backoff keys apply to phpredis only.

### 3.4 Queue safety

- Consider `QUEUE_CONNECTION=database` — one less daemon in the request path, and jobs survive a Redis restart.
- If Redis stays: any `dispatch()` reachable from an HTTP request must be wrapped (route it through `DeferAfterResponse`, or catch and log).

### 3.5 Monitoring

- Add a **Redis check to `SystemHealthController`**: connect, `PING`, report latency; degrade to a warning (never throw).
- Surface it on the System Health page with a clear state (`up` / `down` / `degraded`).
- Log Redis connection failures at `error` with a **throttled/deduplicated** message so one outage does not write 500 identical lines.

---

## 4. Tests

- With the cache store forced to throw, the public content endpoint and website homepage still return **200** (fallback computed the value).
- `ResilientCache::remember` returns the callback's value when the store throws, and logs exactly once per request.
- A failing `Cache::forget` during an admin content save does not fail the save.
- Throttled routes still enforce limits when the Redis store is unavailable (limiter uses its own store).
- System Health reports Redis `down` without throwing when the connection fails.
- `DeferAfterResponse`, `RedisEventPublisher` and `SseStreamService` keep their existing catch behaviour (regression guards).
- Backend suite stays green.

---

## 5. Acceptance criteria

- [ ] With Redis stopped, the website homepage, order app and admin login all return **200**.
- [ ] With Redis stopped, throttled routes still work and still rate-limit.
- [ ] No cache read or write anywhere in `app/` can propagate a store exception to the user.
- [ ] Redis retry/timeout settings are real for the configured client, and documented.
- [ ] System Health shows Redis status and does not throw when it is down.
- [ ] A Redis outage produces a handful of log lines, not hundreds.
- [ ] Backend suite green against the baseline recorded at start.

---

## 6. Out of scope

- Moving off Redis permanently (it is a fine cache once failures are non-fatal).
- Changing `SESSION_DRIVER` (already `database` and safe).
- Rewriting the realtime/SSE architecture (already guarded).
