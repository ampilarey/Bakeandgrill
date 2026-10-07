<?php

declare(strict_types=1);

namespace App\Domains\Telegram\Services;

use App\Domains\Permissions\Services\PermissionService;
use App\Domains\Telegram\Exceptions\TelegramApiException;
use App\Domains\Telegram\Support\TelegramOrderText as O;
use App\Domains\Telegram\Support\TelegramText as T;
use App\Models\Order;
use App\Models\TelegramBot;
use App\Models\TelegramGroup;
use App\Models\TelegramGroupPost;
use App\Models\TelegramLink;
use App\Models\User;
use App\Services\AuditLogService;
use App\Services\OrderStatusMachine;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Online orders in a shop group (owner, 2026-10-07: "Do it", on the group
 * feed). The owner adds the bot to a Telegram group and sends /feed there;
 * from then on every paid online order arrives in the group as a card with
 * Start and Ready (and Collected for a pickup). Whoever presses a button
 * must have linked their own Telegram and hold pos.manage_order_status;
 * the card then says who did it. The card follows the order when it is
 * moved on from the till, the kitchen screen or the driver.
 */
class TelegramGroupFeed
{
    /** Customer orders made online, paid before the kitchen starts. */
    public const ONLINE_TYPES = ['online_pickup', 'delivery', 'dine_in'];

    private const STEP_STATUS = ['s' => 'in_progress', 'r' => 'ready', 'c' => 'completed'];

    public function __construct(
        private readonly TelegramClient $client,
        private readonly PermissionService $permissions,
    ) {}

    // ── Messages in a group ──────────────────────────────────────────────

    /** @param array<string, mixed> $message */
    public function handleMessage(TelegramBot $bot, array $message): void
    {
        $chatId = (string) ($message['chat']['id'] ?? '');
        if ($chatId === '') {
            return;
        }

        // A group that became a supergroup gets a new id; follow it.
        if (isset($message['migrate_to_chat_id'])) {
            TelegramGroup::query()->where('telegram_bot_id', $bot->id)->where('chat_id', $chatId)
                ->update(['chat_id' => (string) $message['migrate_to_chat_id']]);

            return;
        }

        $botId = (int) ($bot->bot_user_id ?? 0);
        foreach ((array) ($message['new_chat_members'] ?? []) as $member) {
            if ($botId > 0 && (int) ($member['id'] ?? 0) === $botId) {
                $this->introduce($bot, $chatId);

                return;
            }
        }
        if ($botId > 0 && (int) ($message['left_chat_member']['id'] ?? 0) === $botId) {
            TelegramGroup::query()->where('telegram_bot_id', $bot->id)->where('chat_id', $chatId)
                ->update(['is_enabled' => false, 'last_error' => 'The bot was removed from the group.']);

            return;
        }

        $text = trim((string) ($message['text'] ?? ''));
        if (!preg_match('/^\/(feed|stopfeed)(?:@(\w+))?\s*$/i', $text, $m)) {
            return; // the bot keeps quiet in groups
        }
        if (($m[2] ?? '') !== '' && strcasecmp($m[2], (string) $bot->username) !== 0) {
            return; // meant for another bot
        }

        $user = $this->staffFor((string) ($message['from']['id'] ?? ''));
        if ($user === null || !$this->permissions->hasPermission($user, 'telegram.manage')) {
            $this->say($bot, $chatId, 'Only the owner can do this (Admin → Telegram access), from a Telegram account linked to the bot.');

            return;
        }

        $title = mb_substr(trim((string) ($message['chat']['title'] ?? '')), 0, 128) ?: null;
        $group = TelegramGroup::query()->firstOrNew(['telegram_bot_id' => $bot->id, 'chat_id' => $chatId]);
        $before = $group->exists ? ['is_enabled' => $group->is_enabled, 'feeds' => $group->feeds] : [];

        if (strtolower($m[1]) === 'stopfeed') {
            if (!$group->exists) {
                $this->say($bot, $chatId, 'This group gets no orders.');

                return;
            }
            $group->forceFill(['is_enabled' => false, 'title' => $title ?? $group->title])->save();
            $this->audit('telegram.group_stopped', $group, $before, $user);
            $this->say($bot, $chatId, '⏸ Online orders stopped for this group. Send /feed to start them again.');

            return;
        }

        $group->forceFill([
            'title' => $title ?? $group->title,
            'feeds' => array_values(array_unique(array_merge((array) ($group->feeds ?? []), [TelegramGroup::FEED_ONLINE_ORDERS]))),
            'is_enabled' => true,
            'added_by' => $group->added_by ?? $user->id,
            'last_error' => null,
        ])->save();
        $this->audit('telegram.group_feed_on', $group, $before, $user);
        $this->say($bot, $chatId, "✅ <b>This group now gets online orders.</b>\n\n"
            . "Each paid order arrives here with <b>Start</b> and <b>Ready</b> (and <b>Collected</b> for a pickup).\n"
            . "To press a button, link your own Telegram first (ask the owner) and have the right to change orders.\n\n"
            . 'Turn it off with /stopfeed, or in Admin → Telegram → Groups.');
    }

    private function introduce(TelegramBot $bot, string $chatId): void
    {
        $known = TelegramGroup::query()->where('telegram_bot_id', $bot->id)->where('chat_id', $chatId)->where('is_enabled', true)->exists();
        if ($known) {
            return;
        }
        $command = '/feed' . ($bot->username ? '@' . $bot->username : '');
        $this->say($bot, $chatId, "👋 Hi. I can post every paid online order here, with Start and Ready buttons.\n\n"
            . 'The owner turns it on by sending <code>' . T::e($command) . '</code> in this group.');
    }

    // ── Posting an order ─────────────────────────────────────────────────

    /** Whether this order belongs in the feed: made online by a customer. */
    public static function isOnlineOrder(Order $order): bool
    {
        return $order->user_id === null
            && in_array((string) $order->type, self::ONLINE_TYPES, true)
            && !in_array((string) $order->status, ['payment_pending', 'cancelled', 'refunded'], true);
    }

    /** Post the order to every live group that has not had it yet. */
    public function postOrder(int $orderId): void
    {
        $order = Order::query()->find($orderId);
        if ($order === null || !self::isOnlineOrder($order)) {
            return;
        }
        $groups = TelegramGroup::query()->with('bot')->where('is_enabled', true)->get()
            ->filter(fn (TelegramGroup $g) => $g->isLive(TelegramGroup::FEED_ONLINE_ORDERS));

        foreach ($groups as $group) {
            if (TelegramGroupPost::query()->where('telegram_group_id', $group->id)->where('order_id', $order->id)->exists()) {
                continue;
            }
            $post = new TelegramGroupPost(['telegram_group_id' => $group->id, 'order_id' => $order->id, 'acted' => []]);
            [$html, $buttons] = $this->card($order, $post);
            try {
                $sent = $this->client->sendMessage($group->bot, $group->chat_id, $html, $buttons);
                $post->message_id = (int) ($sent['message_id'] ?? 0);
                $post->save();
                $group->forceFill(['last_posted_at' => now(), 'last_error' => null])->save();
            } catch (TelegramApiException $e) {
                $this->failed($group, $e);
            } catch (Throwable $e) {
                Log::warning('telegram group: order not posted', ['group_id' => $group->id, 'order_id' => $order->id, 'error' => $e->getMessage()]);
            }
        }
    }

    /** Bring every card for this order up to date (after a status change anywhere). */
    public function refresh(int $orderId): void
    {
        $posts = TelegramGroupPost::query()->with('group.bot')->where('order_id', $orderId)->get();
        if ($posts->isEmpty()) {
            return;
        }
        $order = Order::query()->find($orderId);
        if ($order === null) {
            return;
        }
        foreach ($posts as $post) {
            $group = $post->group;
            if ($group === null || $group->bot === null || !$group->bot->is_enabled || $post->message_id <= 0) {
                continue;
            }
            [$html, $buttons] = $this->card($order, $post);
            try {
                $this->client->editMessage($group->bot, $group->chat_id, $post->message_id, $html, $buttons);
            } catch (TelegramApiException $e) {
                // An old card may no longer be editable; the next order still posts.
                Log::info('telegram group: card not updated', ['post_id' => $post->id, 'error' => $e->getMessage()]);
            }
        }
    }

    /**
     * @return array{0: string, 1: array<int, array<int, array<string, string>>>}
     */
    public function card(Order $order, TelegramGroupPost $post): array
    {
        $order->loadMissing(['items.modifiers', 'customer', 'deliveryDriver']);
        $commands = app(TelegramCommands::class);
        $acted = (array) ($post->acted ?? []);

        $paidBy = O::paidBy($order, fn (string $m) => $commands->methodLabel($m));
        $lines = ['🛒 <b>Online order ' . O::number($order) . '</b> · ' . T::e(O::type($order))];
        $lines[] = '<b>' . T::mvr($order->total) . '</b> · ' . ($paidBy !== '' ? 'paid, ' . T::e($paidBy) : ($order->payment_status === 'paid' ? 'paid' : 'not paid yet'));
        $placed = $order->paid_at ?? $order->created_at;
        $due = O::due($order);
        $lines[] = 'Placed ' . ($placed?->format('g:i a') ?? '') . ($due !== null ? ' · <b>wanted ' . T::e($due) . '</b>' : '');
        $lines[] = '';
        foreach (O::itemLines($order) as $line) {
            $lines[] = $line;
        }

        $who = array_filter([O::customerName($order), O::customerPhone($order)]);
        if ($who !== []) {
            $lines[] = '';
            $lines[] = '👤 ' . T::e(implode(' · ', $who));
        }
        if ($order->type === 'delivery') {
            $address = O::address($order);
            $map = O::mapLink($order);
            if ($address !== '' || $map !== null) {
                $lines[] = '📍 ' . T::e($address !== '' ? $address : 'Pin on the map') . ($map !== null ? ' · <a href="' . T::e($map) . '">map</a>' : '');
            }
        }
        $note = trim(implode(' · ', array_filter([trim((string) $order->customer_notes), trim((string) $order->delivery_notes)])));
        if ($note !== '') {
            $lines[] = '📝 ' . T::e($note);
        }

        $lines[] = '';
        $lines[] = $this->statusLine($order, $acted);

        return [T::clip(implode("\n", $lines)), $this->buttons($order)];
    }

    /** @param array<string, string> $acted */
    private function statusLine(Order $order, array $acted): string
    {
        $by = fn (string $status) => isset($acted[$status]) ? ' by ' . T::e($acted[$status]) : '';
        $driver = $order->deliveryDriver?->name;

        return match ((string) $order->status) {
            'pending', 'paid', 'partial' => '🆕 <b>Waiting to start</b>',
            'held' => '⏸ <b>On hold</b>',
            'in_progress' => '👨‍🍳 <b>Cooking</b>' . $by('in_progress'),
            'ready' => '✅ <b>Ready</b>' . $by('ready')
                . ($order->type === 'delivery' ? ($driver ? ' · driver ' . T::e($driver) : ' · needs a driver') : ''),
            'out_for_delivery' => '🛵 <b>With the driver</b>' . ($driver ? ' · ' . T::e($driver) : ''),
            'picked_up', 'on_the_way' => '🛵 <b>On the way</b>' . ($driver ? ' · ' . T::e($driver) : ''),
            'delivered' => '🏁 <b>Delivered</b>' . ($driver ? ' by ' . T::e($driver) : ''),
            'completed' => '🏁 <b>Done</b>' . ($order->type === 'online_pickup' ? ', collected' . $by('completed') : ''),
            'cancelled' => '✖ <b>Cancelled</b>',
            'refunded', 'partially_refunded' => '↩️ <b>Refunded</b>',
            default => '<b>' . T::e(ucfirst(str_replace('_', ' ', (string) $order->status))) . '</b>',
        };
    }

    /** @return array<int, array<int, array<string, string>>> */
    private function buttons(Order $order): array
    {
        $id = $order->id;

        return match ((string) $order->status) {
            'pending', 'paid' => [[T::button('👨‍🍳 Start', 'gp:s:' . $id), T::button('✅ Ready', 'gp:r:' . $id)]],
            'in_progress' => [[T::button('✅ Ready', 'gp:r:' . $id)]],
            'ready' => $order->type === 'online_pickup' ? [[T::button('📦 Collected', 'gp:c:' . $id)]] : [],
            default => [],
        };
    }

    // ── Buttons in a group ───────────────────────────────────────────────

    /** @param array<string, mixed> $callback */
    public function handleCallback(TelegramBot $bot, array $callback): void
    {
        $callbackId = (string) ($callback['id'] ?? '');
        $chatId = (string) ($callback['message']['chat']['id'] ?? '');
        $messageId = (int) ($callback['message']['message_id'] ?? 0);
        [$prefix, $step, $orderId] = array_pad(explode(':', (string) ($callback['data'] ?? ''), 3), 3, '');

        $group = TelegramGroup::query()->with('bot')->where('telegram_bot_id', $bot->id)->where('chat_id', $chatId)->first();
        if ($prefix !== 'gp' || !isset(self::STEP_STATUS[$step]) || $group === null || !$group->is_enabled) {
            $this->client->answerCallback($bot, $callbackId, 'This group is not set up for orders.', true);

            return;
        }

        $user = $this->staffFor((string) ($callback['from']['id'] ?? ''));
        if ($user === null) {
            $this->client->answerCallback($bot, $callbackId, 'Link your own Telegram first: ask the owner for your link (Admin → Telegram).', true);

            return;
        }
        if (!$this->permissions->hasPermission($user, 'pos.manage_order_status')) {
            $this->client->answerCallback($bot, $callbackId, 'Your account cannot change orders.', true);

            return;
        }

        try {
            [$order, $message] = $this->move((int) $orderId, self::STEP_STATUS[$step], $user);
        } catch (Throwable $e) {
            report($e);
            $this->client->answerCallback($bot, $callbackId, 'Something went wrong. Use the till.', true);

            return;
        }
        if ($order === null) {
            $this->client->answerCallback($bot, $callbackId, $message, true);
            $this->refresh((int) $orderId);

            return;
        }

        $post = TelegramGroupPost::query()->firstOrNew(['telegram_group_id' => $group->id, 'order_id' => $order->id]);
        $acted = (array) ($post->acted ?? []);
        $acted[self::STEP_STATUS[$step]] = (string) $user->name;
        if (!$post->exists) {
            $post->message_id = $messageId;
        }
        $post->acted = $acted;
        $post->save();

        $this->client->answerCallback($bot, $callbackId, $message);
        [$html, $buttons] = $this->card($order, $post);
        $this->client->editMessage($bot, $chatId, $post->message_id ?: $messageId, $html, $buttons);
    }

    /**
     * The same moves the till's Start / Ready / Picked up make, with the
     * same checks, audited with source "telegram".
     *
     * @return array{0: ?Order, 1: string} the order, or null and why not
     */
    public function move(int $orderId, string $to, User $user): array
    {
        $result = DB::transaction(function () use ($orderId, $to, $user): array {
            $order = Order::query()->lockForUpdate()->find($orderId);
            if ($order === null) {
                return [null, 'That order is gone.'];
            }
            if ($order->status === $to) {
                return [$order, 'Already done.'];
            }
            if (!app(OrderStatusMachine::class)->isAllowed((string) $order->status, $to)) {
                return [null, 'Order is ' . str_replace('_', ' ', (string) $order->status) . ' now, so that cannot be done.'];
            }
            $paid = $order->payment_status === 'paid' || $order->status === 'paid';
            if ($to === 'ready' && $order->type === 'online_pickup' && !$paid) {
                return [null, 'Not paid yet: wait for the payment before marking it ready.'];
            }
            if ($to === 'completed' && !$paid) {
                return [null, 'Not paid yet: take the payment at the till first.'];
            }

            $old = (string) $order->status;
            $updates = ['status' => $to];
            if ($to === 'in_progress' && !$order->fired_at) {
                $updates['fired_at'] = now();
            }
            if ($to === 'completed') {
                $updates['completed_at'] = now();
            }
            $order->update($updates);

            $action = ['in_progress' => 'order.started', 'ready' => 'order.ready', 'completed' => 'order.completed'][$to];
            app(AuditLogService::class)->log($action, 'Order', $order->id, ['status' => $old], ['status' => $to], ['source' => 'telegram'], app(TelegramCommands::class)->requestAs($user));

            if ($to === 'completed') {
                $fresh = $order->fresh();
                DB::afterCommit(fn () => \App\Domains\Orders\Events\OrderCompleted::dispatch(\App\Domains\Orders\DTOs\OrderCompletedData::fromOrder($fresh)));
            }

            return [$order, match ($to) {
                'in_progress' => 'Started.',
                'ready' => 'Marked ready.',
                default => 'Collected.',
            }];
        });

        return [$result[0]?->fresh(), $result[1]];
    }

    // ── Helpers ──────────────────────────────────────────────────────────

    /**
     * The staff member behind a Telegram account: in a private chat the
     * chat id is the person's id, so their link on any enabled bot names them.
     */
    public function staffFor(string $telegramUserId): ?User
    {
        if ($telegramUserId === '') {
            return null;
        }
        $link = TelegramLink::query()->with(['bot', 'user.role'])
            ->where('chat_id', $telegramUserId)->whereNotNull('user_id')->get()
            ->first(fn (TelegramLink $l) => $l->isUsable());

        return $link?->user;
    }

    private function say(TelegramBot $bot, string $chatId, string $html): void
    {
        try {
            $this->client->sendMessage($bot, $chatId, $html);
        } catch (TelegramApiException $e) {
            Log::info('telegram group: reply failed', ['bot' => $bot->id, 'error' => $e->getMessage()]);
        }
    }

    private function failed(TelegramGroup $group, TelegramApiException $e): void
    {
        $fields = ['last_error' => mb_substr($e->getMessage(), 0, 500)];
        // Removed from the group, or the group is gone: stop trying.
        if ($e->isBlocked() || str_contains($e->getMessage(), 'chat not found')) {
            $fields['is_enabled'] = false;
        }
        $group->forceFill($fields)->save();
        Log::warning('telegram group: not delivered', ['group_id' => $group->id, 'error' => $e->getMessage()]);
    }

    /** @param array<string, mixed> $before */
    private function audit(string $action, TelegramGroup $group, array $before, User $user): void
    {
        app(AuditLogService::class)->log($action, 'TelegramGroup', $group->id, $before, [
            'title' => $group->title, 'is_enabled' => $group->is_enabled, 'feeds' => $group->feeds,
        ], ['source' => 'telegram'], app(TelegramCommands::class)->requestAs($user));
    }
}
