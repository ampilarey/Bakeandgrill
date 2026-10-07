<?php

declare(strict_types=1);

namespace App\Domains\Telegram\Services;

use App\Domains\Permissions\Services\PermissionService;
use App\Models\Order;
use App\Models\TelegramGroupPost;
use App\Models\TelegramLink;
use App\Models\User;
use Throwable;

/**
 * The cashier level (owner, 2026-10-07: "Next"). What a cashier, or anyone
 * with the same permissions, gets beyond alerts:
 *  - 📥 Online orders: today's online orders not handed over yet, each as
 *    the group feed's card with Start / Ready / Collected
 *    (pos.manage_order_status);
 *  - 🛒 Buying list: add what is needed by typing, approve, buy
 *    (TelegramBuyingList, purchase request permissions).
 * No "my shift" figures: the cash count at close is blind, so the bot does
 * not tell a cashier what the drawer should hold.
 */
class TelegramCashierDesk
{
    public const BTN_ONLINE = '📥 Online orders';

    /** Waiting on the shop: not yet with a driver or collected. */
    private const SHOP_STATUSES = ['pending', 'paid', 'in_progress', 'ready'];

    public function __construct(
        private readonly TelegramClient $client,
        private readonly PermissionService $permissions,
    ) {}

    /** @return list<string> */
    public function menuButtons(User $user): array
    {
        $b = [];
        if ($this->permissions->hasPermission($user, 'pos.manage_order_status')) {
            $b[] = self::BTN_ONLINE;
        }
        if ($this->buying()->canUse($user)) {
            $b[] = TelegramBuyingList::BTN;
        }

        return $b;
    }

    /** @return list<string> */
    public function helpLines(User $user): array
    {
        $lines = [];
        if ($this->permissions->hasPermission($user, 'pos.manage_order_status')) {
            $lines[] = '<b>' . self::BTN_ONLINE . '</b>: online orders not handed over yet, with Start, Ready and Collected.';
        }
        if ($this->buying()->canUse($user)) {
            $lines[] = '<b>' . TelegramBuyingList::BTN . '</b>: type what is needed (<code>5 kg onions, 2 l milk</code>) to add it; approve requests; tick off what you bought.';
        }

        return $lines;
    }

    public function handleText(TelegramLink $link, User $user, string $raw, ?string $command): bool
    {
        if ($raw === self::BTN_ONLINE || $command === 'online') {
            $this->onlineOrders($link, $user);

            return true;
        }
        if ($raw === TelegramBuyingList::BTN || $command === 'buying') {
            $this->buying()->show($link, $user);

            return true;
        }
        if ($command === 'need' || preg_match('/^need\s+\S/iu', $raw)) {
            return $this->buying()->add($link, $user, $raw);
        }

        return false;
    }

    public function onlineOrders(TelegramLink $link, User $user): void
    {
        if (!$this->permissions->hasPermission($user, 'pos.manage_order_status')) {
            app(TelegramCommands::class)->refuse($link);

            return;
        }
        $orders = Order::query()
            ->whereNull('user_id')
            ->whereIn('type', TelegramGroupFeed::ONLINE_TYPES)
            ->whereIn('status', self::SHOP_STATUSES)
            ->whereNotNull('paid_at')
            ->where('paid_at', '>=', now()->subDay())
            ->orderBy('paid_at')
            ->limit(10)
            ->get();
        if ($orders->isEmpty()) {
            app(TelegramCommands::class)->send($link, '📥 <b>No online orders waiting.</b>');

            return;
        }

        app(TelegramCommands::class)->send($link, '📥 <b>Online orders</b> (' . $orders->count() . '), oldest first');
        $feed = app(TelegramGroupFeed::class);
        foreach ($orders as $order) {
            [$html, $buttons] = $feed->card($order, new TelegramGroupPost(['acted' => []]));
            app(TelegramCommands::class)->send($link, $html, [], $buttons);
        }
    }

    /** A Start / Ready / Collected press in a private chat (gp:s:ID). */
    public function orderTap(TelegramLink $link, User $user, string $callbackId, int $messageId, string $arg): void
    {
        [$step, $orderId] = array_pad(explode(':', $arg, 2), 2, '0');
        $to = ['s' => 'in_progress', 'r' => 'ready', 'c' => 'completed'][$step] ?? null;
        if ($to === null) {
            $this->client->answerCallback($link->bot, $callbackId, 'This button is no longer used.');

            return;
        }
        if (!$this->permissions->hasPermission($user, 'pos.manage_order_status')) {
            $this->client->answerCallback($link->bot, $callbackId, 'Your account cannot change orders.', true);

            return;
        }

        $feed = app(TelegramGroupFeed::class);
        try {
            [$order, $message] = $feed->move((int) $orderId, $to, $user);
        } catch (Throwable $e) {
            report($e);
            $this->client->answerCallback($link->bot, $callbackId, 'Something went wrong. Use the till.', true);

            return;
        }
        $this->client->answerCallback($link->bot, $callbackId, $message, $order === null);
        $order ??= Order::query()->find((int) $orderId);
        if ($order === null) {
            return;
        }
        [$html, $buttons] = $feed->card($order, new TelegramGroupPost(['acted' => [$to => (string) $user->name]]));
        $this->client->editMessage($link->bot, $link->chat_id, $messageId, $html, $buttons);
    }

    private function buying(): TelegramBuyingList
    {
        return app(TelegramBuyingList::class);
    }
}
