<?php

declare(strict_types=1);

namespace Tests\Feature\Marketing;

use App\Models\LoyaltyAccount;
use App\Models\LoyaltyLedger;
use App\Models\SiteSetting;
use App\Models\SmsLog;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class BirthdayOffersTest extends TestCase
{
    use RefreshDatabase;

    public function test_birthday_command_credits_points_and_sends_sms_once(): void
    {
        SiteSetting::set('marketing_birthday_enabled', '1');
        SiteSetting::set('marketing_birthday_points', '150');
        SiteSetting::bust();

        $today = now();
        $customer = $this->makeCustomer([
            'date_of_birth' => $today->copy()->subYears(30)->format('Y-m-d'),
            'sms_opt_out' => false,
        ]);
        LoyaltyAccount::create([
            'customer_id' => $customer->id,
            'points_balance' => 0,
            'points_held' => 0,
            'lifetime_points' => 0,
            'tier' => 'bronze',
        ]);

        $this->artisan('marketing:send-birthday-offers', ['--date' => $today->toDateString()])
            ->assertSuccessful();

        $account = LoyaltyAccount::where('customer_id', $customer->id)->first();
        $this->assertSame(150, (int) $account?->points_balance);

        $this->assertDatabaseHas('sms_logs', [
            'customer_id' => $customer->id,
            'type' => 'marketing_birthday',
            'idempotency_key' => "birthday-sms:{$customer->id}:{$today->format('Y')}",
        ]);

        $beforeSms = SmsLog::count();
        $beforeLedger = LoyaltyLedger::count();

        $this->artisan('marketing:send-birthday-offers', ['--date' => $today->toDateString()])
            ->assertSuccessful();

        $this->assertSame($beforeSms, SmsLog::count());
        $this->assertSame($beforeLedger, LoyaltyLedger::count());
    }

    public function test_birthday_command_skips_opted_out_customers(): void
    {
        SiteSetting::set('marketing_birthday_enabled', '1');
        SiteSetting::bust();

        $today = now();
        $customer = $this->makeCustomer([
            'date_of_birth' => $today->copy()->subYears(25)->format('Y-m-d'),
            'sms_opt_out' => true,
        ]);

        $this->artisan('marketing:send-birthday-offers', ['--date' => $today->toDateString()])
            ->assertSuccessful();

        $this->assertDatabaseMissing('sms_logs', [
            'customer_id' => $customer->id,
            'reference_type' => 'birthday_offer',
        ]);
    }

    public function test_customer_can_save_date_of_birth_on_profile(): void
    {
        $customer = $this->makeCustomer();
        Sanctum::actingAs($customer, ['customer']);

        $this->patchJson('/api/customer/profile', [
            'date_of_birth' => '1995-06-15',
        ])
            ->assertOk()
            ->assertJsonPath('customer.date_of_birth', '1995-06-15');

        $this->getJson('/api/customer/me', $this->customerHeaders($customer->fresh()))
            ->assertOk()
            ->assertJsonPath('customer.date_of_birth', '1995-06-15');
    }
}
