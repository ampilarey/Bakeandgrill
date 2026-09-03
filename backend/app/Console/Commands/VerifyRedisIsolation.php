<?php

declare(strict_types=1);

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Str;

/**
 * TEST and production share one Redis server on this cPanel account (the
 * socket is per account). Nothing separates them unless the environment
 * says so: REDIS_DB / REDIS_CACHE_DB pick the database, REDIS_PREFIX /
 * CACHE_PREFIX the key prefix. Left at the defaults, a non-production site
 * shares production's queue — a TEST campaign-SMS job popped by the live
 * worker and delivered to real customers — and its cache, where a
 * `cache:clear` on either side flushes both.
 *
 * Production keeps the defaults (databases 0 and 1, prefixes from APP_NAME).
 * Every other environment on the same Redis must sit elsewhere. This is the
 * check CLAUDE.md said could not be automated because the verifier only sees
 * one environment: it does not need to see the other, only to know that
 * "not production" plus "on the defaults" is the sharing case.
 */
class VerifyRedisIsolation extends Command
{
    protected $signature = 'app:verify-redis-isolation';

    protected $description = 'Fail when a non-production site sits on the Redis databases and prefixes production uses';

    public function handle(): int
    {
        if (app()->environment('production')) {
            $this->info('Production keeps the default Redis databases and prefixes — nothing to check here.');

            return self::SUCCESS;
        }

        $usesRedis = config('queue.default') === 'redis' || config('cache.default') === 'redis';
        if (!$usesRedis) {
            $this->info('Redis is not the queue or cache driver here — nothing to check.');

            return self::SUCCESS;
        }

        $slug = Str::slug((string) config('app.name', 'laravel'));
        $problems = [];

        if ((string) config('database.redis.default.database') === '0') {
            $problems[] = ['REDIS_DB', 'Is 0, the production queue database. Set another number.'];
        }
        if ((string) config('database.redis.cache.database') === '1') {
            $problems[] = ['REDIS_CACHE_DB', 'Is 1, the production cache database. Set another number.'];
        }
        if ((string) config('database.redis.options.prefix') === $slug . '-database-') {
            $problems[] = ['REDIS_PREFIX', 'Is the APP_NAME default, the same as production. Set one of its own.'];
        }
        if ((string) config('cache.prefix') === $slug . '-cache-') {
            $problems[] = ['CACHE_PREFIX', 'Is the APP_NAME default, the same as production. Set one of its own.'];
        }

        $this->newLine();
        $this->components->info('Redis isolation (' . config('app.env') . ')');

        if ($problems === []) {
            $this->components->info('This site has its own Redis databases and prefixes.');

            return self::SUCCESS;
        }

        $this->table(['Variable', 'Issue'], $problems);
        $this->components->error(count($problems) . ' setting(s) would share Redis with production — deploy blocked.');

        return self::FAILURE;
    }
}
