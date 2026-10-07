<?php

declare(strict_types=1);

namespace App\Domains\Telegram\Services;

use App\Domains\Telegram\Exceptions\TelegramApiException;
use App\Domains\Telegram\Support\TelegramOrderText as O;
use App\Domains\Telegram\Support\TelegramText as T;
use App\Models\DeliveryDriver;
use App\Models\Order;
use App\Models\TelegramLink;
use App\Services\AuditLogService;
use App\Services\OrderStatusTransitionService;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * The driver's side of the bot (owner, 2026-10-07: "Do it", on the driver
 * level). A linked driver gets a message the moment a delivery is given to
 * them, and "My deliveries" lists what they have: customer, phone,
 * address, map pin, items and the cash to collect. Picked up, On the way
 * and Delivered make the same moves as the driver app.
 */
class TelegramDriverDesk
{
    public const BTN_MINE = '🛵 My deliveries';
    public const BTN_HELP = '❓ Help';

    /** Assigned and not finished: being made, at the counter, or on the road. */
    private const OPEN_STATUSES = ['pending', 'paid', 'partial', 'in_progress', 'ready', 'out_for_delivery', 'picked_up', 'on_the_way'];

    /** Driver step => [from statuses, to status]. Picked up from the counter dispatches it first. */
    private const STEPS = [
        'p' => [['ready', 'out_for_delivery'], 'picked_up'],
        'w' => [['picked_up'], 'on_the_way'],
        'd' => [['on_the_way'], 'delivered'],
    ];

    public function __construct(
        private readonly TelegramClient $client,
    ) {}

    public function menuKeyboard(): array
    {
        return ['keyboard' => [[['text' => self::BTN_MINE], ['text' => self::BTN_HELP]]], 'resize_keyboard' => true, 'is_persistent' => true];
    }

    public function welcome(TelegramLink $link): void
    {
        $this->send($link, '👋 <b>Hi ' . T::e($link->displayName()) . ", you're linked.</b>\n\n"
            . "When the shop gives you a delivery, it arrives here with the address, the customer's phone and the cash to collect.\n\n"
            . 'Tap <b>' . self::BTN_MINE . '</b> any time to see what you have.', ['reply_markup' => $this->menuKeyboard()]);
    }

    public function handleText(TelegramLink $link, string $text): void
    {
        $raw = trim($text);
        if ($raw === self::BTN_MINE || preg_match('/^\/(deliveries|mine|orders)(?:@\w+)?$/i', $raw)) {
            $this->deliveries($link);

            return;
        }
        $this->help($link);
    }

    public function help(TelegramLink $link): void
    {
        $this->send($link, implode("\n", [
            '❓ <b>What the buttons do</b>',
            '',
            '<b>' . self::BTN_MINE . '</b>: the deliveries the shop has given you, with the address, map pin, phone and cash to collect.',
            'Under each one: <b>Picked up</b> when you take it from the counter, <b>On the way</b> when you leave, <b>Delivered</b> at the door. The customer and the shop see it at once.',
            '',
            'A new delivery for you arrives here by itself.',
            '<code>/stop</code> unlinks this chat.',
        ]), ['reply_markup' => $this->menuKeyboard()]);
    }

    public function deliveries(TelegramLink $link): void
    {
        $driver = $link->driver;
        if ($driver === null) {
            return;
        }
        $orders = Order::query()
            ->where('delivery_driver_id', $driver->id)
            ->where('type', 'delivery')
            ->whereIn('status', self::OPEN_STATUSES)
            ->orderBy('driver_assigned_at')
            ->limit(10)
            ->get();
        if ($orders->isEmpty()) {
            $this->send($link, '🛵 <b>No deliveries for you right now.</b>', ['reply_markup' => $this->menuKeyboard()]);

            return;
        }

        $cash = $orders->sum(fn (Order $o) => O::toCollect($o));
        $this->send($link, '🛵 <b>Your deliveries</b> (' . $orders->count() . ')' . ($cash > 0 ? "\nCash to collect in all: <b>" . T::mvr($cash) . '</b>' : ''));
        foreach ($orders as $order) {
            [$html, $buttons] = $this->card($order);
            $this->send($link, $html, [], $buttons);
        }
    }

    /**
     * @return array{0: string, 1: array<int, array<int, array<string, string>>>}
     */
    public function card(Order $order, ?string $heading = null, ?string $note = null): array
    {
        $order->loadMissing(['items.modifiers', 'customer']);
        $lines = [($heading ?? '🛵 <b>Delivery ' . O::number($order) . '</b>') . ' · ' . T::e($this->statusLabel((string) $order->status))];
        $due = O::due($order);
        if ($due !== null) {
            $lines[] = 'Promised for <b>' . T::e($due) . '</b>';
        }
        $lines[] = '';
        $name = O::customerName($order);
        $phone = O::customerPhone($order);
        if ($name !== '' || $phone !== '') {
            $lines[] = '👤 ' . T::e($name !== '' ? $name : 'Customer') . ($phone !== '' ? ' · ' . T::e($phone) : '');
        }
        $address = O::address($order);
        $map = O::mapLink($order);
        $lines[] = '📍 ' . T::e($address !== '' ? $address : 'No address given') . ($map !== null ? ' · <a href="' . T::e($map) . '">open the map</a>' : '');
        if (trim((string) $order->delivery_notes) !== '') {
            $lines[] = '📝 ' . T::e(trim((string) $order->delivery_notes));
        }
        $lines[] = '';
        foreach (O::itemLines($order, 12) as $line) {
            $lines[] = $line;
        }
        $collect = O::toCollect($order);
        if ($order->status !== 'delivered') { // the Delivered note says what to hand in
            $lines[] = '';
            $lines[] = $collect > 0
                ? '💵 <b>Collect ' . T::mvr($collect) . '</b>'
                : '✅ Paid already: collect nothing.';
        }
        if (in_array((string) $order->status, ['pending', 'paid', 'partial', 'in_progress'], true)) {
            $lines[] = '<i>Still being made. Picked up appears when it is ready.</i>';
        }
        if ($note !== null) {
            $lines[] = '';
            $lines[] = $note;
        }

        return [T::clip(implode("\n", $lines)), $this->buttons($order)];
    }

    /** @return array<int, array<int, array<string, string>>> */
    private function buttons(Order $order): array
    {
        $id = $order->id;

        return match ((string) $order->status) {
            'ready', 'out_for_delivery' => [[T::button('📦 Picked up', 'dv:p:' . $id)]],
            'picked_up' => [[T::button('🛵 On the way', 'dv:w:' . $id)]],
            'on_the_way' => [[T::button('✅ Delivered', 'dv:d:' . $id)]],
            default => [],
        };
    }

    /** @param array<string, mixed> $callback */
    public function handleCallback(TelegramLink $link, array $callback): void
    {
        $callbackId = (string) ($callback['id'] ?? '');
        $messageId = (int) ($callback['message']['message_id'] ?? 0);
        [$prefix, $step, $orderId] = array_pad(explode(':', (string) ($callback['data'] ?? ''), 3), 3, '');
        $driver = $link->driver;
        if ($prefix !== 'dv' || !isset(self::STEPS[$step]) || $driver === null) {
            $this->client->answerCallback($link->bot, $callbackId, 'That button is not for drivers.');

            return;
        }

        try {
            [$order, $message] = $this->move((int) $orderId, $step, $driver);
        } catch (Throwable $e) {
            report($e);
            $this->client->answerCallback($link->bot, $callbackId, 'Something went wrong. Use the driver app or call the shop.', true);

            return;
        }
        if ($order === null) {
            $this->client->answerCallback($link->bot, $callbackId, $message, true);

            return;
        }

        $this->client->answerCallback($link->bot, $callbackId, $message);
        $note = $order->status === 'delivered'
            ? '🏁 <b>Delivered.</b>' . (($cash = O::toCollect($order)) > 0 ? ' Hand ' . T::mvr($cash) . ' to the shop.' : '')
            : null;
        [$html, $buttons] = $this->card($order, null, $note);
        $this->client->editMessage($link->bot, $link->chat_id, $messageId, $html, $buttons);
    }

    /**
     * The driver app's moves (DriverDeliveryController::updateStatus), for
     * this driver's own deliveries only.
     *
     * @return array{0: ?Order, 1: string}
     */
    public function move(int $orderId, string $step, DeliveryDriver $driver): array
    {
        [$from, $to] = self::STEPS[$step];

        return DB::transaction(function () use ($orderId, $from, $to, $driver): array {
            $order = Order::query()->lockForUpdate()->find($orderId);
            if ($order === null || (int) $order->delivery_driver_id !== (int) $driver->id) {
                return [null, 'This delivery is not yours any more.'];
            }
            if ($order->status === $to) {
                return [$order, 'Already done.'];
            }
            if (!in_array((string) $order->status, $from, true)) {
                return [null, 'This delivery is ' . $this->statusLabel((string) $order->status) . ' now, so that cannot be done.'];
            }

            $transitions = app(OrderStatusTransitionService::class);
            $old = (string) $order->status;
            if ($old === 'ready') {
                // Taken from the counter before the shop dispatched it.
                $order = $transitions->transition($order, 'out_for_delivery');
            }
            $extra = match ($to) {
                'picked_up' => ['picked_up_at' => now()],
                'delivered' => ['delivered_at' => now()],
                default => [],
            };
            $order = $transitions->transition($order, $to, $extra);

            app(AuditLogService::class)->log('delivery.' . $to, 'Order', $order->id, ['status' => $old], ['status' => $to], [
                'source' => 'telegram',
                'driver_id' => $driver->id,
                'driver' => $driver->name,
            ]);

            return [$order, match ($to) {
                'picked_up' => 'Picked up.',
                'on_the_way' => 'On the way. The customer is told.',
                default => 'Delivered.',
            }];
        });
    }

    /**
     * A delivery was given to a driver (or taken off one): tell them.
     * Runs after the response; never affects the assignment itself.
     */
    public function assigned(int $orderId, ?int $previousDriverId = null): void
    {
        try {
            $order = Order::query()->find($orderId);
            if ($order === null || $order->type !== 'delivery') {
                return;
            }
            $now = $order->delivery_driver_id !== null ? (int) $order->delivery_driver_id : null;
            if ($previousDriverId !== null && $previousDriverId !== $now) {
                foreach ($this->linksFor($previousDriverId) as $link) {
                    $this->trySend($link, '↩️ Delivery ' . O::number($order) . ' was taken off you. Nothing to do.');
                }
            }
            if ($now === null || !in_array((string) $order->status, self::OPEN_STATUSES, true)) {
                return;
            }
            foreach ($this->linksFor($now) as $link) {
                [$html, $buttons] = $this->card($order, '🆕 <b>New delivery for you ' . O::number($order) . '</b>');
                $this->trySend($link, $html, $buttons);
            }
        } catch (Throwable $e) {
            Log::warning('telegram driver: assignment message skipped', ['order_id' => $orderId, 'error' => $e->getMessage()]);
        }
    }

    /** @return \Illuminate\Support\Collection<int, TelegramLink> */
    private function linksFor(int $driverId)
    {
        return TelegramLink::query()->with(['bot', 'driver'])
            ->where('delivery_driver_id', $driverId)
            ->whereNull('blocked_at')
            ->get()
            ->filter(fn (TelegramLink $l) => $l->isUsable());
    }

    /** @param array<int, array<int, array<string, string>>>|null $buttons */
    private function trySend(TelegramLink $link, string $html, ?array $buttons = null): void
    {
        try {
            $this->client->sendMessage($link->bot, $link->chat_id, $html, $buttons);
        } catch (TelegramApiException $e) {
            if ($e->isBlocked()) {
                $link->forceFill(['blocked_at' => now()])->save();
            }
            Log::info('telegram driver: not delivered', ['link_id' => $link->id, 'error' => $e->getMessage()]);
        }
    }

    /**
     * @param array<string, mixed> $extra
     * @param array<int, array<int, array<string, string>>>|null $buttons
     */
    private function send(TelegramLink $link, string $html, array $extra = [], ?array $buttons = null): void
    {
        $this->client->sendMessage($link->bot, $link->chat_id, $html, $buttons, $extra);
    }

    public function statusLabel(string $status): string
    {
        return match ($status) {
            'pending', 'paid', 'partial' => 'waiting for the kitchen',
            'in_progress' => 'being made',
            'ready' => 'ready at the counter',
            'out_for_delivery' => 'ready for you',
            'picked_up' => 'picked up',
            'on_the_way' => 'on the way',
            'delivered' => 'delivered',
            'completed' => 'done',
            'cancelled' => 'cancelled',
            default => str_replace('_', ' ', $status),
        };
    }
}
