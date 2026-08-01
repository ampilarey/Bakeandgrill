<?php

declare(strict_types=1);

namespace Tests\Feature\System;

use App\Domains\Content\ContentResolver;
use App\Models\Role;
use App\Models\SiteSetting;
use App\Models\User;
use App\Support\DeferAfterResponse;
use App\Support\ResilientCache;
use App\Domains\Realtime\Services\RedisEventPublisher;
use Illuminate\Cache\Repository;
use Illuminate\Contracts\Cache\Store;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Redis;
use Laravel\Sanctum\Sanctum;
use ReflectionClass;
use Tests\TestCase;

class RedisResilienceTest extends TestCase
{
    use RefreshDatabase;

    private function installThrowingCacheStore(): void
    {
        $this->app['cache']->extend('throwing', function () {
            return new Repository(new class implements Store
            {
                public function get($key)
                {
                    throw new \RuntimeException('redis socket missing');
                }

                public function many(array $keys)
                {
                    throw new \RuntimeException('redis socket missing');
                }

                public function put($key, $value, $seconds)
                {
                    throw new \RuntimeException('redis socket missing');
                }

                public function putMany(array $values, $seconds)
                {
                    throw new \RuntimeException('redis socket missing');
                }

                public function increment($key, $value = 1)
                {
                    throw new \RuntimeException('redis socket missing');
                }

                public function decrement($key, $value = 1)
                {
                    throw new \RuntimeException('redis socket missing');
                }

                public function forever($key, $value)
                {
                    throw new \RuntimeException('redis socket missing');
                }

                public function forget($key)
                {
                    throw new \RuntimeException('redis socket missing');
                }

                public function flush()
                {
                    throw new \RuntimeException('redis socket missing');
                }

                public function getPrefix()
                {
                    return '';
                }
            });
        });

        config(['cache.default' => 'throwing']);
        Cache::forgetDriver('throwing');
        Cache::setDefaultDriver('throwing');
    }

    public function test_resilient_cache_remember_returns_callback_and_logs_once_per_request(): void
    {
        $this->installThrowingCacheStore();
        Log::spy();

        $first = ResilientCache::remember('k1', 60, fn () => 'fresh-a');
        $second = ResilientCache::remember('k2', 60, fn () => 'fresh-b');

        $this->assertSame('fresh-a', $first);
        $this->assertSame('fresh-b', $second);

        Log::shouldHaveReceived('warning')
            ->withArgs(fn ($message) => str_contains((string) $message, 'ResilientCache'))
            ->once();
    }

    public function test_public_content_and_homepage_survive_throwing_cache(): void
    {
        SiteSetting::updateOrCreate(
            ['key' => 'site_name', 'scope' => 'shared', 'locale' => 'en'],
            [
                'value' => 'Bake & Grill',
                'type' => 'text',
                'group' => 'General',
                'label' => 'Site name',
                'is_public' => true,
            ],
        );

        $this->installThrowingCacheStore();

        $this->getJson('/api/content?app=website')
            ->assertOk();

        $this->get('/')
            ->assertOk();
    }

    public function test_failing_cache_forget_does_not_fail_admin_content_save(): void
    {
        $role = Role::firstOrCreate(['slug' => 'owner'], ['name' => 'Owner', 'description' => '', 'is_active' => true]);
        $owner = User::create([
            'name' => 'Owner',
            'email' => 'owner-redis-resilience@test.com',
            'password' => Hash::make('password'),
            'role_id' => $role->id,
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);
        Sanctum::actingAs($owner, ['staff']);

        SiteSetting::updateOrCreate(
            ['key' => 'business_phone', 'scope' => 'shared', 'locale' => 'en'],
            [
                'value' => '+960 111',
                'type' => 'text',
                'group' => 'Contact',
                'label' => 'Phone',
                'is_public' => true,
            ],
        );

        $this->installThrowingCacheStore();

        // Direct model write path used by content/admin saves — bust must not throw.
        SiteSetting::set('business_phone', '+960 999', 'shared', 'en');

        $this->assertSame('+960 999', SiteSetting::query()
            ->where('key', 'business_phone')
            ->where('scope', 'shared')
            ->where('locale', 'en')
            ->value('value'));

        // Resolver still computes without cache.
        $resolved = ContentResolver::for('website', 'en')->get('business_phone');
        $this->assertNotNull($resolved);
    }

    public function test_throttle_still_enforces_when_default_cache_throws(): void
    {
        // Limiter stays on array; only the default (Redis) store is broken.
        // Use notify-me (throttle:5,1) — OTP route is throttle:60,1 and too slow to burn.
        config(['cache.limiter' => 'array']);
        $this->app->forgetInstance(\Illuminate\Cache\RateLimiter::class);
        $this->installThrowingCacheStore();

        $hitLimit = false;
        for ($i = 0; $i < 12; $i++) {
            $response = $this->postJson('/api/service-status/notify-me', [
                'service_key' => 'online_ordering',
                'mobile' => '9120011',
            ]);
            if ($response->status() === 429) {
                $hitLimit = true;
                break;
            }
            $this->assertContains(
                $response->status(),
                [200, 422],
                'Unexpected status before throttle with Redis cache unavailable',
            );
        }

        $this->assertTrue($hitLimit, 'Expected throttle to still return 429 with Redis cache unavailable');
    }

    public function test_system_health_reports_redis_down_without_throwing(): void
    {
        $role = Role::firstOrCreate(['slug' => 'owner'], ['name' => 'Owner', 'description' => '', 'is_active' => true]);
        $owner = User::create([
            'name' => 'Owner',
            'email' => 'owner-redis-health@test.com',
            'password' => Hash::make('password'),
            'role_id' => $role->id,
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);
        Sanctum::actingAs($owner, ['staff']);

        Redis::shouldReceive('connection')->andThrow(new \RuntimeException('No such file or directory'));

        $response = $this->getJson('/api/admin/system/health/detailed')->assertOk();
        $response->assertJsonPath('redis.status', 'down');
        $response->assertJsonPath('redis.ok', false);
        $this->assertSame('degraded', $response->json('status'));
    }

    public function test_defer_after_response_still_catches_throwables(): void
    {
        Log::spy();

        $ref = new ReflectionClass(DeferAfterResponse::class);
        $invoke = $ref->getMethod('invoke');
        $invoke->setAccessible(true);
        $invoke->invoke(null, static function (): void {
            throw new \RuntimeException('boom');
        }, 'unit-test');

        Log::shouldHaveReceived('error')
            ->withArgs(fn ($msg) => str_contains((string) $msg, 'DeferAfterResponse'))
            ->once();
    }

    public function test_redis_event_publisher_still_catches_publish_failures(): void
    {
        config(['realtime.use_redis' => true]);
        // Force enabled path
        $publisher = new class extends RedisEventPublisher
        {
            public function __construct()
            {
                // skip parent host check
            }

            public function forceEnable(): void
            {
                $ref = new ReflectionClass(RedisEventPublisher::class);
                $prop = $ref->getProperty('enabled');
                $prop->setAccessible(true);
                $prop->setValue($this, true);
            }
        };
        $publisher->forceEnable();

        Redis::shouldReceive('publish')->andThrow(new \RuntimeException('socket gone'));
        Log::spy();

        $publisher->publishOrderEvent(1, 'order.updated', ['id' => 1]);

        Log::shouldHaveReceived('warning')
            ->withArgs(fn ($msg) => str_contains((string) $msg, 'RedisEventPublisher'))
            ->once();
    }

    public function test_sse_stream_service_source_still_catches_throwable(): void
    {
        $source = file_get_contents(app_path('Domains/Realtime/Services/SseStreamService.php'));
        $this->assertNotFalse($source);
        $this->assertStringContainsString('catch (\\Throwable $e)', $source);
        $this->assertStringContainsString('SseStreamService: Redis stream error', $source);
    }

    public function test_cache_limiter_config_points_off_redis(): void
    {
        $this->assertSame('database', config('cache.limiter'));
        $this->assertNotSame('redis', config('cache.limiter'));
    }
}
