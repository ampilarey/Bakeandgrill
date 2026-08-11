<?php

declare(strict_types=1);

namespace Tests\Feature\System;

use App\Domains\System\Services\QueueWorkerHeartbeat;
use App\Domains\System\Services\SchedulerRunTracker;
use App\Domains\System\Services\SystemHealthService;
use App\Models\Role;
use App\Models\User;
use App\Support\ResilientCache;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Redis;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AdminHealthEndpointTest extends TestCase
{
    use RefreshDatabase;

    private function actingOwner(): User
    {
        $role = Role::firstOrCreate(['slug' => 'owner'], ['name' => 'Owner', 'description' => '', 'is_active' => true]);
        $owner = User::create([
            'name' => 'Owner',
            'email' => 'owner-admin-health@test.com',
            'password' => Hash::make('password'),
            'role_id' => $role->id,
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);
        Sanctum::actingAs($owner, ['staff']);

        return $owner;
    }

    private function stubRedisUp(): void
    {
        $conn = \Mockery::mock();
        $conn->shouldReceive('ping')->andReturn('PONG');
        Redis::shouldReceive('connection')->andReturn($conn);
    }

    private function seedSchedulerFresh(): void
    {
        app(SchedulerRunTracker::class)->recordLastRun('scheduler:heartbeat');
    }

    public function test_public_health_still_exposes_only_status_and_short_commit(): void
    {
        $response = $this->getJson('/api/health')->assertOk();
        $data = $response->json();

        $this->assertSame(['status', 'commit'], array_keys($data));
        $this->assertSame('ok', $data['status']);
        $this->assertIsString($data['commit']);
        foreach (['redis', 'queue', 'scheduler', 'storage', 'database', 'environment', 'branch', 'deployed_at', 'commit_short'] as $key) {
            $this->assertArrayNotHasKey($key, $data);
        }
    }

    public function test_admin_health_requires_auth(): void
    {
        $this->getJson('/api/admin/system/health')->assertUnauthorized();
    }

    public function test_admin_health_reports_healthy_components(): void
    {
        $this->actingOwner();
        $this->stubRedisUp();
        $this->seedSchedulerFresh();
        Storage::fake('public');

        // Sync queue driver (phpunit default) is healthy without a worker process.
        $this->assertSame('sync', config('queue.default'));

        $response = $this->getJson('/api/admin/system/health')->assertOk();
        $response->assertJsonStructure([
            'status',
            'environment',
            'database' => ['ok', 'status'],
            'redis' => ['ok', 'status'],
            'queue' => ['ok', 'status', 'driver', 'failed_jobs_count'],
            'scheduler' => ['ok', 'status', 'last_run_at'],
            'storage' => ['ok', 'status', 'disk'],
            'timestamp',
        ]);

        $data = $response->json();
        $this->assertTrue($data['database']['ok']);
        $this->assertTrue($data['redis']['ok']);
        $this->assertTrue($data['queue']['ok']);
        $this->assertSame('sync', $data['queue']['status']);
        $this->assertTrue($data['scheduler']['ok']);
        $this->assertTrue($data['storage']['ok']);
        $this->assertSame('ok', $data['status']);
    }

    public function test_redis_down_marks_component_and_overall_degraded(): void
    {
        $this->actingOwner();
        $this->seedSchedulerFresh();
        Storage::fake('public');
        Redis::shouldReceive('connection')->andThrow(new \RuntimeException('No such file or directory'));

        $response = $this->getJson('/api/admin/system/health')->assertOk();
        $this->assertFalse($response->json('redis.ok'));
        $this->assertSame('down', $response->json('redis.status'));
        $this->assertSame('degraded', $response->json('status'));
    }

    public function test_stale_queue_worker_heartbeat_is_unhealthy_on_redis_driver(): void
    {
        $this->actingOwner();
        $this->stubRedisUp();
        $this->seedSchedulerFresh();
        Storage::fake('public');
        config(['queue.default' => 'redis']);

        ResilientCache::forever(
            QueueWorkerHeartbeat::CACHE_KEY,
            now()->subMinutes(30)->toIso8601String(),
        );

        $response = $this->getJson('/api/admin/system/health')->assertOk();
        $this->assertFalse($response->json('queue.ok'));
        $this->assertSame('stale', $response->json('queue.status'));
        $this->assertSame('degraded', $response->json('status'));
        $this->assertNotNull($response->json('queue.failed_jobs_count'));
    }

    public function test_missing_queue_worker_heartbeat_is_unhealthy_on_redis_driver(): void
    {
        $this->actingOwner();
        $this->stubRedisUp();
        $this->seedSchedulerFresh();
        Storage::fake('public');
        config(['queue.default' => 'redis']);
        ResilientCache::forget(QueueWorkerHeartbeat::CACHE_KEY);

        $response = $this->getJson('/api/admin/system/health')->assertOk();
        $this->assertFalse($response->json('queue.ok'));
        $this->assertSame('no_heartbeat', $response->json('queue.status'));
        $this->assertSame('degraded', $response->json('status'));
    }

    public function test_fresh_queue_worker_heartbeat_is_healthy_on_redis_driver(): void
    {
        $this->actingOwner();
        $this->stubRedisUp();
        $this->seedSchedulerFresh();
        Storage::fake('public');
        config(['queue.default' => 'redis']);
        app(QueueWorkerHeartbeat::class)->record();

        DB::table('failed_jobs')->insert([
            'uuid' => (string) \Illuminate\Support\Str::uuid(),
            'connection' => 'redis',
            'queue' => 'default',
            'payload' => '{}',
            'exception' => 'old',
            'failed_at' => now()->subDay(),
        ]);

        $response = $this->getJson('/api/admin/system/health')->assertOk();
        $this->assertTrue($response->json('queue.ok'));
        $this->assertSame('alive', $response->json('queue.status'));
        $this->assertSame(1, $response->json('queue.failed_jobs_count'));
    }

    public function test_stale_scheduler_is_unhealthy(): void
    {
        $this->actingOwner();
        $this->stubRedisUp();
        Storage::fake('public');

        ResilientCache::forever(
            'scheduler:last_run:scheduler:heartbeat',
            now()->subMinutes(30)->toIso8601String(),
        );

        $response = $this->getJson('/api/admin/system/health')->assertOk();
        $this->assertFalse($response->json('scheduler.ok'));
        $this->assertSame('stale', $response->json('scheduler.status'));
        $this->assertSame('degraded', $response->json('status'));
    }

    public function test_never_run_scheduler_is_unhealthy(): void
    {
        $this->actingOwner();
        $this->stubRedisUp();
        Storage::fake('public');

        foreach (app(SchedulerRunTracker::class)->trackedCommands() as $command) {
            ResilientCache::forget('scheduler:last_run:'.$command);
        }

        $response = $this->getJson('/api/admin/system/health')->assertOk();
        $this->assertFalse($response->json('scheduler.ok'));
        $this->assertSame('never_run', $response->json('scheduler.status'));
        $this->assertSame('degraded', $response->json('status'));
    }

    public function test_unwritable_public_storage_is_unhealthy(): void
    {
        $this->actingOwner();
        $this->stubRedisUp();
        $this->seedSchedulerFresh();

        Storage::shouldReceive('disk')->with('public')->andReturn(
            new class
            {
                public function put($path, $contents)
                {
                    return false;
                }

                public function get($path)
                {
                    return null;
                }

                public function delete($path)
                {
                    return true;
                }
            }
        );

        $response = $this->getJson('/api/admin/system/health')->assertOk();
        $this->assertFalse($response->json('storage.ok'));
        $this->assertSame('degraded', $response->json('status'));
    }

    public function test_component_check_errors_fail_safe(): void
    {
        DB::shouldReceive('select')
            ->once()
            ->andThrow(new \RuntimeException('connection refused'));

        $result = app(SystemHealthService::class)->checkDatabase();
        $this->assertFalse($result['ok']);
        $this->assertSame('unreachable', $result['status']);
        $this->assertStringContainsString('connection refused', (string) $result['error']);
    }
}
