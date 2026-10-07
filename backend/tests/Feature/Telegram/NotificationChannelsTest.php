<?php

declare(strict_types=1);

namespace Tests\Feature\Telegram;

use App\Domains\Notifications\Contracts\SmsProviderInterface;
use App\Domains\Notifications\DTOs\SmsMessage;
use App\Domains\Notifications\Services\SmsService;
use App\Domains\Notifications\Support\NotificationChannels;
use App\Domains\Notifications\Support\SmsTypeRegistry;
use App\Mail\SmsCopyMail;
use App\Models\AuditLog;
use App\Models\SiteSetting;
use App\Models\SmsLog;
use App\Models\User;
use App\Support\DeferAfterResponse;
use App\Support\OwnerPhones;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Laravel\Sanctum\Sanctum;
use Mockery;
use Tests\TestCase;

/**
 * Admin decides which channels each role and person gets alerts by (owner,
 * 2026-10-07: "Option 2 but admin is the one who controls everything, for
 * example admin decides in which channel notifications goes to a specific
 * role or person"; "an acc may not have mobile number but email so he
 * should receive email").
 */
class NotificationChannelsTest extends TestCase
{
    use FakesTelegram;
    use RefreshDatabase;

    /** @var list<string> */
    private array $smsSentTo = [];

    protected function setUp(): void
    {
        parent::setUp();
        $this->roles();
        $this->fakeTelegram();
        Mail::fake();
        $provider = Mockery::mock(SmsProviderInterface::class);
        $provider->shouldReceive('send')->andReturnUsing(function (string $to) {
            $this->smsSentTo[] = $to;

            return [true, ['ok' => true], null];
        });
        $this->app->instance(SmsProviderInterface::class, $provider);
    }

    /** What every owner-alert sender does: one text per address OwnerPhones gives. */
    private function ownerAlert(string $type = 'owner_shift_left_open', string $message = 'Shift #4 has been open for 14 hours.'): void
    {
        foreach (OwnerPhones::for($type) as $to) {
            app(SmsService::class)->send(new SmsMessage(to: $to, message: $message, type: $type, idempotencyKey: 'test:' . md5($message) . ':' . $to));
        }
        DeferAfterResponse::flushTestingCallbacks();
    }

    private function emailed(string $address): bool
    {
        return Mail::sent(SmsCopyMail::class, fn (SmsCopyMail $m) => $m->hasTo($address))->isNotEmpty();
    }

    private function withEmail(User $user, string $email): User
    {
        $user->forceFill(['email' => $email])->save();

        return $user;
    }

    public function test_a_manager_with_no_phone_gets_the_alert_by_email(): void
    {
        $this->staff('owner', '+9607820288', 'Ahmed');
        $manager = $this->withEmail($this->staff('manager', '', 'Ariya'), 'ariya@example.com');
        $manager->forceFill(['phone' => null])->save();

        $this->ownerAlert();

        $this->assertSame(['+9607820288'], $this->smsSentTo, 'the owner still gets the SMS');
        $this->assertTrue($this->emailed('ariya@example.com'));
        $row = SmsLog::query()->where('to', NotificationChannels::token($manager))->firstOrFail();
        $this->assertSame('suppressed', $row->status);
        $this->assertSame(SmsLog::SENT_BY_EMAIL, $row->error_message);
    }

    public function test_a_role_on_email_only_gets_no_sms(): void
    {
        NotificationChannels::setRoles(['manager' => [NotificationChannels::EMAIL]]);
        $this->staff('owner', '+9607820288');
        $this->withEmail($this->staff('manager', '+9607001002', 'Ariya'), 'ariya@example.com');

        $this->ownerAlert();

        $this->assertSame(['+9607820288'], $this->smsSentTo);
        $this->assertTrue($this->emailed('ariya@example.com'));
    }

    public function test_a_persons_own_channels_beat_their_roles(): void
    {
        $owner = $this->staff('owner', '+9607820288', 'Ahmed');
        $this->link($this->bot(), $owner, '5550001');
        NotificationChannels::setUser($owner, [NotificationChannels::TELEGRAM]);

        $this->ownerAlert();

        $this->assertSame([], $this->smsSentTo);
        $this->assertStringContainsString('Shift #4', $this->lastText('5550001'));

        // Back to the role (all three): the SMS goes again, Telegram too.
        NotificationChannels::setUser($owner->fresh(), null);
        $this->ownerAlert('owner_shift_left_open', 'Shift #5 has been open for 14 hours.');
        $this->assertSame(['+9607820288'], $this->smsSentTo);
        $this->assertStringContainsString('Shift #5', $this->lastText('5550001'));
    }

    public function test_a_role_without_telegram_gets_no_telegram(): void
    {
        NotificationChannels::setRoles(['owner' => [NotificationChannels::SMS]]);
        $owner = $this->staff('owner', '+9607820288');
        $this->link($this->bot(), $owner, '5550001');

        $this->ownerAlert();

        $this->assertSame(['+9607820288'], $this->smsSentTo);
        $this->assertSame([], $this->sent('5550001'));
    }

    public function test_an_alert_types_telegram_switch(): void
    {
        $owner = $this->staff('owner', '+9607820288');
        $this->link($this->bot(), $owner, '5550001');
        SmsTypeRegistry::setTelegramEnabled('owner_shift_left_open', false);

        $this->ownerAlert();
        $this->assertSame([], $this->sent('5550001'));
        $this->assertSame(['+9607820288'], $this->smsSentTo);

        $this->ownerAlert('owner_shift_variance', 'Shift #4 closed MVR 50.00 short.');
        $this->assertStringContainsString('MVR 50.00 short', $this->lastText('5550001'));
    }

    public function test_when_no_chosen_channel_can_reach_them_the_sms_goes(): void
    {
        NotificationChannels::setRoles(['owner' => [NotificationChannels::EMAIL, NotificationChannels::TELEGRAM]]);
        $owner = $this->staff('owner', '+9607820288');
        $owner->forceFill(['email' => ''])->save(); // no usable address

        $this->ownerAlert();

        $this->assertSame(['+9607820288'], $this->smsSentTo, 'no email saved, Telegram not linked: the SMS is the safety net');
        $row = SmsLog::query()->latest('id')->firstOrFail();
        $this->assertSame('sent', $row->status);
        $this->assertSame(SmsService::SMS_FALLBACK_NOTE, $row->error_message);
    }

    public function test_someone_with_no_phone_and_nothing_else_is_logged_as_not_reached(): void
    {
        $this->staff('owner', '+9607820288');
        $manager = $this->staff('manager', '', 'Ariya');
        $manager->forceFill(['phone' => null, 'email' => ''])->save();

        $this->ownerAlert();

        $row = SmsLog::query()->where('to', NotificationChannels::token($manager))->firstOrFail();
        $this->assertSame('failed', $row->status);
        $this->assertStringContainsString('Could not reach Ariya', (string) $row->error_message);
    }

    public function test_the_business_phone_is_the_shop_not_a_person(): void
    {
        // The business phone belongs to a staff account on email only: the
        // shop phone still gets its SMS, and owners their Telegram.
        SiteSetting::set('business_phone', '+960 912 0011');
        SiteSetting::bust();
        NotificationChannels::setRoles(['staff' => [NotificationChannels::EMAIL]]);
        $this->withEmail($this->staff('staff', '+9609120011', 'Bake & Grill'), 'shop@example.com');
        $owner = $this->staff('owner', '+9607820288', 'Ahmed');
        $this->link($this->bot(), $owner, '5550001');

        $this->ownerAlert('owner_device_approval', 'New POS device "Front till" is waiting for approval.');

        $this->assertSame(['+9609120011'], $this->smsSentTo);
        $this->assertStringContainsString('Front till', $this->lastText('5550001'));
    }

    public function test_customer_texts_ignore_staff_channels(): void
    {
        NotificationChannels::setRoles(['owner' => []]);
        $this->staff('owner', '+9607820288');

        app(SmsService::class)->send(new SmsMessage(to: '7820288', message: 'Your order #A12 is ready.', type: 'customer_order_ready'));

        $this->assertSame(['+9607820288'], $this->smsSentTo);
    }

    public function test_admin_sets_channels_for_a_role_and_a_person(): void
    {
        $owner = $this->staff('owner', '+9607820288', 'Ahmed');
        $manager = $this->staff('manager', '', 'Ariya');
        $manager->forceFill(['phone' => null, 'email' => 'ariya@example.com'])->save();
        $this->link($this->bot(), $owner, '5550001');
        Sanctum::actingAs($owner, ['staff']);

        $res = $this->getJson('/api/admin/sms/channels')->assertOk()
            ->assertJsonPath('channels', ['sms', 'email', 'telegram']);
        $people = collect($res->json('people'))->keyBy('name');
        $this->assertTrue($people['Ahmed']['telegram_linked']);
        $this->assertNull($people['Ariya']['phone']);
        $this->assertSame('ariya@example.com', $people['Ariya']['email']);
        $this->assertNull($people['Ariya']['own_channels']);

        $this->putJson('/api/admin/sms/channels/roles', ['roles' => ['manager' => ['email', 'telegram']]])->assertOk()
            ->assertJsonPath('roles.manager', ['email', 'telegram'])
            ->assertJsonPath('roles.owner', ['sms', 'email', 'telegram']);

        $this->putJson('/api/admin/sms/channels/people/' . $owner->id, ['channels' => ['telegram']])->assertOk()
            ->assertJsonPath('person.own_channels', ['telegram']);
        $this->assertSame(['telegram'], NotificationChannels::forUser($owner->fresh()));

        $this->putJson('/api/admin/sms/channels/people/' . $owner->id, ['channels' => null])->assertOk()
            ->assertJsonPath('person.own_channels', null)
            ->assertJsonPath('person.channels', ['sms', 'email', 'telegram']);
        $this->assertTrue(AuditLog::query()->where('action', 'notify.channels.person_updated')->exists());
    }

    public function test_a_cashier_cannot_change_channels(): void
    {
        $cashier = $this->staff('staff', '+9607001001');
        Sanctum::actingAs($cashier, ['staff']);

        $this->putJson('/api/admin/sms/channels/roles', ['roles' => ['owner' => []]])->assertForbidden();
        $this->putJson('/api/admin/sms/channels/people/' . $cashier->id, ['channels' => ['sms']])->assertForbidden();
    }
}
