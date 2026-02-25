<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Domains\Notifications\DTOs\SmsMessage;
use App\Domains\Notifications\Services\BulkSmsService;
use App\Domains\Notifications\Services\SmsService;
use App\Models\Category;
use App\Models\Customer;
use App\Models\Item;
use App\Models\Order;
use App\Models\SmsCampaign;
use App\Models\SmsLog;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class SmsLoggingTest extends TestCase
{
    use RefreshDatabase;

    private SmsService $smsService;
    private User $staff;

    protected function setUp(): void
    {
        parent::setUp();
        $this->smsService = app(SmsService::class);

        $role = Role::create(['name' => 'Admin', 'slug' => 'admin', 'description' => '', 'is_active' => true]);
        $this->staff = User::create([
            'name' => 'Admin', 'email' => 'admin@test.com',
            'password' => Hash::make('password'), 'role_id' => $role->id,
            'pin_hash' => Hash::make('1234'), 'is_active' => true,
        ]);
    }

    public function test_sms_send_creates_log_entry(): void
    {
        $log = $this->smsService->send(new SmsMessage(
            to: '+9607654321',
            message: 'Hello from Bake & Grill!',
            type: 'transactional',
        ));

        $this->assertInstanceOf(SmsLog::class, $log);
        $this->assertEquals('+9607654321', $log->to);
        $this->assertEquals('transactional', $log->type);
        $this->assertContains($log->status, ['sent', 'demo', 'failed']);
        $this->assertNotNull($log->encoding);
        $this->assertGreaterThan(0, $log->segments);
        $this->assertNotNull($log->cost_estimate_mvr);
    }

    public function test_otp_sms_is_logged_as_otp_type(): void
    {
        $customer = Customer::create(['name' => 'Test', 'phone' => '+9607654322']);

        $log = $this->smsService->send(new SmsMessage(
            to: '+9607654322',
            message: 'Your Bake & Grill code is 123456. Valid for 10 minutes.',
            type: 'otp',
            customerId: $customer->id,
            referenceType: 'otp',
            referenceId: '42',
        ));

        $this->assertEquals('otp', $log->type);
        $this->assertEquals($customer->id, $log->customer_id);
        $this->assertEquals('otp', $log->reference_type);
    }

    public function test_sms_idempotency_prevents_duplicate_send(): void
    {
        $key = 'test-idempotent-' . uniqid();

        $first = $this->smsService->send(new SmsMessage(
            to: '+9607654323',
            message: 'Duplicate test',
            type: 'transactional',
            idempotencyKey: $key,
        ));

        $second = $this->smsService->send(new SmsMessage(
            to: '+9607654323',
            message: 'Duplicate test',
            type: 'transactional',
            idempotencyKey: $key,
        ));

        $this->assertEquals($first->id, $second->id);
        $this->assertEquals(1, SmsLog::where('idempotency_key', $key)->count());
    }

    public function test_unicode_message_uses_ucs2_encoding(): void
    {
        $log = $this->smsService->send(new SmsMessage(
            to: '+9607654324',
            message: 'ތިޔައީ ބައިވެ ލިބިދެ',  // Dhivehi (Thaana script)
            type: 'transactional',
        ));

        $this->assertEquals('ucs2', $log->encoding);
    }

    public function test_sms_estimate_calculates_correctly(): void
    {
        $estimate = $this->smsService->estimate('Hello World');

        $this->assertEquals('gsm7', $estimate['encoding']);
        $this->assertEquals(1, $estimate['segments']);
        $this->assertEquals(0.25, $estimate['cost_mvr']);
    }

    public function test_bulk_sms_preview_returns_audience_and_cost(): void
    {
        Customer::create(['name' => 'Gold 1', 'phone' => '+9607000001', 'tier' => 'gold']);
        Customer::create(['name' => 'Gold 2', 'phone' => '+9607000002', 'tier' => 'gold']);
        Customer::create(['name' => 'Bronze', 'phone' => '+9607000003', 'tier' => 'bronze']);

        $bulkSms = app(BulkSmsService::class);
        $preview = $bulkSms->preview('Special offer for gold members!', ['tier' => ['gold']]);

        $this->assertEquals(2, $preview['recipient_count']);
        $this->assertArrayHasKey('total_cost_mvr', $preview);
        $this->assertArrayHasKey('per_message', $preview);
        $this->assertArrayHasKey('sample_recipients', $preview);
    }

    public function test_campaign_preview_endpoint_works(): void
    {
        Customer::create(['name' => 'VIP', 'phone' => '+9607111001', 'tier' => 'gold']);

        Sanctum::actingAs($this->staff, ['staff']);

        $response = $this->postJson('/api/admin/sms/campaigns/preview', [
            'message' => 'Hi, check our weekend special!',
            'target_criteria' => ['tier' => ['gold']],
        ]);

        $response->assertStatus(200)
            ->assertJsonStructure([
                'recipient_count',
                'total_cost_mvr',
                'per_message',
                'sample_recipients',
            ]);
    }

    public function test_campaign_store_and_send(): void
    {
        Customer::create(['name' => 'Loyal', 'phone' => '+9607222001', 'tier' => 'silver']);

        Sanctum::actingAs($this->staff, ['staff']);

        // Create campaign
        $create = $this->postJson('/api/admin/sms/campaigns', [
            'name' => 'Weekend Promo',
            'message' => 'Get 20% off this weekend at Bake & Grill!',
            'target_criteria' => ['tier' => ['silver', 'gold']],
        ]);

        $create->assertStatus(201);
        $campaignId = $create->json('campaign.id');

        // Send it
        $send = $this->postJson("/api/admin/sms/campaigns/{$campaignId}/send");
        $send->assertStatus(200)
            ->assertJsonStructure(['message', 'campaign']);

        $this->assertEquals(1, SmsCampaign::find($campaignId)->total_recipients);
    }

    public function test_sms_logs_admin_endpoint(): void
    {
        // Create a log entry
        SmsLog::create([
            'message' => 'Test log',
            'to' => '+9607000099',
            'type' => 'otp',
            'status' => 'demo',
            'encoding' => 'gsm7',
            'segments' => 1,
            'provider' => 'dhiraagu',
        ]);

        Sanctum::actingAs($this->staff, ['staff']);

        $response = $this->getJson('/api/admin/sms/logs?type=otp');
        $response->assertStatus(200)
            ->assertJsonStructure(['data', 'total', 'per_page']);

        $this->assertGreaterThanOrEqual(1, $response->json('total'));
    }

    public function test_otp_request_logs_sms(): void
    {
        $before = SmsLog::count();

        $this->postJson('/api/auth/customer/otp/request', [
            'phone' => '7654999',
        ]);

        $this->assertGreaterThan($before, SmsLog::count());

        $log = SmsLog::latest()->first();
        $this->assertEquals('otp', $log->type);
        $this->assertEquals('+9607654999', $log->to);
    }
}
