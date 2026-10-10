<?php

declare(strict_types=1);

namespace Tests\Feature\Notifications;

use App\Domains\Notifications\Contracts\SmsProviderInterface;
use App\Domains\Notifications\DTOs\SmsMessage;
use App\Domains\Notifications\Services\SmsService;
use App\Domains\Notifications\Support\AlertAudience;
use App\Domains\Notifications\Support\AlertSwitch;
use App\Domains\Notifications\Support\SmsTypeRegistry;
use App\Domains\Permissions\PermissionCatalogSync;
use App\Domains\Sms\Services\StaffNotificationRoutingService;
use App\Domains\Catering\Services\CateringEventCreatedNotifier;
use App\Domains\Telegram\Services\TelegramOwnerTools;
use App\Mail\EventRequestReceivedMail;
use App\Mail\SmsCopyMail;
use App\Models\CateringRequest;
use App\Models\Order;
use App\Models\SiteSetting;
use App\Models\SmsLog;
use App\Models\StaffNotificationPref;
use App\Models\StaffSchedule;
use App\Models\User;
use App\Support\DeferAfterResponse;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Laravel\Sanctum\Sanctum;
use Mockery;
use Tests\TestCase;

/**
 * Notifications re-audit, 2026-10-10 (owner: "each notification need to be
 * controlled separately for sms, email, telegram; each user group settings
 * must be able to control group wise and each staff separately").
 */
class AlertAudienceTest extends TestCase
{
    use RefreshDatabase;

    /** @var list<string> */
    private array $smsSentTo = [];

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();
        Mail::fake();
        $provider = Mockery::mock(SmsProviderInterface::class);
        $provider->shouldReceive('send')->andReturnUsing(function (string $to) {
            $this->smsSentTo[] = $to;

            return [true, ['ok' => true], null];
        });
        $this->app->instance(SmsProviderInterface::class, $provider);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    // ── Groups, people, exceptions ─────────────────────────────────────────

    public function test_a_permission_group_names_everyone_who_holds_it_and_the_owner(): void
    {
        $owner = $this->makeOwner(['phone' => '7770001']);
        $approver = $this->makeStaff('staff', ['phone' => '7770002']);
        $approver->grantPermission('orders.refund');
        $this->makeStaff('staff', ['phone' => '7770003']);

        $this->assertEqualsCanonicalizing(['7770001', '7770002'], AlertAudience::addresses('staff_refund_requested')->all());
        $this->assertEqualsCanonicalizing([$approver->id], AlertAudience::addresses('staff_refund_requested', ['except' => [$owner->id]])
            ->map(fn (string $to) => (int) User::where('phone', $to)->value('id'))->all());
    }

    public function test_a_person_can_be_muted_for_one_alert_and_added_to_another(): void
    {
        $this->makeOwner(['phone' => '7770001']);
        $manager = $this->makeManager(['phone' => '7770002']);
        $cook = $this->makeKitchenStaff(['phone' => '7770003']);

        AlertAudience::save('owner_stock_reorder', ['groups' => ['role:owner', 'role:manager'], 'except' => [$manager->id]]);
        AlertAudience::save('owner_stock_expiry', ['groups' => ['role:owner', 'role:manager'], 'users' => [$cook->id]]);

        $this->assertSame(['7770001'], AlertAudience::addresses('owner_stock_reorder')->all());
        $this->assertEqualsCanonicalizing(['7770001', '7770002', '7770003'], AlertAudience::addresses('owner_stock_expiry')->all());
        $this->assertTrue(AlertAudience::isCustom('owner_stock_reorder'));
        $this->assertFalse(AlertAudience::isCustom('owner_price_rise'));

        // Admin shows who gets it and how each can be reached.
        $described = AlertAudience::describe('owner_stock_expiry');
        $this->assertEqualsCanonicalizing([$cook->id, $manager->id, User::where('phone', '7770001')->value('id')], array_column($described['people'], 'id'));
        $this->assertSame(['Owners', 'Managers'], $described['groups']);
    }

    public function test_order_alerts_honour_roles_named_people_and_exceptions_on_top_of_the_shift(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-04-20 10:00:00'));
        $onShift = $this->makeStaff('staff', ['phone' => '7100001']);
        $muted = $this->makeStaff('staff', ['phone' => '7100002']);
        $manager = $this->makeManager(['phone' => '7100003']);
        $owner = $this->makeOwner(['phone' => '7100004']);
        foreach ([$onShift, $muted] as $u) {
            StaffSchedule::create(['user_id' => $u->id, 'date' => '2026-04-20', 'shift_start' => '08:00', 'shift_end' => '18:00', 'is_confirmed' => true]);
        }
        $order = Order::create(['order_number' => 'BG-A1', 'type' => 'takeaway', 'status' => 'pending', 'total' => 100, 'total_laar' => 10000]);

        $router = app(StaffNotificationRoutingService::class);
        $this->assertEqualsCanonicalizing(['7100001', '7100002'], $router->resolve($order, 'new_order', now())->pluck('phone')->all(), 'default: the staff on shift');

        AlertAudience::save('staff_new_order', ['groups' => ['on_shift', 'role:manager'], 'users' => [$owner->id], 'except' => [$muted->id], 'phones' => ['7100099']]);
        $this->assertEqualsCanonicalizing(['7100001', '7100003', '7100004', '+9607100099'], $router->resolve($order, 'new_order', now())->pluck('phone')->all());

        // Without "staff on shift" at all: only the people named.
        AlertAudience::save('staff_new_order', ['groups' => ['role:manager']]);
        $this->assertSame(['7100003'], $router->resolve($order, 'new_order', now())->pluck('phone')->all());

        // A muted person is not even the fallback.
        AlertAudience::save('staff_new_order', ['groups' => ['on_shift'], 'except' => [$onShift->id, $muted->id]]);
        StaffNotificationPref::create(['user_id' => $muted->id, 'is_fallback' => true, 'fallback_priority' => 1]);
        StaffNotificationPref::create(['user_id' => $manager->id, 'is_fallback' => true, 'fallback_priority' => 2]);
        $this->assertSame(['7100003'], $router->resolve($order, 'new_order', now())->pluck('phone')->all());
    }

    // ── Per-channel switches ───────────────────────────────────────────────

    public function test_a_messages_own_email_follows_its_email_switch(): void
    {
        $this->makeOwner(['phone' => '7770001']);
        $request = CateringRequest::create([
            'reference' => CateringRequest::generateReference(), 'contact_name' => 'Aisha', 'phone' => '7777001',
            'email' => 'aisha@example.com', 'occasion' => 'event', 'event_date' => now()->addDays(10)->toDateString(),
            'fulfillment_method' => 'pickup', 'status' => 'draft', 'source' => 'event_order', 'quote_version' => 1,
        ]);

        app(CateringEventCreatedNotifier::class)->notify($request);
        Mail::assertSent(EventRequestReceivedMail::class, 1);
        $this->assertSame(['+9607777001', '+9607770001'], $this->smsSentTo, 'the customer, then the owner (who manages catering)');

        // Email off on the row: the customer still gets the text, not the email.
        SmsTypeRegistry::setEmailEnabled('catering_request_received', false);
        $request2 = CateringRequest::create([
            'reference' => CateringRequest::generateReference(), 'contact_name' => 'Hassan', 'phone' => '7777002',
            'email' => 'hassan@example.com', 'occasion' => 'event', 'event_date' => now()->addDays(10)->toDateString(),
            'fulfillment_method' => 'pickup', 'status' => 'draft', 'source' => 'event_order', 'quote_version' => 1,
        ]);
        app(CateringEventCreatedNotifier::class)->notify($request2);
        Mail::assertSent(EventRequestReceivedMail::class, 1);
        $this->assertContains('+9607777002', $this->smsSentTo);
        $this->assertTrue(AlertSwitch::isOn('catering_request_received'), 'the SMS is still on');

        // And a gift card email is refused with a reason rather than sent.
        SmsTypeRegistry::setEmailEnabled('giftcard_delivery', false);
        $result = app(\App\Domains\Payments\Services\GiftCardEmailDelivery::class)->send(new \App\Models\GiftCard, 'ABCD-EFGH-IJKL-MNOP', 'to@example.com');
        $this->assertFalse($result['ok']);
        $this->assertStringContainsString('switched off in Admin', (string) $result['error']);
    }

    public function test_telegram_only_alerts_are_rows_with_one_switch_and_an_audience(): void
    {
        Sanctum::actingAs($this->makeOwner(['phone' => '7770001', 'name' => 'Ahmed']), ['staff']);
        $res = $this->getJson('/api/admin/sms/control-center')->assertOk();
        $row = collect($res->json('types'))->firstWhere('key', 'owner_day_report');
        $this->assertSame(['telegram'], $row['channels']);
        $this->assertFalse($row['enabled']);
        $this->assertTrue($row['telegram_enabled']);
        $this->assertSame(['role:owner', 'perm:reports.view'], $row['audience']['groups']);
        $this->assertSame(['Ahmed'], array_column($row['audience_people']['people'], 'name'));

        $this->patchJson('/api/admin/sms/types/owner_day_report', ['enabled' => false])->assertStatus(422);
        $this->patchJson('/api/admin/sms/types/owner_day_report', ['email_enabled' => false])->assertStatus(422);
        $this->patchJson('/api/admin/sms/types/owner_day_report', ['telegram_enabled' => false])->assertOk()->assertJsonPath('telegram_enabled', false);
        // The Telegram page's old key still answers, so nothing switched off comes back on.
        $this->assertSame('off', SiteSetting::get('telegram_day_report_enabled'));
        $this->assertFalse(AlertSwitch::isOn('owner_day_report'));
        $this->assertTrue(TelegramOwnerTools::voidsOn(), 'the other two are untouched');
    }

    public function test_each_channel_switch_is_refused_where_the_channel_does_not_exist(): void
    {
        Sanctum::actingAs($this->makeOwner(['phone' => '7770001']), ['staff']);
        $this->patchJson('/api/admin/sms/types/customer_order_ready', ['telegram_enabled' => false])->assertStatus(422);
        $this->patchJson('/api/admin/sms/types/auth_customer_otp', ['email_enabled' => false])->assertStatus(422);
        $this->patchJson('/api/admin/sms/types/giftcard_delivery', ['email_enabled' => false])->assertOk()->assertJsonPath('email_enabled', false);
        $this->assertFalse(SmsTypeRegistry::isEmailEnabled('giftcard_delivery'));
    }

    // ── The migration ──────────────────────────────────────────────────────

    private function migrate(): void
    {
        (require database_path('migrations/2026_10_10_150000_notifications_audience_per_alert.php'))->up();
    }

    public function test_the_migration_keeps_every_old_choice(): void
    {
        $cashier = $this->makeStaff('staff', ['phone' => '7770003']);
        $fallback = $this->makeManager(['phone' => '7770004']);
        StaffNotificationPref::create(['user_id' => $fallback->id, 'is_fallback' => true]);
        SiteSetting::set(SmsTypeRegistry::RECIPIENTS_SETTING_PREFIX . 'owner_stock_reorder', json_encode(['mode' => 'staff', 'user_ids' => [$cashier->id]]));
        SiteSetting::set(SmsTypeRegistry::RECIPIENTS_SETTING_PREFIX . 'owner_price_rise', json_encode(['mode' => 'custom', 'phones' => ['7770005']]));
        SiteSetting::set(SmsTypeRegistry::RECIPIENTS_SETTING_PREFIX . 'owner_device_approval', json_encode(['mode' => 'owner_only']));
        SiteSetting::set('catering_notify_phone', '9000000');
        SiteSetting::set('catering_notify_email', 'events@example.com');
        SiteSetting::set('sms_email_copy_staff', 'off');
        SiteSetting::set('trade_unreconciled_alert_days', '0');
        SiteSetting::bust();

        $this->migrate();

        $this->assertSame(['users' => [$cashier->id], 'groups' => []], ['users' => AlertAudience::for('owner_stock_reorder')['users'], 'groups' => AlertAudience::for('owner_stock_reorder')['groups']]);
        $this->assertSame(['+9607770005'], AlertAudience::for('owner_price_rise')['phones']);
        $this->assertSame(['role:owner'], AlertAudience::for('owner_device_approval')['groups']);
        foreach (\App\Domains\Catering\Services\CateringNotifyRecipients::ALL_STAFF_TYPES as $type) {
            $this->assertSame(['+9609000000'], AlertAudience::for($type)['phones'], $type);
            $this->assertSame(['events@example.com'], AlertAudience::for($type)['emails'], $type);
        }
        $this->assertSame([$fallback->id], AlertAudience::for('staff_new_customer')['users']);
        $this->assertFalse(SmsTypeRegistry::isEmailEnabled('owner_shift_left_open'), 'staff email copies were off');
        $this->assertTrue(SmsTypeRegistry::isEmailEnabled('customer_order_ready'), 'customer copies were on');
        $this->assertFalse(AlertSwitch::isOn('owner_trade_unreconciled'), '0 meant off');
        $this->assertSame('7', SiteSetting::get('trade_unreconciled_alert_days'));
        $this->assertTrue(AlertSwitch::isOn('trade_report_reminder_shop'));
    }

    // ── Typed emails and phoneless people end to end ───────────────────────

    public function test_an_alert_reaches_a_typed_email_and_a_person_without_a_phone(): void
    {
        $owner = $this->makeOwner(['phone' => '7770001']);
        $manager = $this->makeManager(['phone' => null, 'email' => 'ariya@example.com']);
        AlertAudience::save('owner_shift_left_open', ['groups' => ['role:owner', 'role:manager'], 'emails' => ['ops@example.com']]);

        foreach (AlertAudience::addresses('owner_shift_left_open') as $to) {
            app(SmsService::class)->send(new SmsMessage(to: $to, message: 'Shift #4 has been open for 14 hours.', type: 'owner_shift_left_open', idempotencyKey: 'shift:4:' . md5($to)));
        }
        DeferAfterResponse::flushTestingCallbacks();

        $this->assertSame(['+9607770001'], $this->smsSentTo);
        Mail::assertSent(SmsCopyMail::class, fn (SmsCopyMail $m) => $m->hasTo('ariya@example.com'));
        Mail::assertSent(SmsCopyMail::class, fn (SmsCopyMail $m) => $m->hasTo('ops@example.com'));
        $this->assertSame(SmsLog::SENT_BY_EMAIL, SmsLog::where('to', 'email:ops@example.com')->value('error_message'));
        $this->assertSame(SmsLog::SENT_BY_EMAIL, SmsLog::where('to', 'user:' . $manager->id)->value('error_message'));
        unset($owner);
    }
}
