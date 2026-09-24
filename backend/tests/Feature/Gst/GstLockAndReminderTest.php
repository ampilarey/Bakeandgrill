<?php

declare(strict_types=1);

namespace Tests\Feature\Gst;

use App\Domains\Gst\Services\GstPeriodService;
use App\Domains\Gst\Services\GstReconciliationService;
use App\Domains\Gst\Services\GstSettingsService;
use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\GstPeriodLock;
use App\Models\GstSetting;
use App\Models\Order;
use App\Models\Refund;
use App\Models\SmsLog;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * GST audit, 2026-09-26: locking is filing. A period with open warnings
 * needs a reason to lock, a refund whose GST was never posted is a warning,
 * and the owners hear when a return is due and the period is still open.
 */
class GstLockAndReminderTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow('2026-09-10 10:00:00');
        PermissionCatalogSync::sync();
        $this->owner = $this->makeOwner(['name' => 'Owner', 'phone' => '+9607770001']);
        Sanctum::actingAs($this->owner, ['staff']);
        app(GstSettingsService::class)->get();
        GstSetting::query()->update(['gst_registered' => true, 'taxable_period' => 'monthly']);
        app(GstSettingsService::class)->bust();
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private $owner;

    /** A paid, taxed order in August with no ledger entry: one warning. */
    private function unpostedOrder(): Order
    {
        return Order::factory()->create([
            'status' => 'completed',
            'paid_at' => '2026-08-12 12:00:00',
            'subtotal' => 100, 'subtotal_laar' => 10000,
            'tax_amount' => 8, 'tax_laar' => 800,
            'total' => 108, 'total_laar' => 10800,
        ]);
    }

    /** An approved refund on a taxed sale, with no GST entry. */
    private function unpostedRefund(string $by): Refund
    {
        $order = Order::factory()->create([
            'status' => 'partially_refunded',
            'subtotal' => 100, 'subtotal_laar' => 10000,
            'tax_amount' => 8, 'tax_laar' => 800,
            'total' => 108, 'total_laar' => 10800,
        ]);
        $refund = new Refund;
        $refund->forceFill([
            'order_id' => $order->id, 'amount' => 20, 'status' => 'approved',
            'reason' => 'test', 'initiated_by' => $by, 'approved_at' => '2026-08-20 10:00:00',
        ])->save();

        return $refund;
    }

    public function test_a_period_with_warnings_needs_a_reason_to_lock(): void
    {
        $this->unpostedOrder();

        $this->postJson('/api/reports/finance/gst/periods/2026-08/lock')
            ->assertStatus(422)
            ->assertJsonPath('needs_reason', true)
            ->assertJsonPath('warnings.0.type', 'unposted_order');
        $this->assertFalse(app(GstPeriodService::class)->isLocked('2026-08'));

        $this->postJson('/api/reports/finance/gst/periods/2026-08/lock', ['reason' => 'ok'])->assertStatus(422);

        $this->postJson('/api/reports/finance/gst/periods/2026-08/lock', ['reason' => 'Posted by hand in the return'])
            ->assertOk();
        $this->assertSame('Posted by hand in the return', GstPeriodLock::where('period_key', '2026-08')->value('lock_note'));
    }

    public function test_a_clean_period_locks_without_a_reason(): void
    {
        $res = $this->postJson('/api/reports/finance/gst/periods/2026-08/lock');
        $res->assertOk();
        $this->assertTrue(app(GstPeriodService::class)->isLocked('2026-08'));
    }

    public function test_a_refund_with_no_gst_entry_is_a_warning_unless_it_is_a_late_payment_return(): void
    {
        $this->unpostedRefund('staff');
        $this->unpostedRefund('system');

        $types = collect(app(GstReconciliationService::class)->warnings('2026-08'))->where('type', 'unposted_refund');

        $this->assertCount(1, $types);
    }

    private function remind(): void
    {
        $this->artisan('gst:filing-reminder')->assertSuccessful();
    }

    public function test_owners_are_reminded_ahead_on_the_day_and_after(): void
    {
        GstSetting::query()->update(['filing_due_day' => 28, 'filing_reminder_days' => 3]);
        app(GstSettingsService::class)->bust();

        foreach (['2026-09-24', '2026-09-26', '2026-09-27'] as $quiet) {
            Carbon::setTestNow($quiet . ' 09:00:00');
            $this->remind();
        }
        $this->assertSame(0, SmsLog::where('type', 'owner_gst_filing_due')->count());

        Carbon::setTestNow('2026-09-25 09:00:00');
        $this->remind();
        $this->remind();
        $sent = SmsLog::where('type', 'owner_gst_filing_due')->get();
        $this->assertCount(1, $sent);
        $this->assertStringContainsString('2026-08 is due on 28 Sep', $sent->first()->message);

        Carbon::setTestNow('2026-09-28 09:00:00');
        $this->remind();
        Carbon::setTestNow('2026-09-29 09:00:00');
        $this->remind();
        Carbon::setTestNow('2026-09-30 09:00:00');
        $this->remind();
        $this->assertSame(3, SmsLog::where('type', 'owner_gst_filing_due')->count());
    }

    public function test_no_reminder_once_locked_or_when_switched_off(): void
    {
        Carbon::setTestNow('2026-09-28 09:00:00');
        GstSetting::query()->update(['filing_reminder_days' => 0]);
        app(GstSettingsService::class)->bust();
        $this->remind();

        GstSetting::query()->update(['filing_reminder_days' => 3]);
        app(GstSettingsService::class)->bust();
        app(GstPeriodService::class)->lock('2026-08', $this->owner->id);
        $this->remind();

        $this->assertSame(0, SmsLog::where('type', 'owner_gst_filing_due')->count());
    }

    public function test_exporting_again_keeps_the_carried_forward_input_tax(): void
    {
        GstSetting::query()->update(['lock_after_export' => true, 'seller_tin' => '1000001GST501', 'taxable_activity_no' => '001']);
        app(GstSettingsService::class)->bust();
        app(GstPeriodService::class)->lock('2026-08', $this->owner->id, 5000);

        $this->get('/api/reports/finance/gst/export/output-statement.xlsx?period=2026-08')->assertOk();

        $this->assertSame(5000, (int) GstPeriodLock::where('period_key', '2026-08')->value('carry_forward_input_laar'));
    }

    public function test_export_does_not_lock_past_open_warnings(): void
    {
        GstSetting::query()->update(['lock_after_export' => true, 'seller_tin' => '1000001GST501', 'taxable_activity_no' => '001']);
        app(GstSettingsService::class)->bust();
        $this->unpostedRefund('staff');

        $this->get('/api/reports/finance/gst/export/output-statement.xlsx?period=2026-08')->assertOk();

        $this->assertFalse(app(GstPeriodService::class)->isLocked('2026-08'));
    }

    public function test_the_settings_save_and_come_back(): void
    {
        $this->putJson('/api/admin/gst/settings', ['filing_due_day' => 20, 'filing_reminder_days' => 5])->assertOk();

        $this->getJson('/api/admin/gst/settings')
            ->assertJsonPath('settings.filing_due_day', 20)
            ->assertJsonPath('settings.filing_reminder_days', 5);

        $this->putJson('/api/admin/gst/settings', ['filing_due_day' => 31])->assertStatus(422);
    }
}
