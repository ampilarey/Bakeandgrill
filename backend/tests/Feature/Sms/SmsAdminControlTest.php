<?php

declare(strict_types=1);

namespace Tests\Feature\Sms;

use App\Domains\Notifications\DTOs\SmsMessage;
use App\Domains\Notifications\Services\CustomerSmsMessageBuilder;
use App\Domains\Notifications\Services\SmsService;
use App\Domains\Notifications\Support\SmsBudgetGate;
use App\Domains\Notifications\Support\SmsTypeRegistry;
use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\AuditLog;
use App\Models\Permission;
use App\Models\Role;
use App\Models\SiteSetting;
use App\Models\SmsLog;
use App\Models\SmsTemplate;
use App\Models\User;
use Database\Seeders\SmsTemplateSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class SmsAdminControlTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    private User $staffNoPerm;

    protected function setUp(): void
    {
        parent::setUp();
        Role::firstOrCreate(['slug' => 'owner'], ['name' => 'Owner', 'description' => '', 'is_active' => true]);
        Role::firstOrCreate(['slug' => 'manager'], ['name' => 'Manager', 'description' => '', 'is_active' => true]);
        Role::firstOrCreate(['slug' => 'staff'], ['name' => 'Staff', 'description' => '', 'is_active' => true]);
        PermissionCatalogSync::sync();
        (new SmsTemplateSeeder)->run();

        $this->owner = User::create([
            'name' => 'Owner',
            'email' => 'owner-sms-admin@test.com',
            'password' => Hash::make('password'),
            'role_id' => Role::where('slug', 'owner')->value('id'),
            'is_active' => true,
        ]);

        $emptyRole = Role::firstOrCreate(
            ['slug' => 'sms-no-send'],
            ['name' => 'SMS No Send', 'description' => 'Test role with no SMS send perms', 'is_active' => true],
        );
        $emptyRole->permissions()->sync([]);
        $this->staffNoPerm = User::create([
            'name' => 'Staff',
            'email' => 'staff-sms-admin@test.com',
            'password' => Hash::make('password'),
            'role_id' => $emptyRole->id,
            'is_active' => true,
        ]);
    }

    public function test_editing_wording_changes_message_sms_service_sends(): void
    {
        Sanctum::actingAs($this->owner, ['staff']);

        $this->patchJson('/api/admin/sms/types/pos_send_bill', [
            'body' => 'Bill {{invoice_number}} total {{total}}. Pay: {{invoice_url}}',
        ])->assertOk();

        $this->assertDatabaseHas('audit_logs', ['action' => 'sms.type.wording.updated']);

        $body = app(CustomerSmsMessageBuilder::class)->build(
            CustomerSmsMessageBuilder::SLUG_SEND_BILL,
            [
                'invoice_number' => 'INV-9',
                'total' => '12.00',
                'invoice_url' => 'https://example.com/i/9',
            ],
            'FALLBACK_SHOULD_NOT_WIN',
        );

        $this->assertSame('Bill INV-9 total 12.00. Pay: https://example.com/i/9', $body);

        $log = app(SmsService::class)->send(new SmsMessage(
            to: '7771234',
            message: $body,
            type: 'pos_send_bill',
        ));
        $this->assertContains($log->status, ['sent', 'demo', 'queued']);
        $this->assertStringContainsString('INV-9', (string) $log->message);
    }

    public function test_unknown_merge_variable_does_not_crash_send(): void
    {
        Sanctum::actingAs($this->owner, ['staff']);
        $this->patchJson('/api/admin/sms/types/pos_send_bill', [
            'body' => 'Hello {{unknown_var}} order {{order_number}}',
        ])->assertOk();

        $rendered = app(CustomerSmsMessageBuilder::class)->build(
            CustomerSmsMessageBuilder::SLUG_SEND_BILL,
            ['order_number' => '55'],
            'fallback',
        );
        $this->assertStringContainsString('{{unknown_var}}', $rendered);
        $this->assertStringContainsString('55', $rendered);

        $log = app(SmsService::class)->send(new SmsMessage(
            to: '7771234',
            message: $rendered,
            type: 'pos_send_bill',
        ));
        $this->assertContains($log->status, ['sent', 'demo', 'queued', 'disabled']);
    }

    public function test_preview_estimate_matches_sms_service_estimate(): void
    {
        Sanctum::actingAs($this->owner, ['staff']);
        $body = 'Hi Aisha! Your Bake & Grill bill is ready. Amount MVR 128.50.';

        $res = $this->postJson('/api/admin/sms/types/pos_send_bill/preview', ['body' => $body])
            ->assertOk();

        $expected = app(SmsService::class)->estimate($res->json('preview'));
        $this->assertSame($expected['segments'], $res->json('estimate.segments'));
        $this->assertSame($expected['cost_mvr'], $res->json('estimate.cost_mvr'));
        $this->assertSame($expected['encoding'], $res->json('estimate.encoding'));
    }

    public function test_blank_template_falls_back_to_code_default(): void
    {
        Sanctum::actingAs($this->owner, ['staff']);
        $this->patchJson('/api/admin/sms/types/pos_send_bill', ['body' => ''])->assertOk();

        $fallback = 'Bill #X - MVR 1.00. View: https://x.test';
        $body = app(CustomerSmsMessageBuilder::class)->build(
            CustomerSmsMessageBuilder::SLUG_SEND_BILL,
            ['invoice_number' => 'X', 'total' => '1.00', 'invoice_url' => 'https://x.test'],
            $fallback,
        );
        $this->assertSame($fallback, $body);
    }

    public function test_user_without_send_permission_is_blocked_user_with_it_can_send(): void
    {
        $blocked = app(SmsService::class)->send(new SmsMessage(
            to: '7771234',
            message: 'Bill test',
            type: 'pos_send_bill',
            actingUserId: $this->staffNoPerm->id,
        ));
        $this->assertSame('disabled', $blocked->status);
        $this->assertStringContainsString('lacks send permission', (string) $blocked->error_message);

        $allowed = app(SmsService::class)->send(new SmsMessage(
            to: '7771234',
            message: 'Bill test owner',
            type: 'pos_send_bill',
            actingUserId: $this->owner->id,
        ));
        $this->assertContains($allowed->status, ['sent', 'demo', 'queued']);
    }

    public function test_system_initiated_sends_without_acting_user(): void
    {
        $otp = app(SmsService::class)->send(new SmsMessage(
            to: '7771234',
            message: 'Your Bake & Grill verification code is 123456. Valid for 10 minutes.',
            type: 'auth_customer_otp',
        ));
        $this->assertContains($otp->status, ['sent', 'demo', 'queued']);

        $system = app(SmsService::class)->send(new SmsMessage(
            to: '7771234',
            message: 'Order #1 confirmed',
            type: 'customer_payment_confirmed_pos',
        ));
        $this->assertContains($system->status, ['sent', 'demo', 'queued']);
    }

    public function test_registry_send_permission_matches_route_middleware_map(): void
    {
        // Defence-in-depth: user-initiated types with route guards must agree.
        $expected = [
            'pos_send_bill' => 'orders.send_sms_bill',
            'pos_send_pay_link' => 'orders.send_payment_link',
            'marketing_campaign' => 'sms.campaigns.send',
            'marketing_promotion' => 'sms.campaigns.send',
            'admin_direct' => 'sms.campaigns.send',
            'service_restoration' => 'service_availability.notify',
            'discount_approval_otp' => 'promotions.discounts',
        ];

        foreach ($expected as $typeKey => $perm) {
            $entry = SmsTypeRegistry::get($typeKey);
            $this->assertNotNull($entry, $typeKey);
            $this->assertSame(
                $perm,
                SmsTypeRegistry::effectiveSendPermission($entry),
                "Registry/middleware mismatch for {$typeKey}",
            );
            $this->assertTrue((bool) $entry['user_initiated'], $typeKey . ' should be user_initiated');
        }
    }

    public function test_over_budget_blocks_normal_type_but_not_always_on(): void
    {
        SiteSetting::set(SmsBudgetGate::MONTHLY_SEGMENTS_SETTING, '1');

        // Consume the single segment.
        app(SmsService::class)->send(new SmsMessage(
            to: '7771234',
            message: 'A',
            type: 'pos_send_bill',
        ));

        $blocked = app(SmsService::class)->send(new SmsMessage(
            to: '7771235',
            message: 'Second message that needs a segment',
            type: 'pos_send_bill',
        ));
        $this->assertSame('disabled', $blocked->status);
        $this->assertStringContainsString('monthly segment ceiling', (string) $blocked->error_message);

        $otp = app(SmsService::class)->send(new SmsMessage(
            to: '7771236',
            message: 'Your Bake & Grill verification code is 999999. Valid for 10 minutes.',
            type: 'auth_customer_otp',
        ));
        $this->assertContains($otp->status, ['sent', 'demo', 'queued']);
    }

    public function test_permission_and_budget_changes_audit(): void
    {
        Sanctum::actingAs($this->owner, ['staff']);

        $this->patchJson('/api/admin/sms/types/giftcard_delivery', [
            'send_permission' => 'orders.send_sms_bill',
        ])->assertOk();

        $this->assertTrue(
            AuditLog::where('action', 'sms.type.send_permission.updated')->exists(),
        );

        $this->patchJson('/api/admin/sms/budget', [
            'monthly_segment_ceiling' => 500,
            'per_campaign_segment_ceiling' => 100,
        ])->assertOk()
            ->assertJsonPath('budget.monthly_segment_ceiling', 500);

        $this->assertTrue(AuditLog::where('action', 'sms.budget.updated')->exists());
    }

    public function test_global_kill_switch_still_blocks_otp(): void
    {
        SiteSetting::set(SmsTypeRegistry::GLOBAL_KILL_SWITCH, 'true');

        $otp = app(SmsService::class)->send(new SmsMessage(
            to: '7771234',
            message: 'Your Bake & Grill verification code is 123456.',
            type: 'auth_customer_otp',
        ));
        $this->assertSame('disabled', $otp->status);
        $this->assertStringContainsString('master switch', (string) $otp->error_message);
    }

    public function test_control_center_exposes_recipients_budget_and_queue(): void
    {
        Sanctum::actingAs($this->owner, ['staff']);

        $res = $this->getJson('/api/admin/sms/control-center')->assertOk();
        $res->assertJsonStructure([
            'budget' => ['monthly_segment_ceiling', 'period_segments_used'],
            'campaign_queue' => ['running_campaigns', 'pending_recipients', 'failed_queue_jobs'],
            'permission_options',
            'types' => [['key', 'recipients', 'send_permission_label', 'sample_variables']],
        ]);

        $gift = collect($res->json('types'))->firstWhere('key', 'giftcard_delivery');
        $this->assertNotEmpty($gift['recipients']);

        $otp = collect($res->json('types'))->firstWhere('key', 'auth_customer_otp');
        $this->assertNull($otp['send_permission']);
        $this->assertStringContainsString('System-initiated', $otp['send_permission_label']);
    }
}
