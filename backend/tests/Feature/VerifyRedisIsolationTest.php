<?php

declare(strict_types=1);

namespace Tests\Feature;

use Tests\TestCase;

/**
 * The check CLAUDE.md said could not be automated. TEST and production
 * share one Redis; a non-production site on the defaults shares the queue.
 */
class VerifyRedisIsolationTest extends TestCase
{
    private function onRedis(): void
    {
        config()->set('queue.default', 'redis');
        config()->set('cache.default', 'redis');
        config()->set('app.name', 'Bake & Grill');
    }

    public function test_a_test_site_on_the_defaults_is_blocked(): void
    {
        $this->onRedis();
        config()->set('app.env', 'testing');
        config()->set('database.redis.default.database', '0');
        config()->set('database.redis.cache.database', '1');
        config()->set('database.redis.options.prefix', 'bake-grill-database-');
        config()->set('cache.prefix', 'bake-grill-cache-');

        $this->artisan('app:verify-redis-isolation')
            ->expectsOutputToContain('REDIS_DB')
            ->expectsOutputToContain('REDIS_CACHE_DB')
            ->expectsOutputToContain('REDIS_PREFIX')
            ->expectsOutputToContain('CACHE_PREFIX')
            ->assertFailed();
    }

    public function test_a_test_site_with_its_own_databases_and_prefixes_passes(): void
    {
        $this->onRedis();
        config()->set('app.env', 'testing');
        config()->set('database.redis.default.database', '2');
        config()->set('database.redis.cache.database', '3');
        config()->set('database.redis.options.prefix', 'bg-test-database-');
        config()->set('cache.prefix', 'bg-test-cache-');

        $this->artisan('app:verify-redis-isolation')->assertSuccessful();
    }

    public function test_production_on_the_defaults_is_fine(): void
    {
        $this->onRedis();
        $this->app['env'] = 'production'; // app()->environment() reads the container, not config
        config()->set('app.env', 'production');
        config()->set('database.redis.default.database', '0');
        config()->set('database.redis.cache.database', '1');

        $this->artisan('app:verify-redis-isolation')->assertSuccessful();
    }

    public function test_a_site_not_on_redis_has_nothing_to_check(): void
    {
        config()->set('app.env', 'testing');
        config()->set('queue.default', 'sync');
        config()->set('cache.default', 'file');

        $this->artisan('app:verify-redis-isolation')->assertSuccessful();
    }
}
