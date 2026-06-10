<?php

declare(strict_types=1);

namespace Tests\Feature\Console;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class VerifyProductionConfigTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->app->detectEnvironment(static fn (): string => 'production');
    }

    public function test_skips_when_not_production_environment(): void
    {
        $this->app->detectEnvironment(static fn (): string => 'local');

        $this->artisan('app:verify-production-config')
            ->expectsOutputToContain('skipping')
            ->assertSuccessful();
    }

    public function test_fails_when_app_debug_is_true(): void
    {
        config([
            'app.debug' => true,
            'app.key' => 'base64:' . base64_encode(random_bytes(32)),
            'sentry.dsn' => 'https://example@sentry.io/1',
            'backup.backup.destination.disks' => ['backups'],
            'queue.default' => 'redis',
            'cache.default' => 'redis',
        ]);

        putenv('TRUSTED_PROXIES=127.0.0.1');

        $this->artisan('app:verify-production-config')
            ->assertFailed();

        putenv('TRUSTED_PROXIES');
    }

    public function test_fails_when_trusted_proxies_is_wildcard(): void
    {
        config([
            'app.debug' => false,
            'app.key' => 'base64:' . base64_encode(random_bytes(32)),
            'sentry.dsn' => 'https://example@sentry.io/1',
            'backup.backup.destination.disks' => ['backups'],
            'queue.default' => 'redis',
            'cache.default' => 'redis',
        ]);

        putenv('TRUSTED_PROXIES=*');

        $this->artisan('app:verify-production-config')
            ->assertFailed();

        putenv('TRUSTED_PROXIES');
    }

    public function test_passes_when_required_values_are_set(): void
    {
        config([
            'app.debug' => false,
            'app.key' => 'base64:' . base64_encode(random_bytes(32)),
            'sentry.dsn' => 'https://example@sentry.io/1',
            'backup.backup.destination.disks' => ['s3'],
            'queue.default' => 'redis',
            'cache.default' => 'redis',
            'system.healthcheck_url' => 'https://hc.example/ping',
        ]);

        putenv('TRUSTED_PROXIES=127.0.0.1');
        putenv('ADMIN_TOKEN_TTL_HOURS=24');

        $this->artisan('app:verify-production-config')
            ->assertSuccessful();

        putenv('TRUSTED_PROXIES');
        putenv('ADMIN_TOKEN_TTL_HOURS');
    }
}
