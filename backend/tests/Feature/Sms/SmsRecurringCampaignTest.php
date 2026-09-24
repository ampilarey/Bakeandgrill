<?php

declare(strict_types=1);

namespace Tests\Feature\Sms;

use App\Domains\Notifications\Contracts\SmsProviderInterface;
use App\Domains\Permissions\PermissionCatalogSync;
use App\Domains\Sms\Services\SmsSchedulerService;
use App\Models\Customer;
use App\Models\Order;
use App\Models\SmsCampaign;
use App\Models\SmsCampaignSchedule;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Mockery;
use Tests\TestCase;

/**
 * SMS audit follow-up, 2026-09-24: a recipe on a schedule. "We miss you"
 * every Monday to whoever is dormant, and nobody hears it twice inside
 * the cooldown.
 */
class SmsRecurringCampaignTest extends TestCase
{
    use RefreshDatabase;

    /** @var array<int, string> phone => message */
    private array $sent = [];

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();
        $provider = Mockery::mock(SmsProviderInterface::class);
        $provider->shouldReceive('send')->andReturnUsing(function (string $to, string $message) {
            $this->sent[] = $to;

            return [true, ['ok' => true], null];
        });
        $this->app->instance(SmsProviderInterface::class, $provider);
        config(['app.timezone' => 'Indian/Maldives']);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function dormant(string $name, string $phone, int $daysAgo): Customer
    {
        $c = Customer::create(['name' => $name, 'phone' => $phone, 'loyalty_points' => 0, 'tier' => 'bronze', 'is_active' => true, 'sms_opt_out' => false]);
        Order::factory()->create(['customer_id' => $c->id, 'status' => 'completed', 'paid_at' => now()->subDays($daysAgo), 'total' => 100, 'subtotal' => 100, 'tax_amount' => 0, 'total_laar' => 10000]);

        return $c;
    }

    public function test_next_run_follows_the_timetable(): void
    {
        $weekly = new SmsCampaignSchedule(['frequency' => 'weekly', 'days_of_week' => ['mon', 'thu'], 'send_time' => '10:00']);
        // Wednesday 2026-09-23 09:00 Maldives → Thursday 24th 10:00
        $this->assertSame('2026-09-24 10:00', $weekly->computeNextRunAt(Carbon::parse('2026-09-23 09:00', 'Indian/Maldives'))->format('Y-m-d H:i'));
        // Thursday 10:00 exactly → next Monday
        $this->assertSame('2026-09-28 10:00', $weekly->computeNextRunAt(Carbon::parse('2026-09-24 10:00', 'Indian/Maldives'))->format('Y-m-d H:i'));

        $daily = new SmsCampaignSchedule(['frequency' => 'daily', 'send_time' => '18:30']);
        $this->assertSame('2026-09-23 18:30', $daily->computeNextRunAt(Carbon::parse('2026-09-23 09:00', 'Indian/Maldives'))->format('Y-m-d H:i'));

        $monthly = new SmsCampaignSchedule(['frequency' => 'monthly', 'day_of_month' => 31, 'send_time' => '09:00']);
        $this->assertSame('2026-09-30 09:00', $monthly->computeNextRunAt(Carbon::parse('2026-09-23 09:00', 'Indian/Maldives'))->format('Y-m-d H:i'), 'a short month uses its last day');
        $this->assertSame('2026-10-31 09:00', $monthly->computeNextRunAt(Carbon::parse('2026-09-30 09:00', 'Indian/Maldives'))->format('Y-m-d H:i'));
        $this->assertSame('Every Mon and Thu at 10:00', $weekly->describeSchedule());
    }

    public function test_a_due_schedule_runs_once_and_the_cooldown_skips_recent_recipients(): void
    {
        Sanctum::actingAs($this->makeOwner(), ['staff']);
        $gasim = $this->dormant('Gasim', '+9607700001', 45);
        $this->dormant('Rania', '+9607700002', 5); // not dormant

        Carbon::setTestNow(Carbon::parse('2026-09-23 09:00', 'Indian/Maldives'));
        $this->postJson('/api/admin/sms/campaign-schedules', [
            'name' => 'We miss you', 'message' => 'Hi {name}, come back', 'frequency' => 'weekly', 'days_of_week' => ['thu'], 'send_time' => '10:00',
            'cooldown_days' => 30, 'target_criteria' => ['dormant_days' => 30],
        ])->assertCreated()
            ->assertJsonPath('schedule.next_run_at', Carbon::parse('2026-09-24 10:00', 'Indian/Maldives')->toIso8601String())
            ->assertJsonPath('schedule.audience_summary', 'No order for 30+ days')
            ->assertJsonPath('schedule.schedule_summary', 'Every Thu at 10:00');
        $schedule = SmsCampaignSchedule::firstOrFail();

        // Not due yet.
        $this->assertSame(0, app(SmsSchedulerService::class)->runDueCampaignSchedules(Carbon::now()));

        Carbon::setTestNow(Carbon::parse('2026-09-24 10:00:30', 'Indian/Maldives'));
        $this->artisan('sms:dispatch-scheduled')->assertSuccessful();
        $this->assertSame(['+9607700001'], $this->sent, 'only the dormant customer');
        $run = SmsCampaign::where('schedule_id', $schedule->id)->firstOrFail();
        $this->assertSame('We miss you · 24 Sep', $run->name);
        $this->assertSame(['dormant_days' => 30, 'schedule_id' => $schedule->id, 'cooldown_days' => 30], $run->target_criteria);
        $this->assertSame(1, $run->total_recipients);
        $fresh = $schedule->fresh();
        $this->assertSame(1, $fresh->runs_count);
        $this->assertSame('2026-10-01 10:00', $fresh->next_run_at->setTimezone('Indian/Maldives')->format('Y-m-d H:i'));

        // A second tick in the same minute does nothing.
        $this->assertSame(0, app(SmsSchedulerService::class)->runDueCampaignSchedules(Carbon::now()));

        // Next week: Gasim is inside the cooldown, so nobody is texted and the run is a cancelled campaign, not an error.
        Carbon::setTestNow(Carbon::parse('2026-10-01 10:00:30', 'Indian/Maldives'));
        $this->assertSame(1, app(SmsSchedulerService::class)->runDueCampaignSchedules(Carbon::now()));
        $this->assertCount(1, $this->sent);
        $second = SmsCampaign::where('schedule_id', $schedule->id)->orderByDesc('id')->firstOrFail();
        $this->assertSame('cancelled', $second->status);
        $this->assertStringContainsString('No eligible recipients', (string) $second->notes);

        // After the cooldown Gasim is back in, and by now Rania has gone quiet too.
        Carbon::setTestNow(Carbon::parse('2026-10-29 10:00:30', 'Indian/Maldives'));
        $this->assertSame(1, app(SmsSchedulerService::class)->runDueCampaignSchedules(Carbon::now()));
        $this->assertSame(['+9607700001', '+9607700001', '+9607700002'], $this->sent);

        $list = $this->getJson('/api/admin/sms/campaign-schedules')->assertOk();
        $this->assertSame(3, $list->json('schedules.0.campaigns_count'));
        $this->assertSame('completed', $list->json('schedules.0.last_campaign.status'), 'sync queue in tests');

        $this->patchJson("/api/admin/sms/campaign-schedules/{$schedule->id}", ['is_active' => false])->assertOk()->assertJsonPath('schedule.next_run_at', null);
        $this->postJson("/api/admin/sms/campaign-schedules/{$schedule->id}/run")->assertStatus(422); // Gasim just got one
        $this->deleteJson("/api/admin/sms/campaign-schedules/{$schedule->id}")->assertOk();
        $this->assertNull(SmsCampaign::find($run->id)->schedule_id, 'past runs stay, unlinked');
        $this->assertNotNull($gasim->fresh());
    }

    public function test_the_campaign_list_and_the_control_center_see_the_run(): void
    {
        Sanctum::actingAs($this->makeOwner(), ['staff']);
        $this->dormant('Gasim', '+9607700001', 45);
        $schedule = SmsCampaignSchedule::create(['name' => 'Win back', 'message' => 'Hi', 'target_criteria' => ['dormant_days' => 30], 'frequency' => 'daily', 'send_time' => '10:00', 'cooldown_days' => 30]);
        $this->postJson("/api/admin/sms/campaign-schedules/{$schedule->id}/run")->assertOk()->assertJsonPath('campaign.total_recipients', 1);
        $this->getJson('/api/admin/sms/campaigns')->assertOk()
            ->assertJsonPath('data.0.schedule_id', $schedule->id)
            ->assertJsonPath('data.0.audience_summary', 'No order for 30+ days · Not texted by this schedule in 30 days');
        $this->postJson('/api/admin/sms/campaign-schedules', ['name' => 'Bad', 'message' => 'x', 'frequency' => 'hourly', 'send_time' => '10:00'])->assertStatus(422);
        $this->postJson('/api/admin/sms/campaign-schedules', ['name' => 'Bad', 'message' => 'x', 'frequency' => 'daily', 'send_time' => '25:00'])->assertStatus(422);
    }
}
