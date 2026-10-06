<?php

declare(strict_types=1);

namespace Tests\Feature\Telegram;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Domains\Telegram\Services\TelegramLinker;
use App\Models\Role;
use App\Models\TelegramBot;
use App\Models\TelegramLink;
use App\Models\User;
use Illuminate\Http\Client\Request as HttpRequest;
use Illuminate\Support\Facades\Http;

/** A fake Telegram: records every call and answers like the Bot API. */
trait FakesTelegram
{
    /** @var list<array{method: string, params: array<string, mixed>}> */
    protected array $telegramCalls = [];

    protected string $webhookUrlOnTelegram = '';

    protected bool $telegramDown = false;

    protected function fakeTelegram(): void
    {
        $this->telegramCalls = [];
        Http::fake(['api.telegram.org/*' => function (HttpRequest $request) {
            $method = (string) last(explode('/', parse_url($request->url(), PHP_URL_PATH)));
            $params = $request->data();
            $this->telegramCalls[] = ['method' => $method, 'params' => $params];
            if ($this->telegramDown) {
                return Http::response(['ok' => false, 'error_code' => 502, 'description' => 'Bad Gateway'], 502);
            }

            return match ($method) {
                'getMe' => Http::response(['ok' => true, 'result' => ['id' => 777000111, 'is_bot' => true, 'username' => 'BakeGrillStaffBot']]),
                'getWebhookInfo' => Http::response(['ok' => true, 'result' => ['url' => $this->webhookUrlOnTelegram, 'pending_update_count' => 0]]),
                'setWebhook' => (function () use ($params) {
                    $this->webhookUrlOnTelegram = (string) ($params['url'] ?? '');

                    return Http::response(['ok' => true, 'result' => true]);
                })(),
                'sendMessage' => Http::response(['ok' => true, 'result' => ['message_id' => count($this->telegramCalls)]]),
                default => Http::response(['ok' => true, 'result' => true]),
            };
        }]);
    }

    /** @return list<array<string, mixed>> */
    protected function sent(?string $chatId = null): array
    {
        return array_values(array_map(
            fn (array $c) => $c['params'],
            array_filter($this->telegramCalls, fn (array $c) => $c['method'] === 'sendMessage' && ($chatId === null || (string) ($c['params']['chat_id'] ?? '') === $chatId)),
        ));
    }

    protected function lastText(?string $chatId = null): string
    {
        $all = $this->sent($chatId);

        return (string) (end($all)['text'] ?? '');
    }

    protected function roles(): void
    {
        foreach (['owner' => 'Owner', 'manager' => 'Manager', 'staff' => 'Staff', 'kitchen_staff' => 'Kitchen Staff'] as $slug => $name) {
            Role::firstOrCreate(['slug' => $slug], ['name' => $name, 'is_active' => true]);
        }
        PermissionCatalogSync::sync();
    }

    protected function staff(string $role, string $phone, string $name = 'Person'): User
    {
        return User::factory()->create([
            'name' => $name,
            'phone' => $phone,
            'is_active' => true,
            'role_id' => Role::where('slug', $role)->value('id'),
        ]);
    }

    protected function bot(array $roles = TelegramBot::ROLES): TelegramBot
    {
        return TelegramBot::create([
            'name' => 'Staff bot',
            'token' => '123456789:AAEexampleexampleexampleexample123',
            'username' => 'BakeGrillStaffBot',
            'roles' => $roles,
            'is_enabled' => true,
        ]);
    }

    protected function link(TelegramBot $bot, User $user, string $chatId): TelegramLink
    {
        $code = app(TelegramLinker::class)->issue($bot, $user, null, null)['code'];

        return app(TelegramLinker::class)->consume($bot, $code, $chatId, ['first_name' => $user->name]);
    }

    /** What Telegram would POST for a text message. */
    protected function telegramText(TelegramBot $bot, string $chatId, string $text, ?int $updateId = null): \Illuminate\Testing\TestResponse
    {
        static $next = 1000;

        return $this->postJson('/api/telegram/webhook/' . $bot->id, [
            'update_id' => $updateId ?? ++$next,
            'message' => [
                'message_id' => ++$next,
                'chat' => ['id' => (int) $chatId, 'type' => 'private'],
                'from' => ['id' => (int) $chatId, 'first_name' => 'Tester', 'username' => 'tester'],
                'text' => $text,
            ],
        ], ['X-Telegram-Bot-Api-Secret-Token' => $bot->webhook_secret]);
    }

    protected function telegramButton(TelegramBot $bot, string $chatId, string $data, ?string $fromId = null): \Illuminate\Testing\TestResponse
    {
        static $next = 50000;

        return $this->postJson('/api/telegram/webhook/' . $bot->id, [
            'update_id' => ++$next,
            'callback_query' => [
                'id' => 'cb' . $next,
                'from' => ['id' => (int) ($fromId ?? $chatId)],
                'data' => $data,
                'message' => ['message_id' => 42, 'chat' => ['id' => (int) $chatId, 'type' => 'private']],
            ],
        ], ['X-Telegram-Bot-Api-Secret-Token' => $bot->webhook_secret]);
    }
}
