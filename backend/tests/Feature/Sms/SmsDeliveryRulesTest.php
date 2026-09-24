<?php

declare(strict_types=1);

namespace Tests\Feature\Sms;

use App\Domains\Notifications\Contracts\SmsProviderInterface;
use App\Domains\Notifications\DTOs\SmsMessage;
use App\Domains\Notifications\Services\SmsService;
use App\Domains\Notifications\Support\SmsDeliveryRules;
use App\Domains\Notifications\Support\SmsTypeRegistry;
use App\Models\InventoryItem;
use App\Models\SiteSetting;
use App\Models\SmsCampaign;
use App\Models\SmsCampaignRecipient;
use App\Models\SmsLog;
use App\Support\OwnerPhones;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Mockery;
use Tests\TestCase;

/**
 * SMS audit, 2026-09-24: every sender is a registered type; owner alerts
 * go where the Control Center says; quiet hours hold marketing back and
 * release it; one number gets at most N marketing texts a day.
 */
class SmsDeliveryRulesTest extends TestCase
{
    use RefreshDatabase;

    private SmsProviderInterface $provider;

    protected function setUp(): void
    {
        parent::setUp();
        $this->provider = Mockery::mock(SmsProviderInterface::class);
        $this->app->instance(SmsProviderInterface::class, $this->provider);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function sendsOk(int $times = 1): void
    {
        $this->provider->shouldReceive('send')->times($times)->andReturn([true, ['ok' => true], null]);
    }

    // ── Every sender is registered ───────────────────────────────────────────

    public function test_every_sms_type_string_in_the_code_is_a_registered_type(): void
    {
        $files = new \RecursiveIteratorIterator(new \RecursiveDirectoryIterator(app_path()));
        $unregistered = [];
        foreach ($files as $file) {
            if (!$file->isFile() || $file->getExtension() !== 'php' || str_ends_with($file->getPathname(), 'SmsTypeRegistry.php')) {
                continue;
            }
            $src = (string) file_get_contents($file->getPathname());
            if (!str_contains($src, 'SmsMessage(')) {
                continue;
            }
            preg_match_all('/SmsMessage\((.*?)\)\);/s', $src, $blocks);
            foreach ($blocks[1] as $block) {
                if (preg_match("/type:\s*'([^']+)'/", $block, $m) !== 1) {
                    continue; // dynamic type: covered by the resolver
                }
                $key = $m[1];
                if (SmsTypeRegistry::get($key) === null && !array_key_exists($key, ['otp' => 1, 'campaign' => 1, 'promotion' => 1, 'staff_password_reset' => 1])) {
                    $unregistered[] = basename($file->getPathname()) . ': ' . $key;
                }
            }
        }

        $this->assertSame([], $unregistered, 'A sender uses a type the Control Center does not know: ' . implode(', ', $unregistered));
    }

    public function test_a_registered_owner_alert_can_be_switched_off_in_the_control_center(): void
    {
        SiteSetting::set('sms_owner_stock_reorder_enabled', 'false');
        SiteSetting::set('ops_inventory_reorder_alert_sms', '1');
        $this->makeOwner(['phone' => '9607771234']);
        InventoryItem::create(['name' => 'Flour', 'sku' => 'F1', 'unit' => 'kg', 'current_stock' => 1, 'reorder_point' => 5, 'unit_cost' => 4, 'is_active' => true]);
        $this->provider->shouldNotReceive('send');

        $this->artisan('inventory:check-reorder')->assertSuccessful();

        $log = SmsLog::where('type', 'owner_stock_reorder')->firstOrFail();
        $this->assertSame('disabled', $log->status);
    }

    // ── Recipients ───────────────────────────────────────────────────────────

    public function test_owner_alerts_go_where_the_control_center_says(): void
    {
        $owner = $this->makeOwner(['phone' => '9607770001']);
        $manager = $this->makeManager(['phone' => '9607770002']);
        $cashier = $this->makeStaff('cashier', ['phone' => '9607770003']);
        SiteSetting::set('business_phone', '+9607770009');
        SiteSetting::bust();

        $this->assertEquals(['9607770001', '9607770002'], OwnerPhones::for('owner_stock_reorder')->all(), 'default: owners & managers');
        $this->assertEquals(['+9607770009'], OwnerPhones::for('owner_device_approval')->all(), 'default: business phone');

        SmsTypeRegistry::setRecipientOverride('owner_stock_reorder', ['mode' => 'owner_only']);
        $this->assertEquals(['9607770001'], OwnerPhones::for('owner_stock_reorder')->all());

        SmsTypeRegistry::setRecipientOverride('owner_stock_reorder', ['mode' => 'staff', 'user_ids' => [$cashier->id, $manager->id]]);
        $this->assertEqualsCanonicalizing(['9607770003', '9607770002'], OwnerPhones::for('owner_stock_reorder')->all());

        SmsTypeRegistry::setRecipientOverride('owner_stock_reorder', ['mode' => 'custom', 'phones' => ['7770004', '+9607770005']]);
        $this->assertEquals(['+9607770004', '+9607770005'], OwnerPhones::for('owner_stock_reorder')->all());

        SmsTypeRegistry::setRecipientOverride('owner_device_approval', ['mode' => 'owners_managers']);
        $this->assertEquals(['9607770001', '9607770002'], OwnerPhones::for('owner_device_approval')->all());

        // A choice that resolves to nobody falls back to the owners rather than going silent.
        $cashier->update(['phone' => null]);
        SmsTypeRegistry::setRecipientOverride('owner_stock_reorder', ['mode' => 'staff', 'user_ids' => [$cashier->id]]);
        $this->assertEquals(['9607770001', '9607770002'], OwnerPhones::for('owner_stock_reorder')->all());
        unset($owner);
    }

    public function test_the_reorder_digest_uses_the_chosen_recipients(): void
    {
        $this->makeOwner(['phone' => '9607770001']);
        SiteSetting::set('ops_inventory_reorder_alert_sms', '1');
        SmsTypeRegistry::setRecipientOverride('owner_stock_reorder', ['mode' => 'custom', 'phones' => ['7779999']]);
        InventoryItem::create(['name' => 'Flour', 'sku' => 'F2', 'unit' => 'kg', 'current_stock' => 1, 'reorder_point' => 5, 'unit_cost' => 4, 'is_active' => true]);
        $this->sendsOk();

        $this->artisan('inventory:check-reorder')->assertSuccessful();

        $this->assertSame(['+9607779999'], SmsLog::where('type', 'owner_stock_reorder')->pluck('to')->all());
    }

    public function test_recipients_are_set_through_the_control_center_and_only_for_owner_alerts(): void
    {
        $staff = $this->makeManager(['phone' => '9607770002']);
        Sanctum::actingAs($this->makeOwner(['phone' => '9607770001']), ['staff']);

        $res = $this->getJson('/api/admin/sms/control-center')->assertOk();
        $row = collect($res->json('types'))->firstWhere('key', 'owner_stock_reorder');
        $this->assertTrue($row['recipients_configurable']);
        $this->assertSame('owners_managers', $row['recipients_config']['mode']);
        $this->assertContains('9607770001', $row['recipients_resolved']);
        $this->assertSame('business_phone', collect($res->json('types'))->firstWhere('key', 'owner_device_approval')['default_recipient_mode']);
        $this->assertFalse(collect($res->json('types'))->firstWhere('key', 'customer_order_ready')['recipients_configurable']);
        $this->assertNotEmpty($res->json('staff_options'));
        $this->assertSame(1, $res->json('delivery_rules.marketing_daily_cap'));

        $this->patchJson('/api/admin/sms/types/owner_stock_reorder', ['recipients' => ['mode' => 'staff', 'user_ids' => [$staff->id]]])
            ->assertOk()->assertJsonPath('recipients_resolved.0', '9607770002');
        $this->patchJson('/api/admin/sms/types/owner_stock_reorder', ['recipients' => ['mode' => 'staff', 'user_ids' => []]])->assertStatus(422);
        $this->patchJson('/api/admin/sms/types/owner_stock_reorder', ['recipients' => ['mode' => 'custom', 'phones' => ['12']]])->assertStatus(422);
        $this->patchJson('/api/admin/sms/types/customer_order_ready', ['recipients' => ['mode' => 'owner_only']])->assertStatus(422);
        $this->patchJson('/api/admin/sms/types/owner_stock_reorder', ['recipients' => null])->assertOk()
            ->assertJsonPath('recipients_config.mode', 'owners_managers');
    }

    // ── Quiet hours ──────────────────────────────────────────────────────────

    public function test_quiet_hours_hold_marketing_and_release_it_later_but_never_a_login_code(): void
    {
        Sanctum::actingAs($this->makeOwner(['phone' => '9607770001']), ['staff']);
        $this->patchJson('/api/admin/sms/delivery-rules', ['quiet_hours_enabled' => true, 'quiet_hours_start' => '22:00', 'quiet_hours_end' => '08:00'])
            ->assertOk()->assertJsonPath('delivery_rules.quiet_hours_end', '08:00');
        $this->patchJson('/api/admin/sms/delivery-rules', ['quiet_hours_start' => '25:00'])->assertStatus(422);

        Carbon::setTestNow('2026-09-24 23:15:00');
        $this->assertTrue(SmsDeliveryRules::inQuietHours());
        $sms = app(SmsService::class);
        $this->sendsOk(2); // the OTP now, the promotion after release

        $otp = $sms->send(new SmsMessage(to: '+9607654321', message: 'Code 123456', type: 'auth_customer_otp'));
        $this->assertSame('sent', $otp->status, 'login codes are never held');

        $promo = $sms->send(new SmsMessage(to: '+9607654321', message: 'Friday deal!', type: 'marketing_promotion', idempotencyKey: 'promo-test:1'));
        $this->assertSame('deferred', $promo->status);
        $this->assertStringContainsString('will send at 08:00', (string) $promo->error_message);

        $alert = $sms->send(new SmsMessage(to: '+9607770001', message: 'Stock low', type: 'owner_stock_reorder'));
        $this->assertSame('sent', $alert->status, 'owner alerts go through unless the alerts switch is on');
        $this->provider->shouldReceive('send')->once()->andReturn([true, ['ok' => true], null]);

        $this->artisan('sms:release-deferred')->expectsOutputToContain('Quiet hours: nothing released.')->assertSuccessful();

        Carbon::setTestNow('2026-09-25 08:05:00');
        $this->artisan('sms:release-deferred')->expectsOutputToContain('Released 1 deferred SMS; 1 sent.')->assertSuccessful();
        $this->assertSame('sent', $promo->fresh()->status);
        $this->assertSame(3, SmsLog::count(), 'the held row was sent in place, not duplicated');
    }

    public function test_quiet_hours_can_hold_owner_alerts_too_and_a_campaign_recipient_is_marked_when_released(): void
    {
        SmsDeliveryRules::update(['quiet_hours_enabled' => true, 'quiet_hours_start' => '22:00', 'quiet_hours_end' => '08:00', 'quiet_hours_alerts' => true]);
        Carbon::setTestNow('2026-09-24 23:15:00');
        $sms = app(SmsService::class);

        $alert = $sms->send(new SmsMessage(to: '+9607770001', message: 'Stock low', type: 'owner_stock_reorder'));
        $this->assertSame('deferred', $alert->status);

        $campaign = SmsCampaign::create(['name' => 'Night', 'message' => 'Late offer', 'status' => 'running', 'target_criteria' => [], 'total_recipients' => 1]);
        $recipient = SmsCampaignRecipient::create(['campaign_id' => $campaign->id, 'phone' => '+9607654321', 'variant' => 'a', 'status' => 'pending']);
        $log = $sms->send(new SmsMessage(to: '+9607654321', message: 'Late offer', type: 'marketing_campaign', campaignId: $campaign->id, idempotencyKey: "campaign:{$campaign->id}:recipient:{$recipient->id}"));
        $this->assertSame('deferred', $log->status);

        Carbon::setTestNow('2026-09-25 08:05:00');
        $this->sendsOk(2);
        $this->artisan('sms:release-deferred')->assertSuccessful();
        $this->assertSame('sent', $recipient->fresh()->status);
        $this->assertSame('sent', $alert->fresh()->status);
    }

    // ── Marketing cap ────────────────────────────────────────────────────────

    public function test_one_number_gets_at_most_the_capped_number_of_marketing_texts_a_day(): void
    {
        $sms = app(SmsService::class);
        $this->sendsOk(3);

        $first = $sms->send(new SmsMessage(to: '+9607654321', message: 'Deal 1', type: 'marketing_promotion'));
        $this->assertSame('sent', $first->status);
        $second = $sms->send(new SmsMessage(to: '+9607654321', message: 'Deal 2', type: 'marketing_campaign'));
        $this->assertSame('suppressed', $second->status);
        $this->assertStringContainsString('Marketing cap', (string) $second->error_message);
        $this->assertSame('sent', $sms->send(new SmsMessage(to: '+9607654321', message: 'Order ready', type: 'customer_order_ready'))->status, 'transactional is not capped');
        $this->assertSame('sent', $sms->send(new SmsMessage(to: '+9607000000', message: 'Deal 2', type: 'marketing_campaign'))->status, 'another number is fine');

        SmsDeliveryRules::update(['marketing_daily_cap' => 0]);
        $this->sendsOk();
        $this->assertSame('sent', $sms->send(new SmsMessage(to: '+9607654321', message: 'Deal 3', type: 'marketing_campaign'))->status, 'cap off');
    }
}
