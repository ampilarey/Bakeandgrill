<?php

declare(strict_types=1);

return [
    /*
    |--------------------------------------------------------------------------
    | Use Redis Pub/Sub for real-time SSE
    |--------------------------------------------------------------------------
    |
    | When enabled, order status changes are published to Redis channels and
    | the SSE service subscribes to these channels instead of polling the DB.
    | This provides near-instant updates (< 10ms vs ~1s polling interval).
    |
    | Requirements:
    |   - Redis server (or Redis-compatible e.g. Valkey)
    |   - REDIS_HOST set in .env
    |   - predis/predis or php-redis extension installed
    |
    | Set REALTIME_USE_REDIS=true in .env to enable.
    | Falls back to DB polling if Redis is unavailable.
    |
    */
    'use_redis' => (bool) env('REALTIME_USE_REDIS', false),
];
