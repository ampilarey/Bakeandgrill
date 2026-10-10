<?php

declare(strict_types=1);

namespace Tests\Feature\Sms;

use App\Domains\Notifications\Contracts\SmsProviderInterface;
use App\Domains\Notifications\DTOs\SmsMessage;
use App\Domains\Notifications\Services\SmsService;
use App\Domains\Notifications\Support\AlertAudience;
use App\Domains\Notifications\Support\AlertSwitch;
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
        // The alert stays on by email; only its SMS is off.
        AlertSwitch::setAll('owner_stock_reorder', true);
        SiteSetting::set('sms_owner_stock_reorder_enabled', 'false');
        $this->makeOwner(['phone' => '9607771234']);
        InventoryItem::create(['name' => 'Flour', 'sku' => 'F1', 'unit' => 'kg', 'current_stock' => 1, 'reorder_point' => 5, 'unit_cost' => 4, 'is_active' => true]);
        $this->provider->shouldNotReceive('send');

        $this->artisan('inventory:check-reorder')->assertSuccessful();

        $log = SmsLog::where('type', 'owner_stock_reorder')->firstOrFail();
        $this->assertSame('disabled', $log->status);
    }

    // ── Recipients ───────────────────────────────────────────────────────────

    public function test_owner_alerts_go_where_their_audience_says(): void
    {
        $owner = $this->makeOwner(['phone' => '9607770001']);
        $manager = $this->makeManager(['phone' => '9607770002']);
        $cashier = $this->makeStaff('cashier', ['phone' => '9607770003']);
        SiteSetting::set('business_phone', '+9607770009');
        SiteSetting::bust();

        $this->assertEquals(['9607770001', '9607770002'], OwnerPhones::for('owner_stock_reorder')->all(), 'default: owners & managers');
        $this->assertEquals(['+9607770009'], OwnerPhones::for('owner_device_approval')->all(), 'default: business phone');

        // Groups: a role on its own
        AlertAudience::save('owner_stock_reorder', ['groups' => ['role:owner']]);
        $this->assertEquals(['9607770001'], OwnerPhones::for('owner_stock_reorder')->all());

        // Named people, on top of a group, and someone excepted from it
        AlertAudience::save('owner_stock_reorder', ['groups' => ['role:owner'], 'users' => [$cashier->id], 'except' => [$manager->id]]);
        $this->assertEqualsCanonicalizing(['9607770001', '9607770003'], OwnerPhones::for('owner_stock_reorder')->all());
        AlertAudience::save('owner_stock_reorder', ['groups' => ['role:owner', 'role:manager'], 'except' => [$manager->id]]);
        $this->assertEquals(['9607770001'], OwnerPhones::for('owner_stock_reorder')->all(), 'excepted from the role');

        // Typed numbers and a typed email, with nobody else
        AlertAudience::save('owner_stock_reorder', ['phones' => ['7770004', '+9607770005'], 'emails' => ['Ops@Example.com']]);
        $this->assertEquals(['+9607770004', '+9607770005', 'email:ops@example.com'], OwnerPhones::for('owner_stock_reorder')->all());

        AlertAudience::save('owner_device_approval', ['groups' => ['role:owner', 'role:manager']]);
        $this->assertEquals(['9607770001', '9607770002'], OwnerPhones::for('owner_device_approval')->all());

        // A row saved as one of the old modes before the migration still reads.
        SiteSetting::set(SmsTypeRegistry::RECIPIENTS_SETTING_PREFIX . 'owner_price_rise', json_encode(['mode' => 'staff', 'user_ids' => [$cashier->id]]));
        SiteSetting::bust();
        $this->assertEquals(['9607770003'], OwnerPhones::for('owner_price_rise')->all());

        // Someone chosen who has no phone still gets it, by email or
        // Telegram (2026-10-07): addressed as "user:{id}".
        $cashier->update(['phone' => null]);
        AlertAudience::save('owner_stock_reorder', ['users' => [$cashier->id]]);
        $this->assertEquals(['user:' . $cashier->id], OwnerPhones::for('owner_stock_reorder')->all());

        // A choice that resolves to nobody falls back to the owners rather than going silent.
        $cashier->update(['is_active' => false]);
        $this->assertEquals(['9607770001', '9607770002'], OwnerPhones::for('owner_stock_reorder')->all());

        // Back to the default
        AlertAudience::save('owner_stock_reorder', null);
        $this->assertFalse(AlertAudience::isCustom('owner_stock_reorder'));
        unset($owner);
    }

    public function test_the_reorder_digest_uses_the_chosen_recipients(): void
    {
        $this->makeOwner(['phone' => '9607770001']);
        AlertSwitch::setAll('owner_stock_reorder', true);
        AlertAudience::save('owner_stock_reorder', ['phones' => ['7779999']]);
        InventoryItem::create(['name' => 'Flour', 'sku' => 'F2', 'unit' => 'kg', 'current_stock' => 1, 'reorder_point' => 5, 'unit_cost' => 4, 'is_active' => true]);
        $this->sendsOk();

        $this->artisan('inventory:check-reorder')->assertSuccessful();

        $this->assertSame(['+9607779999'], SmsLog::where('type', 'owner_stock_reorder')->pluck('to')->all());
    }

    public function test_audiences_are_set_through_admin_and_only_for_staff_and_owner_alerts(): void
    {
        $staff = $this->makeManager(['phone' => '9607770002', 'name' => 'Mariyam']);
        $phoneless = $this->makeStaff('staff', ['phone' => null, 'name' => 'Ali', 'email' => 'ali@example.com']);
        Sanctum::actingAs($this->makeOwner(['phone' => '9607770001', 'name' => 'Ahmed']), ['staff']);

        $res = $this->getJson('/api/admin/sms/control-center')->assertOk();
        $types = collect($res->json('types'));
        $row = $types->firstWhere('key', 'owner_stock_reorder');
        $this->assertTrue($row['audience_configurable']);
        $this->assertFalse($row['audience_custom']);
        $this->assertSame(['role:owner', 'role:manager'], $row['audience']['groups']);
        $this->assertSame(['role:owner', 'role:manager'], $row['audience_default']['groups']);
        $this->assertEqualsCanonicalizing(['Ahmed', 'Mariyam'], array_column($row['audience_people']['people'], 'name'));
        $this->assertSame(['Owners', 'Managers'], $row['audience_people']['groups']);
        $this->assertSame([AlertAudience::GROUP_BUSINESS_PHONE], $types->firstWhere('key', 'owner_device_approval')['audience_default']['groups']);
        $this->assertFalse($types->firstWhere('key', 'customer_order_ready')['audience_configurable']);
        $this->assertNull($types->firstWhere('key', 'customer_order_ready')['audience']);
        // Every active person can be named, phone or not.
        $this->assertEqualsCanonicalizing(['Ahmed', 'Ali', 'Mariyam'], array_column($res->json('staff_options'), 'name'));
        $this->assertContains('role:manager', array_column($res->json('audience_groups'), 'key'));
        $this->assertContains('perm:events.manage', array_column($res->json('audience_groups'), 'key'));
        $this->assertSame(1, $res->json('delivery_rules.marketing_daily_cap'));

        $this->patchJson('/api/admin/sms/types/owner_stock_reorder', ['audience' => ['groups' => [], 'users' => [$staff->id, $phoneless->id]]])
            ->assertOk()
            ->assertJsonPath('audience.users', [$staff->id, $phoneless->id])
            ->assertJsonPath('audience_custom', true);
        $this->assertEqualsCanonicalizing(['9607770002', 'user:' . $phoneless->id], OwnerPhones::for('owner_stock_reorder')->all());
        $this->patchJson('/api/admin/sms/types/owner_stock_reorder', ['audience' => ['groups' => ['role:manager'], 'except' => [$staff->id]]])->assertOk();
        $this->assertSame([], AlertAudience::addresses('owner_stock_reorder')->all(), 'the only manager is excepted');
        $this->assertEqualsCanonicalizing(['9607770001', '9607770002'], OwnerPhones::for('owner_stock_reorder')->all(), 'nobody left: owners and managers get it rather than nobody');

        $this->patchJson('/api/admin/sms/types/owner_stock_reorder', ['audience' => ['groups' => [], 'users' => []]])->assertStatus(422);
        $this->patchJson('/api/admin/sms/types/owner_stock_reorder', ['audience' => ['groups' => ['role:nobody']]])->assertStatus(422);
        $this->patchJson('/api/admin/sms/types/owner_stock_reorder', ['audience' => ['groups' => ['perm:anything.goes']]])->assertStatus(422);
        $this->patchJson('/api/admin/sms/types/owner_stock_reorder', ['audience' => ['phones' => ['12']]])->assertStatus(422);
        $this->patchJson('/api/admin/sms/types/owner_stock_reorder', ['audience' => ['emails' => ['not-an-email']]])->assertStatus(422);
        $this->patchJson('/api/admin/sms/types/customer_order_ready', ['audience' => ['groups' => ['role:owner']]])->assertStatus(422);
        $this->patchJson('/api/admin/sms/types/owner_stock_reorder', ['audience' => null])->assertOk()
            ->assertJsonPath('audience.groups', ['role:owner', 'role:manager'])
            ->assertJsonPath('audience_custom', false);
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

        AlertSwitch::setAll('owner_stock_reorder', true); // off on a fresh install since 2026-10-10
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
        AlertSwitch::setAll('owner_stock_reorder', true); // off on a fresh install since 2026-10-10

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
