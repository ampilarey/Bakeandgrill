<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Telegram\Exceptions\TelegramApiException;
use App\Domains\Telegram\Listeners\SendDayReportOnLastShiftClose;
use App\Domains\Telegram\Services\TelegramAlertCopier;
use App\Domains\Telegram\Services\TelegramClient;
use App\Domains\Telegram\Services\TelegramLinker;
use App\Domains\Telegram\Services\TelegramOwnerTools;
use App\Http\Controllers\Controller;
use App\Models\DeliveryDriver;
use App\Models\SiteSetting;
use App\Models\TelegramBot;
use App\Models\TelegramGroup;
use App\Models\TelegramLink;
use App\Models\User;
use App\Services\AuditLogService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * Admin → Telegram (owner-only: telegram.manage). Bots, who is linked,
 * and how alerts use Telegram. A bot token is write-only.
 */
class TelegramAdminController extends Controller
{
    /** What someone sees when they type "/" in the chat. */
    private const COMMANDS = [
        ['command' => 'today', 'description' => 'Sales so far today'],
        ['command' => 'shifts', 'description' => 'Open shifts and drawer cash'],
        ['command' => 'orders', 'description' => 'Orders not finished yet'],
        ['command' => 'approvals', 'description' => 'Refunds waiting for a decision'],
        ['command' => 'soldout', 'description' => 'What is sold out; /soldout kottu to mark one'],
        ['command' => 'week', 'description' => 'This week so far, against last week'],
        ['command' => 'month', 'description' => 'This month so far, against last month'],
        ['command' => 'cashiers', 'description' => 'Sales by cashier today'],
        ['command' => 'shop', 'description' => 'Pause online orders or delivery; closed days'],
        ['command' => 'owed', 'description' => 'Refunds still to pay back'],
        ['command' => 'complaints', 'description' => 'Open complaints, with Reply'],
        ['command' => 'customer', 'description' => 'Look up a customer: /customer 7820288'],
        ['command' => 'online', 'description' => 'Online orders waiting, with Start and Ready'],
        ['command' => 'buying', 'description' => 'Buying list: add, approve, buy'],
        ['command' => 'prep', 'description' => 'Today\'s prep list, with Made'],
        ['command' => 'kitchen', 'description' => 'What is on the kitchen board now'],
        ['command' => 'checkin', 'description' => 'Bought items to check in'],
        ['command' => 'more', 'description' => 'Who\'s working, low stock, find an order, message staff'],
        ['command' => 'order', 'description' => 'Find an order: /order 1042'],
        ['command' => 'deliveries', 'description' => 'Drivers: your deliveries'],
        ['command' => 'help', 'description' => 'What the buttons do'],
        ['command' => 'stop', 'description' => 'Unlink this chat'],
    ];

    /** In a shop group (online orders feed). */
    private const GROUP_COMMANDS = [
        ['command' => 'feed', 'description' => 'Online orders here; "/feed buying" for the buying list (owner)'],
        ['command' => 'stopfeed', 'description' => 'Stop posting here; "/stopfeed buying" for the buying list (owner)'],
    ];

    public function __construct(
        private readonly TelegramClient $client,
        private readonly TelegramLinker $linker,
        private readonly AuditLogService $audit,
    ) {}

    public function index(): JsonResponse
    {
        $bots = TelegramBot::query()->orderBy('id')->get();
        $links = TelegramLink::query()->get();

        $users = User::query()->with('role:id,slug,name')->where('is_active', true)->orderBy('name')->get(['id', 'name', 'phone', 'role_id']);
        $drivers = DeliveryDriver::query()->where('is_active', true)->orderBy('name')->get(['id', 'name', 'phone']);

        $people = [];
        foreach ($users as $u) {
            $role = $u->role?->slug === 'admin' ? 'owner' : (string) ($u->role?->slug ?? '');
            $people[] = $this->person('user', (int) $u->id, (string) $u->name, $u->phone, $role, (string) ($u->role?->name ?? ''), $links->where('user_id', $u->id));
        }
        foreach ($drivers as $d) {
            $people[] = $this->person('driver', (int) $d->id, (string) $d->name, $d->phone, 'driver', 'Driver', $links->where('delivery_driver_id', $d->id));
        }

        return response()->json([
            'bots' => $bots->map(fn (TelegramBot $b) => $this->botJson($b, $links->where('telegram_bot_id', $b->id)->count()))->values(),
            'people' => $people,
            'roles' => array_map(fn (string $r) => ['key' => $r, 'label' => $this->roleLabel($r)], TelegramBot::ROLES),
            'groups' => TelegramGroup::query()->with(['bot:id,name,username', 'addedBy:id,name'])->orderBy('id')->get()
                ->map(fn (TelegramGroup $g) => $this->groupJson($g))->values(),
            'settings' => self::settingsJson(),
            'webhook_base' => rtrim((string) config('app.url'), '/'),
        ]);
    }

    public function storeBot(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => 'required|string|max:80',
            'token' => ['required', 'string', 'max:120', 'regex:/^\d{5,}:[A-Za-z0-9_-]{30,}$/'],
            'roles' => 'required|array|min:1',
            'roles.*' => ['string', Rule::in(TelegramBot::ROLES)],
            'take_over' => 'sometimes|boolean',
        ], [
            'token.regex' => 'That does not look like a bot token. Copy the whole token BotFather sent (numbers, a colon, then letters).',
        ]);

        $bot = new TelegramBot([
            'name' => $data['name'],
            'token' => trim($data['token']),
            'roles' => array_values(array_unique($data['roles'])),
            'is_enabled' => true,
        ]);

        if (TelegramBot::query()->get()->contains(fn (TelegramBot $b) => $b->token === $bot->token)) {
            return response()->json(['message' => 'This bot is already added.', 'errors' => ['token' => ['This bot is already added.']]], 422);
        }

        $problem = $this->connect($bot, (bool) ($data['take_over'] ?? false), saveFirst: true);
        if ($problem !== null) {
            return $problem;
        }

        $this->audit->log('telegram.bot_added', 'TelegramBot', $bot->id, [], ['name' => $bot->name, 'username' => $bot->username, 'roles' => $bot->roles], [], $request);

        return response()->json(['bot' => $this->botJson($bot, 0)], 201);
    }

    public function updateBot(Request $request, int $id): JsonResponse
    {
        $bot = TelegramBot::query()->findOrFail($id);
        $data = $request->validate([
            'name' => 'sometimes|string|max:80',
            'roles' => 'sometimes|array|min:1',
            'roles.*' => ['string', Rule::in(TelegramBot::ROLES)],
            'is_enabled' => 'sometimes|boolean',
        ]);

        $before = ['name' => $bot->name, 'roles' => $bot->roles, 'is_enabled' => $bot->is_enabled];
        if (isset($data['name'])) {
            $bot->name = $data['name'];
        }
        if (isset($data['roles'])) {
            $bot->roles = array_values(array_unique($data['roles']));
        }
        $wasEnabled = $bot->is_enabled;
        if (array_key_exists('is_enabled', $data)) {
            $bot->is_enabled = (bool) $data['is_enabled'];
        }
        $bot->save();

        // Off: Telegram stops calling. On again: reconnect it here.
        if ($wasEnabled && !$bot->is_enabled) {
            try {
                $this->client->deleteWebhook($bot);
            } catch (TelegramApiException) {
                // Already gone, or the token was revoked; either way it is off.
            }
        } elseif (!$wasEnabled && $bot->is_enabled) {
            $problem = $this->connect($bot, takeOver: true, saveFirst: false);
            if ($problem !== null) {
                return $problem;
            }
        }

        $this->audit->log('telegram.bot_updated', 'TelegramBot', $bot->id, $before, ['name' => $bot->name, 'roles' => $bot->roles, 'is_enabled' => $bot->is_enabled], [], $request);

        return response()->json(['bot' => $this->botJson($bot, $bot->links()->count())]);
    }

    /** Ask Telegram whether the bot works and still points at this site. */
    public function checkBot(int $id): JsonResponse
    {
        $bot = TelegramBot::query()->findOrFail($id);
        try {
            $me = $this->client->getMe($bot);
            $hook = $this->client->getWebhookInfo($bot);
        } catch (TelegramApiException $e) {
            $bot->forceFill(['last_checked_at' => now(), 'last_error' => $e->getMessage()])->save();

            return response()->json(['ok' => false, 'message' => $this->friendly($e), 'bot' => $this->botJson($bot, $bot->links()->count())]);
        }

        $pointsHere = ($hook['url'] ?? '') === $bot->webhookUrl();
        $error = !$pointsHere
            ? (($hook['url'] ?? '') === '' ? 'Not connected to this site. Press Reconnect.' : 'Connected to a different site: ' . $hook['url'] . '. Press Reconnect to bring it back here.')
            : (isset($hook['last_error_message']) && (int) ($hook['last_error_date'] ?? 0) > now()->subHour()->timestamp ? 'Telegram reported: ' . $hook['last_error_message'] : null);

        $bot->forceFill([
            'username' => $me['username'] ?? $bot->username,
            'bot_user_id' => $me['id'] ?? $bot->bot_user_id,
            'last_checked_at' => now(),
            'last_error' => $error,
        ])->save();

        return response()->json([
            'ok' => $error === null,
            'message' => $error ?? 'Working. @' . $bot->username . ' is connected to this site.',
            'bot' => $this->botJson($bot, $bot->links()->count()),
        ]);
    }

    public function reconnectBot(Request $request, int $id): JsonResponse
    {
        $bot = TelegramBot::query()->findOrFail($id);
        $problem = $this->connect($bot, takeOver: true, saveFirst: false);
        if ($problem !== null) {
            return $problem;
        }
        $this->audit->log('telegram.bot_reconnected', 'TelegramBot', $bot->id, [], ['webhook' => $bot->webhookUrl()], [], $request);

        return response()->json(['bot' => $this->botJson($bot, $bot->links()->count()), 'message' => 'Reconnected.']);
    }

    public function destroyBot(Request $request, int $id): JsonResponse
    {
        $bot = TelegramBot::query()->findOrFail($id);
        try {
            $this->client->deleteWebhook($bot);
        } catch (TelegramApiException) {
            // The token may already be revoked; the bot is removed here regardless.
        }
        $this->audit->log('telegram.bot_removed', 'TelegramBot', $bot->id, ['name' => $bot->name, 'username' => $bot->username], [], [], $request);
        $bot->delete();

        return response()->json(['ok' => true]);
    }

    /** A one-time link for one person and one bot. */
    public function linkCode(Request $request): JsonResponse
    {
        $data = $request->validate([
            'bot_id' => 'required|integer|exists:telegram_bots,id',
            'user_id' => 'nullable|integer|exists:users,id|required_without:driver_id',
            'driver_id' => 'nullable|integer|exists:delivery_drivers,id|required_without:user_id',
        ]);
        $bot = TelegramBot::query()->findOrFail($data['bot_id']);
        $user = isset($data['user_id']) ? User::query()->with('role')->find($data['user_id']) : null;
        $driver = isset($data['driver_id']) ? DeliveryDriver::query()->find($data['driver_id']) : null;
        if ($user !== null && $driver !== null) {
            return response()->json(['message' => 'Choose one person.'], 422);
        }

        $role = $driver !== null ? 'driver' : ($user?->role?->slug === 'admin' ? 'owner' : (string) $user?->role?->slug);
        if (!$bot->serves($role)) {
            return response()->json(['message' => $bot->name . ' does not serve ' . $this->roleLabel($role) . '. Tick that role on the bot, or pick another bot.'], 422);
        }
        if (!$bot->is_enabled || $bot->username === null) {
            return response()->json(['message' => 'Turn the bot on and press Check first.'], 422);
        }

        $issued = $this->linker->issue($bot, $user, $driver, $request->user());
        $this->audit->log('telegram.link_code_made', $driver ? 'DeliveryDriver' : 'User', (int) ($driver?->id ?? $user?->id), [], ['bot_id' => $bot->id], [], $request);

        return response()->json([
            'url' => $issued['url'],
            'expires_at' => $issued['expires_at']->toIso8601String(),
            'minutes' => TelegramLinker::CODE_MINUTES,
            'bot_username' => $bot->username,
        ]);
    }

    /** "Send test" next to a linked person. */
    public function testLink(int $id): JsonResponse
    {
        $link = TelegramLink::query()->with('bot')->findOrFail($id);
        try {
            $this->client->sendMessage($link->bot, $link->chat_id, '✅ <b>Test from Bake &amp; Grill.</b> Alerts will arrive in this chat.');
        } catch (TelegramApiException $e) {
            if ($e->isBlocked()) {
                $link->forceFill(['blocked_at' => now()])->save();
            }

            return response()->json(['ok' => false, 'message' => $this->friendly($e)], 422);
        }
        $link->forceFill(['blocked_at' => null])->save();

        return response()->json(['ok' => true, 'message' => 'Sent.']);
    }

    public function unlink(Request $request, int $id): JsonResponse
    {
        $link = TelegramLink::query()->with('bot')->findOrFail($id);
        try {
            $this->client->sendMessage($link->bot, $link->chat_id, 'This chat has been unlinked from Bake &amp; Grill. You will get no more alerts here.', null, ['reply_markup' => ['remove_keyboard' => true]]);
        } catch (TelegramApiException) {
            // They may have blocked the bot already; unlink regardless.
        }
        $this->audit->log('telegram.unlinked', $link->delivery_driver_id ? 'DeliveryDriver' : 'User', (int) ($link->delivery_driver_id ?? $link->user_id), ['bot_id' => $link->telegram_bot_id, 'chat' => $link->telegram_username], [], [], $request);
        $link->delete();

        return response()->json(['ok' => true]);
    }

    // ── Groups (online orders feed, 2026-10-07) ──────────────────────────

    public function updateGroup(Request $request, int $id): JsonResponse
    {
        $group = TelegramGroup::query()->with(['bot', 'addedBy:id,name'])->findOrFail($id);
        $data = $request->validate([
            'is_enabled' => 'sometimes|boolean',
            'feeds' => 'sometimes|array',
            'feeds.*' => ['string', Rule::in(TelegramGroup::FEEDS)],
        ]);
        $before = ['is_enabled' => $group->is_enabled, 'feeds' => $group->feeds];
        if (array_key_exists('is_enabled', $data)) {
            $group->is_enabled = (bool) $data['is_enabled'];
            if ($group->is_enabled) {
                $group->last_error = null;
            }
        }
        if (array_key_exists('feeds', $data)) {
            $group->feeds = array_values(array_unique($data['feeds']));
        }
        $group->save();
        $this->audit->log('telegram.group_updated', 'TelegramGroup', $group->id, $before, ['is_enabled' => $group->is_enabled, 'feeds' => $group->feeds], [], $request);

        return response()->json(['group' => $this->groupJson($group)]);
    }

    public function testGroup(Request $request, int $id): JsonResponse
    {
        $group = TelegramGroup::query()->with('bot')->findOrFail($id);
        try {
            $this->client->sendMessage($group->bot, $group->chat_id, '🔔 Test from Admin → Telegram. What this group follows will arrive here.');
        } catch (TelegramApiException $e) {
            $group->forceFill(['last_error' => mb_substr($e->getMessage(), 0, 500)])->save();

            return response()->json(['message' => 'Telegram would not post there: ' . $this->friendly($e)], 422);
        }
        $group->forceFill(['last_error' => null])->save();

        return response()->json(['ok' => true]);
    }

    public function destroyGroup(Request $request, int $id): JsonResponse
    {
        $group = TelegramGroup::query()->with('bot')->findOrFail($id);
        try {
            $this->client->sendMessage($group->bot, $group->chat_id, 'This group was removed in Admin → Telegram, so I am leaving. Bye.');
            $this->client->call($group->bot, 'leaveChat', ['chat_id' => $group->chat_id]);
        } catch (TelegramApiException) {
            // Already removed from the group; forget it regardless.
        }
        $this->audit->log('telegram.group_removed', 'TelegramGroup', $group->id, ['title' => $group->title, 'chat_id' => $group->chat_id], [], [], $request);
        $group->delete();

        return response()->json(['ok' => true]);
    }

    public function updateSettings(Request $request): JsonResponse
    {
        $data = $request->validate([
            'alerts_enabled' => 'sometimes|boolean',
            'day_report' => 'sometimes|boolean',
            'alert_voids' => 'sometimes|boolean',
            'alert_cash' => 'sometimes|boolean',
            'alert_cash_min' => 'sometimes|numeric|min:0|max:100000',
        ]);
        $before = self::settingsJson();
        if (array_key_exists('alerts_enabled', $data)) {
            SiteSetting::set(TelegramAlertCopier::SETTING_ENABLED, $data['alerts_enabled'] ? '1' : '0');
        }
        if (array_key_exists('day_report', $data)) {
            SiteSetting::set(SendDayReportOnLastShiftClose::SETTING, $data['day_report'] ? '1' : '0');
        }
        // Telegram-only alerts (2026-10-07).
        if (array_key_exists('alert_voids', $data)) {
            SiteSetting::set(TelegramOwnerTools::SETTING_VOIDS, $data['alert_voids'] ? '1' : '0');
        }
        if (array_key_exists('alert_cash', $data)) {
            SiteSetting::set(TelegramOwnerTools::SETTING_CASH, $data['alert_cash'] ? '1' : '0');
        }
        if (array_key_exists('alert_cash_min', $data)) {
            SiteSetting::set(TelegramOwnerTools::SETTING_CASH_MIN, (string) round((float) $data['alert_cash_min'], 2));
        }
        SiteSetting::bust();
        $after = self::settingsJson();
        $this->audit->log('telegram.settings_updated', 'SiteSetting', null, $before, $after, [], $request);

        return response()->json(['settings' => $after]);
    }

    // ── Helpers ──────────────────────────────────────────────────────────

    /** @return array<string, mixed> */
    private static function settingsJson(): array
    {
        return [
            'alerts_enabled' => TelegramAlertCopier::enabled(),
            'day_report' => self::dayReportOn(),
            'alert_voids' => TelegramOwnerTools::voidsOn(),
            'alert_cash' => TelegramOwnerTools::cashOn(),
            'alert_cash_min' => TelegramOwnerTools::cashMin(),
        ];
    }

    private static function dayReportOn(): bool
    {
        return SendDayReportOnLastShiftClose::enabled();
    }

    /**
     * Check the token, make sure the bot is not serving another site (TEST
     * and production must each have their own bot), then point it here.
     */
    private function connect(TelegramBot $bot, bool $takeOver, bool $saveFirst): ?JsonResponse
    {
        try {
            $me = $this->client->getMe($bot);
            $hook = $this->client->getWebhookInfo($bot);
        } catch (TelegramApiException $e) {
            return response()->json(['message' => $this->friendly($e), 'errors' => ['token' => [$this->friendly($e)]]], 422);
        }

        $bot->username = (string) ($me['username'] ?? '');
        $bot->bot_user_id = isset($me['id']) ? (int) $me['id'] : null;

        $current = (string) ($hook['url'] ?? '');
        if ($saveFirst) {
            $bot->save(); // the webhook URL needs the id
        }
        if ($current !== '' && $current !== $bot->webhookUrl() && !$takeOver) {
            if ($saveFirst) {
                $bot->delete();
            }

            return response()->json([
                'message' => '@' . $bot->username . ' is already connected to another site (' . $current . '). Each site needs its own bot: create a new one in BotFather, or tick "Move it here" if that site no longer uses it.',
                'needs_take_over' => true,
                'other_url' => $current,
            ], 409);
        }

        try {
            $this->client->setWebhook($bot);
            $this->client->setCommands($bot, self::COMMANDS);
            $this->client->setCommands($bot, self::GROUP_COMMANDS, 'all_group_chats');
        } catch (TelegramApiException $e) {
            $bot->forceFill(['last_error' => $e->getMessage(), 'last_checked_at' => now()])->save();

            return response()->json(['message' => 'Telegram accepted the token but would not connect: ' . $this->friendly($e)], 422);
        }

        $bot->forceFill(['last_checked_at' => now(), 'last_error' => null])->save();

        return null;
    }

    /** @return array<string, mixed> */
    private function groupJson(TelegramGroup $group): array
    {
        return [
            'id' => $group->id,
            'title' => $group->title ?: 'Group ' . $group->chat_id,
            'bot' => $group->bot ? ['id' => $group->bot->id, 'name' => $group->bot->name, 'username' => $group->bot->username] : null,
            'feeds' => array_values((array) $group->feeds),
            'is_enabled' => (bool) $group->is_enabled,
            'added_by' => $group->addedBy?->name,
            'last_posted_at' => $group->last_posted_at?->toIso8601String(),
            'last_error' => $group->last_error,
            'created_at' => $group->created_at?->toIso8601String(),
        ];
    }

    /** @return array<string, mixed> */
    private function botJson(TelegramBot $bot, int $linked): array
    {
        return [
            'id' => $bot->id,
            'name' => $bot->name,
            'username' => $bot->username,
            'roles' => array_values((array) $bot->roles),
            'is_enabled' => (bool) $bot->is_enabled,
            'linked_count' => $linked,
            'last_checked_at' => $bot->last_checked_at?->toIso8601String(),
            'last_error' => $bot->last_error,
            'token_hint' => $bot->token ? substr((string) $bot->token, 0, strpos((string) $bot->token, ':') ?: 6) . ':•••' : null,
        ];
    }

    /**
     * @param \Illuminate\Support\Collection<int, TelegramLink> $links
     * @return array<string, mixed>
     */
    private function person(string $kind, int $id, string $name, ?string $phone, string $role, string $roleLabel, $links): array
    {
        return [
            'kind' => $kind,
            'id' => $id,
            'name' => $name,
            'phone' => $phone,
            'role' => $role,
            'role_label' => $roleLabel !== '' ? $roleLabel : $this->roleLabel($role),
            'links' => $links->map(fn (TelegramLink $l) => [
                'id' => $l->id,
                'bot_id' => $l->telegram_bot_id,
                'telegram_username' => $l->telegram_username,
                'telegram_name' => $l->telegram_name,
                'linked_at' => $l->linked_at?->toIso8601String(),
                'last_seen_at' => $l->last_seen_at?->toIso8601String(),
                'blocked' => $l->blocked_at !== null,
            ])->values()->all(),
        ];
    }

    private function roleLabel(string $role): string
    {
        return match ($role) {
            'owner' => 'Owner',
            'manager' => 'Manager',
            'staff' => 'Staff (cashier)',
            'kitchen_staff' => 'Kitchen staff',
            'driver' => 'Driver',
            default => ucfirst(str_replace('_', ' ', $role)),
        };
    }

    private function friendly(TelegramApiException $e): string
    {
        $m = $e->getMessage();
        if ($e->errorCode === 401 || stripos($m, 'Unauthorized') !== false) {
            return 'Telegram did not accept this token. Copy it again from BotFather (or it was revoked).';
        }
        if ($e->isBlocked()) {
            return 'This person blocked the bot or deleted the chat. Ask them to open the bot and press Start, or make a new link.';
        }
        if (str_starts_with($m, 'Could not reach Telegram')) {
            return 'Could not reach Telegram from the server. Try again in a minute.';
        }

        return $m;
    }
}
