<?php

declare(strict_types=1);

namespace Tests\Feature\Telegram;

use App\Domains\Notifications\Contracts\SmsProviderInterface;
use App\Domains\Notifications\DTOs\SmsMessage;
use App\Domains\Notifications\Services\SmsService;
use App\Domains\Notifications\Support\AlertAudience;
use App\Domains\Notifications\Support\NotificationChannels;
use App\Mail\SmsCopyMail;
use App\Models\Device;
use App\Models\Shift;
use App\Models\SiteSetting;
use App\Support\DeferAfterResponse;
use App\Support\OwnerPhones;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Laravel\Sanctum\Sanctum;
use Mockery;
use Tests\TestCase;

/**
 * Owner, 2026-10-10: "Opening float differs from the last close" arrived
 * twice on Telegram. One alert reaches each person once on each channel,
 * however many of its addresses lead to them.
 */
class OneAlertOneMessageTest extends TestCase
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
        SiteSetting::set('business_phone', '+960 912 0011');
        SiteSetting::bust();
    }

    /** What the opening-float check does: one text per address the alert's audience gives. */
    private function floatAlert(string $message = 'Ariya opened shift #25 on Front till with MVR 818.00.', int $shiftId = 25): void
    {
        foreach (OwnerPhones::for('owner_shift_float_mismatch') as $to) {
            app(SmsService::class)->send(new SmsMessage(
                to: $to,
                message: $message,
                type: 'owner_shift_float_mismatch',
                referenceType: 'shift',
                referenceId: (string) $shiftId,
                idempotencyKey: "shift-float:{$shiftId}:" . $to,
            ));
        }
        DeferAfterResponse::flushTestingCallbacks();
    }

    private function emailsTo(string $address): int
    {
        return Mail::sent(SmsCopyMail::class, fn (SmsCopyMail $m) => $m->hasTo($address))->count();
    }

    public function test_one_number_typed_two_ways_on_two_accounts_gets_one_of_each(): void
    {
        $owner = $this->staff('owner', '+9607820288', 'Ahmed');
        $owner->forceFill(['email' => 'ahmed@example.com'])->save();
        $this->link($this->bot(), $owner, '5550001');
        // A second account (a till login, say) with the same phone, typed without +960.
        $this->staff('manager', '7820288', 'Ahmed (till)');

        $this->floatAlert();

        $this->assertSame(['+9607820288'], $this->smsSentTo, 'one text to the one phone');
        $this->assertCount(1, $this->sent('5550001'), 'one Telegram message');
        $this->assertSame(1, $this->emailsTo('ahmed@example.com'), 'one email');
    }

    public function test_an_owner_also_reached_through_the_business_phone_gets_one_telegram(): void
    {
        $owner = $this->staff('owner', '+9607820288', 'Ahmed');
        $this->link($this->bot(), $owner, '5550001');
        $this->staff('staff', '+9609120011', 'Bake & Grill'); // the shop's own login, not on Telegram
        AlertAudience::save('owner_shift_float_mismatch', ['groups' => ['role:owner', AlertAudience::GROUP_BUSINESS_PHONE]]);

        $this->floatAlert();

        $this->assertEqualsCanonicalizing(['+9607820288', '+9609120011'], $this->smsSentTo, 'the shop phone still gets its text');
        $this->assertCount(1, $this->sent('5550001'), 'linked owners get a business-phone alert once, not again as themselves');
    }

    public function test_a_manager_on_the_business_phone_does_not_double_the_owners_telegram(): void
    {
        $owner = $this->staff('owner', '+9607820288', 'Ahmed');
        $this->link($this->bot(), $owner, '5550001');
        $this->staff('manager', '+9609120011', 'Bake & Grill');

        $this->floatAlert();

        $this->assertCount(1, $this->sent('5550001'));
    }

    public function test_a_telegram_message_that_timed_out_is_not_sent_again_after_the_sms(): void
    {
        $owner = $this->staff('owner', '+9607820288', 'Ahmed');
        $this->link($this->bot(), $owner, '5550001');
        NotificationChannels::setUser($owner, [NotificationChannels::TELEGRAM]);
        $this->telegramSlow = true; // Telegram shows it, but answers after our 5 seconds

        $this->floatAlert();

        $this->assertCount(1, $this->sent('5550001'), 'one try: Telegram may well have shown it');
        $this->assertSame(['+9607820288'], $this->smsSentTo, 'the SMS is the safety net');
    }

    public function test_a_refused_telegram_message_is_still_retried_with_the_sms(): void
    {
        $owner = $this->staff('owner', '+9607820288', 'Ahmed');
        $this->link($this->bot(), $owner, '5550001');
        NotificationChannels::setUser($owner, [NotificationChannels::TELEGRAM]);
        $this->telegramDown = true; // a clear refusal: nothing was shown

        $this->floatAlert();

        $this->assertCount(2, $this->sent('5550001'), 'refused, so the copy beside the SMS tries again');
        $this->assertSame(['+9607820288'], $this->smsSentTo);
    }

    public function test_two_different_alerts_both_arrive(): void
    {
        $owner = $this->staff('owner', '+9607820288', 'Ahmed');
        $this->link($this->bot(), $owner, '5550001');

        $this->floatAlert('Ariya opened shift #25 on Front till with MVR 818.00.', 25);
        $this->floatAlert('Dikshya opened shift #26 on Back till with MVR 90.00.', 26);

        $this->assertCount(2, $this->sent('5550001'));
    }

    public function test_a_timeout_is_told_apart_from_a_connection_that_never_opened_and_hides_the_token(): void
    {
        $bot = $this->bot();
        \Illuminate\Support\Facades\Http::fake(['api.telegram.org/*' => fn ($request) => (\Illuminate\Support\Facades\Http::failedConnection(
            'cURL error 28: Operation timed out after 8001 milliseconds with 0 bytes received (see https://curl.haxx.se/libcurl/c/libcurl-errors.html) for ' . $request->url(),
        ))($request)]);

        try {
            app(\App\Domains\Telegram\Services\TelegramClient::class)->call($bot, 'sendMessage', ['chat_id' => '5550001', 'text' => 'x']);
            $this->fail('expected a timeout');
        } catch (\App\Domains\Telegram\Exceptions\TelegramApiException $e) {
            $this->assertTrue($e->mayHaveArrived);
            $this->assertStringNotContainsString((string) $bot->token, $e->getMessage(), 'the token never reaches the log');
        }

        $client = \App\Domains\Telegram\Services\TelegramClient::class;
        $this->assertFalse($client::mayHaveArrived('cURL error 28: Connection timed out after 5001 milliseconds'));
        $this->assertFalse($client::mayHaveArrived('cURL error 7: Failed to connect to api.telegram.org port 443'));
        $this->assertFalse($client::mayHaveArrived('cURL error 6: Could not resolve host: api.telegram.org'));
        $this->assertTrue($client::mayHaveArrived('cURL error 56: Recv failure: Connection reset by peer'));
    }

    public function test_the_opening_float_alert_names_the_cashier_and_the_till(): void
    {
        $owner = $this->staff('owner', '+9607820288', 'Ahmed');
        $this->link($this->bot(), $owner, '5550001');
        $ariya = $this->staff('staff', '+9607001002', 'Ariya');
        $device = Device::create(['name' => 'Front till', 'identifier' => 'pos-front-float', 'type' => 'pos', 'is_active' => true]);
        Shift::create(['user_id' => $owner->id, 'device_id' => $device->id, 'opened_at' => now()->subDay(), 'closed_at' => now()->subHours(10), 'opening_cash' => 100, 'closing_cash' => 150]);

        Sanctum::actingAs($ariya, ['staff']);
        $res = $this->withHeader('X-Device-Identifier', $device->identifier)->postJson('/api/shifts/open', ['opening_cash' => 818])->assertCreated();
        DeferAfterResponse::flushTestingCallbacks();
        $id = (int) $res->json('shift.id');

        $this->assertCount(1, $this->sent('5550001'));
        $text = $this->lastText('5550001');
        $this->assertStringContainsString("Ariya opened shift #{$id} on Front till with MVR 818.00", $text);
        $this->assertStringContainsString('The last close on that till left MVR 150.00, so the drawer is MVR 668.00 over.', $text);
        $this->assertStringNotContainsString('you opened', $text, 'the owner did not open it');
        // The cashier's own warning on the till still speaks to them.
        $this->assertStringContainsString('you opened with MVR 818.00', (string) $res->json('float_check.message'));
    }
}
