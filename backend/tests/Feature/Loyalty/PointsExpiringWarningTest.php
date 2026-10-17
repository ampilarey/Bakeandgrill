<?php

declare(strict_types=1);

namespace Tests\Feature\Loyalty;

use App\Console\Commands\WarnExpiringLoyaltyPoints;
use App\Models\Customer;
use App\Models\LoyaltyAccount;
use App\Models\LoyaltyLedger;
use App\Models\SiteSetting;
use App\Models\SmsLog;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** A month before earned points expire, the customer hears once (iruali import plan, feature 13). */
class PointsExpiringWarningTest extends TestCase
{
    use RefreshDatabase;

    private Customer $customer;

    protected function setUp(): void
    {
        parent::setUp();
        SiteSetting::set('loyalty_points_expiry_days', '365');
        app(\App\Services\LoyaltySettingsService::class)->bustCache();
        $this->customer = Customer::create(['name' => 'Aisha', 'phone' => '+9607771111', 'is_active' => true]);
        LoyaltyAccount::create(['customer_id' => $this->customer->id, 'points_balance' => 150, 'points_held' => 0, 'lifetime_points' => 150, 'tier' => 'bronze']);
        $row = fn (int $points, string $expires, string $key) => LoyaltyLedger::create([
            'idempotency_key' => $key, 'customer_id' => $this->customer->id, 'type' => 'earn', 'points' => $points,
            'balance_after' => 0, 'occurred_at' => now(), 'expires_at' => $expires, 'expiry_processed' => false,
        ]);
        $row(120, now()->addDays(20)->toDateTimeString(), 'a');
        $row(80, now()->addDays(25)->toDateTimeString(), 'b');
        $row(50, now()->addDays(90)->toDateTimeString(), 'c');
    }

    public function test_the_customer_is_told_once_capped_by_the_balance(): void
    {
        Artisan::call('loyalty:warn-expiring');
        Artisan::call('loyalty:warn-expiring');

        $logs = SmsLog::query()->where('type', WarnExpiringLoyaltyPoints::TYPE)->get();
        $this->assertCount(1, $logs);
        $this->assertStringContainsString('150 of your points', (string) $logs->first()->message, 'never more than the balance');
        $this->assertStringContainsString(now()->addDays(20)->format('j M'), (string) $logs->first()->message);
        $this->assertSame(1, LoyaltyLedger::query()->whereNull('expiry_warned_at')->count(), 'the batch 90 days out is told later');
    }

    public function test_the_rewards_page_shows_what_expires_soon(): void
    {
        Sanctum::actingAs($this->customer, ['customer']);

        $this->getJson('/api/loyalty/me')->assertOk()
            ->assertJsonPath('expiring.points', 150)
            ->assertJsonPath('expiring.date', now()->addDays(20)->toDateString());
    }

    public function test_nothing_when_points_never_expire(): void
    {
        SiteSetting::set('loyalty_points_expiry_days', '0');
        app(\App\Services\LoyaltySettingsService::class)->bustCache();

        Artisan::call('loyalty:warn-expiring');

        $this->assertSame(0, SmsLog::query()->where('type', WarnExpiringLoyaltyPoints::TYPE)->count());
    }

    public function test_a_customer_who_said_no_offers_by_text_is_not_texted(): void
    {
        $this->customer->forceFill(['sms_opt_out' => true])->save();

        Artisan::call('loyalty:warn-expiring');

        $this->assertNotSame('sent', SmsLog::query()->where('type', WarnExpiringLoyaltyPoints::TYPE)->value('status'));
    }
}
