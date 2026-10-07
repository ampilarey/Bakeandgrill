<?php

declare(strict_types=1);

namespace App\Domains\Telegram\Listeners;

use App\Domains\Orders\Events\OrderPaid;
use App\Domains\Orders\Events\OrderStatusChanged;
use App\Domains\Telegram\Services\TelegramGroupFeed;
use App\Models\Order;
use App\Models\TelegramGroup;
use App\Models\TelegramGroupPost;
use App\Support\DeferAfterResponse;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * The online orders feed (2026-10-07): a paid online order is posted to the
 * shop groups; any later status change updates the cards already posted.
 * Both run after the response and never affect the order itself.
 */
class FeedOnlineOrdersToTelegramGroups
{
    public function handle(OrderPaid|OrderStatusChanged $event): void
    {
        try {
            $orderId = (int) $event->data->orderId;
            if ($event instanceof OrderPaid) {
                if (!in_array($event->data->orderType, TelegramGroupFeed::ONLINE_TYPES, true)
                    || !TelegramGroup::query()->where('is_enabled', true)->exists()) {
                    return;
                }
                $order = Order::query()->find($orderId);
                if ($order === null || !TelegramGroupFeed::isOnlineOrder($order)) {
                    return;
                }
                DeferAfterResponse::run(static fn () => app(TelegramGroupFeed::class)->postOrder($orderId), 'telegram-group-post', always: true);

                return;
            }

            // OrderStatusChanged already runs after the response.
            if (TelegramGroupPost::query()->where('order_id', $orderId)->exists()) {
                app(TelegramGroupFeed::class)->refresh($orderId);
            }
        } catch (Throwable $e) {
            Log::warning('telegram group feed: skipped after an error', ['error' => $e->getMessage()]);
        }
    }
}
