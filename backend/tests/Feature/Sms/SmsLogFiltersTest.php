<?php

declare(strict_types=1);

namespace Tests\Feature\Sms;

use App\Domains\Notifications\Contracts\SmsProviderInterface;
use App\Domains\Notifications\Support\SmsDeliveryRules;
use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Customer;
use App\Models\SmsCampaign;
use App\Models\SmsLog;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Mockery;
use Tests\TestCase;

/**
 * SMS audit, 2026-09-24: the log filters by what is really stored,
 * searches, totals up, exports, and is pruned to the retention set by
 * the owner; a campaign given a send time actually goes.
 */
class SmsLogFiltersTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();
        Sanctum::actingAs($this->makeOwner(), ['staff']);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function row(array $over = []): SmsLog
    {
        return SmsLog::create(array_merge([
            'message' => 'Hello', 'to' => '+9607000001', 'type' => 'marketing_campaign', 'status' => 'sent',
            'encoding' => 'gsm7', 'segments' => 1, 'cost_estimate_mvr' => 0.25, 'provider' => 'dhiraagu',
        ], $over));
    }

    public function test_filters_match_the_real_types_and_their_old_names(): void
    {
        $aisha = Customer::create(['name' => 'Aisha Ali', 'phone' => '+9607000002', 'loyalty_points' => 0, 'tier' => 'bronze', 'is_active' => true]);
        $this->row(['type' => 'auth_customer_otp', 'message' => 'code', 'to' => '+9607000009']);
        $this->row(['type' => 'otp', 'message' => 'old row', 'to' => '+9607000009']);
        $this->row(['type' => 'customer_order_ready', 'message' => '#1042 is ready', 'to' => '+9607000002', 'customer_id' => $aisha->id]);
        $this->row(['type' => 'transactional', 'message' => 'legacy ready', 'to' => '+9607000002']);
        $campaign = SmsCampaign::create(['name' => 'Friday', 'message' => 'Friday deal', 'status' => 'running', 'target_criteria' => []]);
        $this->row(['type' => 'marketing_campaign', 'status' => 'deferred', 'message' => 'Friday deal', 'error_message' => 'Quiet hours', 'campaign_id' => $campaign->id, 'segments' => 2, 'cost_estimate_mvr' => 0.5]);

        $this->assertSame(2, $this->getJson('/api/admin/sms/logs?type=auth_customer_otp')->assertOk()->json('totals.count'), 'new key finds the old rows too');
        $this->assertSame(2, $this->getJson('/api/admin/sms/logs?type=otp')->json('totals.count'), 'and the old name still works');
        $this->assertSame(2, $this->getJson('/api/admin/sms/logs?category=transactional')->json('totals.count'));
        $this->assertSame(1, $this->getJson('/api/admin/sms/logs?status=deferred')->json('totals.count'));
        $this->assertSame(1, $this->getJson('/api/admin/sms/logs?campaign_id=' . $campaign->id)->json('totals.count'));

        $res = $this->getJson('/api/admin/sms/logs?q=Aisha')->assertOk();
        $this->assertSame(1, $res->json('totals.count'), 'search by customer name');
        $this->assertSame('Order ready', $res->json('data.0.type_label'));
        $this->assertSame('Aisha Ali', $res->json('data.0.customer_name'));
        $this->assertSame(2, $this->getJson('/api/admin/sms/logs?q=7000002')->json('totals.count'), 'search by number');
        $this->assertSame(1, $this->getJson('/api/admin/sms/logs?q=Friday')->json('totals.count'), 'search by message');

        $all = $this->getJson('/api/admin/sms/logs')->assertOk();
        $this->assertSame(5, $all->json('totals.count'));
        $this->assertSame(6, $all->json('totals.segments'));
        $this->assertSame(1.5, $all->json('totals.cost_mvr'));
        $this->assertSame(4, $all->json('totals.by_status.sent'));
        $this->assertSame('[redacted]', collect($all->json('data'))->firstWhere('type', 'otp')['message']);
        $this->assertNotEmpty($all->json('types'));
        $this->getJson('/api/admin/sms/logs?status=nope')->assertStatus(422);
    }

    public function test_date_range_and_csv_export(): void
    {
        Carbon::setTestNow('2026-09-24 12:00:00');
        $this->row(['message' => 'today']);
        $old = $this->row(['message' => 'last month']);
        SmsLog::whereKey($old->id)->update(['created_at' => '2026-08-01 10:00:00']);

        $this->assertSame(1, $this->getJson('/api/admin/sms/logs?from=2026-09-01&to=2026-09-30')->json('totals.count'));
        $this->assertSame(1, $this->getJson('/api/admin/sms/logs?to=2026-08-31')->json('totals.count'));

        $csv = $this->get('/api/admin/sms/logs/export?from=2026-09-01');
        $csv->assertOk();
        $this->assertStringContainsString('text/csv', (string) $csv->headers->get('content-type'));
        $body = $csv->streamedContent();
        $this->assertStringContainsString('"Sent at","Created at",To,Customer,Type,Category,Status', $body);
        $this->assertStringContainsString('+9607000001,,"Bulk campaign",marketing,sent,1,0.25', $body);
        $this->assertStringNotContainsString('last month', $body);
    }

    public function test_logs_are_pruned_to_the_retention_setting(): void
    {
        Carbon::setTestNow('2026-09-24 12:00:00');
        $this->row(['message' => 'fresh']);
        $old = $this->row(['message' => 'ancient']);
        SmsLog::whereKey($old->id)->update(['created_at' => '2025-01-01 10:00:00']);

        SmsDeliveryRules::update(['log_retention_days' => 0]);
        $this->artisan('sms:prune-logs')->expectsOutputToContain('retention is off')->assertSuccessful();
        $this->assertSame(2, SmsLog::count());

        $this->patchJson('/api/admin/sms/delivery-rules', ['log_retention_days' => 365])->assertOk()->assertJsonPath('delivery_rules.log_retention_days', 365);
        $this->artisan('sms:prune-logs')->expectsOutputToContain('Pruned 1 SMS log row(s) older than 365 days.')->assertSuccessful();
        $this->assertSame('fresh', SmsLog::firstOrFail()->message);
    }

    public function test_a_campaign_with_a_send_time_goes_when_the_time_comes(): void
    {
        $provider = Mockery::mock(SmsProviderInterface::class);
        $provider->shouldReceive('send')->once()->andReturn([true, ['ok' => true], null]);
        $this->app->instance(SmsProviderInterface::class, $provider);
        Customer::create(['name' => 'Ibrahim', 'phone' => '+9607000003', 'loyalty_points' => 0, 'tier' => 'bronze', 'is_active' => true, 'sms_opt_out' => false]);
        Carbon::setTestNow('2026-09-24 12:00:00');

        $this->postJson('/api/admin/sms/campaigns', ['name' => 'Later', 'message' => 'Weekend deal', 'scheduled_at' => '2026-09-24 18:00:00'])->assertCreated();
        $campaign = SmsCampaign::firstOrFail();

        $this->artisan('sms:dispatch-scheduled')->assertSuccessful();
        $this->assertSame('draft', $campaign->fresh()->status, 'not yet');

        Carbon::setTestNow('2026-09-24 18:01:00');
        $this->artisan('sms:dispatch-scheduled')->expectsOutputToContain('Started 1 scheduled campaign(s).')->assertSuccessful();
        $this->assertNotSame('draft', $campaign->fresh()->status);
        $this->assertSame(1, $campaign->fresh()->total_recipients);
        $this->assertSame(1, SmsLog::where('campaign_id', $campaign->id)->where('status', 'sent')->count());
    }
}
