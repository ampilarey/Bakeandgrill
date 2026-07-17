<?php

declare(strict_types=1);

namespace Tests\Feature\System;

use App\Models\Order;
use App\Models\Role;
use App\Models\SmsLog;
use App\Models\User;
use App\Models\WebhookLog;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class SystemHealthDetailedTest extends TestCase
{
    use RefreshDatabase;

    private function actingOwner(): User
    {
        $role = Role::firstOrCreate(['slug' => 'owner'], ['name' => 'Owner', 'description' => '', 'is_active' => true]);
        $owner = User::create([
            'name' => 'Owner',
            'email' => 'owner-health-detailed@test.com',
            'password' => Hash::make('password'),
            'role_id' => $role->id,
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);
        Sanctum::actingAs($owner, ['staff']);

        return $owner;
    }

    public function test_detailed_health_requires_auth(): void
    {
        $this->getJson('/api/admin/system/health/detailed')->assertUnauthorized();
    }

    public function test_detailed_health_returns_aggregate_counts(): void
    {
        $this->actingOwner();

        DB::table('failed_jobs')->insert([
            'uuid' => (string) \Illuminate\Support\Str::uuid(),
            'connection' => 'redis',
            'queue' => 'default',
            'payload' => '{}',
            'exception' => 'test',
            'failed_at' => now()->subHour(),
        ]);

        WebhookLog::create([
            'idempotency_key' => 'bml-fail-1',
            'gateway' => 'bml',
            'gateway_event_id' => 'evt-1',
            'event_type' => 'payment.failed',
            'headers' => [],
            'raw_body' => '{}',
            'payload' => [],
            'status' => 'failed',
            'error_message' => 'Signature mismatch',
        ]);

        Order::factory()->create([
            'status' => 'payment_pending',
            'created_at' => now()->subMinutes(45),
        ]);

        SmsLog::create([
            'message' => 'Test',
            'to' => '9609120011',
            'type' => 'transactional',
            'status' => 'failed',
            'encoding' => 'gsm7',
            'segments' => 1,
        ]);

        Http::fake([
            'http://127.0.0.1:3000/health' => Http::response(['ok' => true], 200),
        ]);
        config(['services.print_proxy.url' => 'http://127.0.0.1:3000']);

        $response = $this->getJson('/api/admin/system/health/detailed')->assertOk();

        $response->assertJsonStructure([
            'status',
            'failed_jobs_24h',
            'webhook_failures_24h',
            'payment_pending_stuck',
            'sms_failed_24h',
            'print_proxy_ok',
            'print_proxy_status',
            'queue_depth',
            'checked_at',
            'recent_failed_jobs',
            'recent_webhook_failures',
            'stuck_payment_pending_orders',
        ]);

        $data = $response->json();
        $this->assertSame('degraded', $data['status']);
        $this->assertGreaterThanOrEqual(1, $data['failed_jobs_24h']);
        $this->assertGreaterThanOrEqual(1, $data['webhook_failures_24h']);
        $this->assertGreaterThanOrEqual(1, $data['payment_pending_stuck']);
        $this->assertGreaterThanOrEqual(1, $data['sms_failed_24h']);
        $this->assertTrue($data['print_proxy_ok']);
    }

    public function test_detailed_health_ok_when_no_issues(): void
    {
        $this->actingOwner();

        Http::fake([
            '*' => Http::response([], 503),
        ]);
        config(['services.print_proxy.url' => '']);

        $response = $this->getJson('/api/admin/system/health/detailed')->assertOk();

        $data = $response->json();
        $this->assertSame(0, $data['failed_jobs_24h']);
        $this->assertSame('not_configured', $data['print_proxy_status']);
        $this->assertArrayHasKey('disk', $data);
        // Disk may already be low on the host — only assert ok when disk is healthy.
        if (($data['disk']['ok'] ?? null) !== false) {
            $this->assertSame('ok', $data['status']);
        }
    }

    public function test_forget_failed_job(): void
    {
        $this->actingOwner();

        $uuid = (string) \Illuminate\Support\Str::uuid();
        DB::table('failed_jobs')->insert([
            'uuid' => $uuid,
            'connection' => 'redis',
            'queue' => 'default',
            'payload' => '{}',
            'exception' => 'boom',
            'failed_at' => now(),
        ]);

        $this->deleteJson("/api/admin/system/health/failed-jobs/{$uuid}")
            ->assertOk()
            ->assertJsonPath('message', 'Failed job discarded.');

        $this->assertDatabaseMissing('failed_jobs', ['uuid' => $uuid]);
    }
}
