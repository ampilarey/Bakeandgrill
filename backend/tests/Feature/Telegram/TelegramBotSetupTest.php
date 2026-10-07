<?php

declare(strict_types=1);

namespace Tests\Feature\Telegram;

use App\Models\TelegramBot;
use App\Models\TelegramLink;
use App\Models\TelegramLinkCode;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Owner, 2026-10-06: "Build owner bot now. Then manager. Then staff." Step
 * one: adding a bot in Admin, linking a person with a one-time link, and a
 * webhook that only Telegram (with the bot's secret) can call.
 */
class TelegramBotSetupTest extends TestCase
{
    use FakesTelegram;
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->roles();
        $this->fakeTelegram();
    }

    public function test_the_owner_adds_a_bot_and_it_is_pointed_at_this_site(): void
    {
        $owner = $this->staff('owner', '+9607820288', 'Owner');
        Sanctum::actingAs($owner, ['staff']);

        $res = $this->postJson('/api/admin/telegram/bots', [
            'name' => 'Staff bot',
            'token' => '123456789:AAEexampleexampleexampleexample123',
            'roles' => ['owner', 'manager'],
        ])->assertCreated()
            ->assertJsonPath('bot.username', 'BakeGrillStaffBot')
            ->assertJsonPath('bot.roles', ['owner', 'manager']);

        // The token never comes back.
        $this->assertStringNotContainsString('AAEexample', $res->getContent());
        $this->assertSame('123456789:•••', $res->json('bot.token_hint'));

        $bot = TelegramBot::firstOrFail();
        $hook = collect($this->telegramCalls)->firstWhere('method', 'setWebhook');
        $this->assertSame($bot->webhookUrl(), $hook['params']['url']);
        $this->assertSame($bot->webhook_secret, $hook['params']['secret_token']);
        $this->assertNotNull(collect($this->telegramCalls)->firstWhere('method', 'setMyCommands'));
    }

    public function test_a_bot_already_serving_another_site_is_not_taken_without_asking(): void
    {
        Sanctum::actingAs($this->staff('owner', '+9607820288'), ['staff']);
        $this->webhookUrlOnTelegram = 'https://test.bakeandgrill.mv/api/telegram/webhook/1';

        $this->postJson('/api/admin/telegram/bots', [
            'name' => 'Staff bot', 'token' => '123456789:AAEexampleexampleexampleexample123', 'roles' => ['owner'],
        ])->assertStatus(409)->assertJsonPath('needs_take_over', true);
        $this->assertSame(0, TelegramBot::count());
        $this->assertNull(collect($this->telegramCalls)->firstWhere('method', 'setWebhook'));

        $this->postJson('/api/admin/telegram/bots', [
            'name' => 'Staff bot', 'token' => '123456789:AAEexampleexampleexampleexample123', 'roles' => ['owner'], 'take_over' => true,
        ])->assertCreated();
    }

    public function test_only_the_owner_manages_bots(): void
    {
        Sanctum::actingAs($this->staff('manager', '+9607001002'), ['staff']);
        $this->getJson('/api/admin/telegram')->assertForbidden();
    }

    public function test_a_one_time_link_links_the_chat_and_works_once(): void
    {
        $owner = $this->staff('owner', '+9607820288', 'Ahmed');
        Sanctum::actingAs($owner, ['staff']);
        $bot = $this->bot();

        $res = $this->postJson('/api/admin/telegram/links/code', ['bot_id' => $bot->id, 'user_id' => $owner->id])->assertOk();
        $url = (string) $res->json('url');
        $this->assertStringStartsWith('https://t.me/BakeGrillStaffBot?start=', $url);
        $code = substr($url, strpos($url, '=') + 1);
        $this->assertNull(TelegramLinkCode::where('code_hash', $code)->first(), 'only the hash is stored');

        $this->telegramText($bot, '5550001', '/start ' . $code)->assertOk();
        $link = TelegramLink::where('user_id', $owner->id)->firstOrFail();
        $this->assertSame('5550001', $link->chat_id);
        $this->assertStringContainsString('Hi Ahmed, you', $this->lastText('5550001'));
        $keyboard = $this->sent('5550001')[0]['reply_markup']['keyboard'] ?? [];
        $this->assertContains('📊 Today', array_column(array_merge(...$keyboard), 'text'));

        // Used: someone else with the same link gets nothing.
        $this->telegramText($bot, '5550002', '/start ' . $code)->assertOk();
        $this->assertSame(1, TelegramLink::count());
        $this->assertStringContainsString('expired or was already used', $this->lastText('5550002'));
    }

    public function test_an_expired_link_does_not_work(): void
    {
        $owner = $this->staff('owner', '+9607820288');
        $bot = $this->bot();
        $code = app(\App\Domains\Telegram\Services\TelegramLinker::class)->issue($bot, $owner, null, null)['code'];
        $this->travel(61)->minutes();

        $this->telegramText($bot, '5550001', '/start ' . $code)->assertOk();
        $this->assertSame(0, TelegramLink::count());
    }

    public function test_a_link_for_a_role_the_bot_does_not_serve_is_refused(): void
    {
        $owner = $this->staff('owner', '+9607820288');
        $cashier = $this->staff('staff', '+9607001001');
        Sanctum::actingAs($owner, ['staff']);
        $bot = $this->bot(['owner', 'manager']);

        $this->postJson('/api/admin/telegram/links/code', ['bot_id' => $bot->id, 'user_id' => $cashier->id])
            ->assertStatus(422)->assertJsonPath('message', 'Staff bot does not serve Staff (cashier). Tick that role on the bot, or pick another bot.');
    }

    public function test_the_webhook_refuses_anyone_without_the_bot_secret(): void
    {
        $bot = $this->bot();
        $update = ['update_id' => 1, 'message' => ['chat' => ['id' => 1, 'type' => 'private'], 'text' => '/today']];

        $this->postJson('/api/telegram/webhook/' . $bot->id, $update)->assertForbidden();
        $this->postJson('/api/telegram/webhook/' . $bot->id, $update, ['X-Telegram-Bot-Api-Secret-Token' => 'wrong'])->assertForbidden();
        $bot->update(['is_enabled' => false]);
        $this->postJson('/api/telegram/webhook/' . $bot->id, $update, ['X-Telegram-Bot-Api-Secret-Token' => $bot->webhook_secret])->assertForbidden();
        $this->assertSame([], $this->sent());
    }

    public function test_a_stranger_learns_only_how_to_link(): void
    {
        $bot = $this->bot();
        $this->telegramText($bot, '9990001', '/today')->assertOk();

        $text = $this->lastText('9990001');
        $this->assertStringContainsString('ask the owner for your link', $text);
        $this->assertStringNotContainsString('MVR', $text);
    }

    public function test_the_same_update_is_acted_on_once(): void
    {
        $owner = $this->staff('owner', '+9607820288');
        $bot = $this->bot();
        $this->link($bot, $owner, '5550001');

        $this->telegramText($bot, '5550001', '/help', 777)->assertOk();
        $this->telegramText($bot, '5550001', '/help', 777)->assertOk();
        $this->assertCount(1, $this->sent('5550001'));
    }

    public function test_stop_unlinks_and_a_deactivated_person_is_refused(): void
    {
        $owner = $this->staff('owner', '+9607820288');
        $manager = $this->staff('manager', '+9607001002');
        $bot = $this->bot();
        $this->link($bot, $owner, '5550001');
        $this->link($bot, $manager, '5550002');

        $this->telegramText($bot, '5550001', '/stop')->assertOk();
        $this->assertSame(0, TelegramLink::where('user_id', $owner->id)->count());

        $manager->update(['is_active' => false]);
        $this->telegramText($bot, '5550002', '/today')->assertOk();
        $this->assertStringContainsString('cannot use this bot', $this->lastText('5550002'));
    }

    public function test_admin_unlink_and_settings(): void
    {
        $owner = $this->staff('owner', '+9607820288');
        Sanctum::actingAs($owner, ['staff']);
        $bot = $this->bot();
        $link = $this->link($bot, $owner, '5550001');

        $this->getJson('/api/admin/telegram')->assertOk()
            ->assertJsonPath('settings.alerts_enabled', true)
            ->assertJsonPath('bots.0.linked_count', 1);

        $this->putJson('/api/admin/telegram/settings', ['alerts_enabled' => false])->assertOk()->assertJsonPath('settings.alerts_enabled', false);
        $this->deleteJson('/api/admin/telegram/links/' . $link->id)->assertOk();
        $this->assertSame(0, TelegramLink::count());
        $this->assertStringContainsString('unlinked', $this->lastText('5550001'));
    }
}
