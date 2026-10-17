<?php

declare(strict_types=1);

namespace App\Domains\Menu\Services;

use App\Domains\Notifications\DTOs\SmsMessage;
use App\Domains\Notifications\Services\SmsService;
use App\Domains\Notifications\Support\AlertSwitch;
use App\Models\Customer;
use App\Models\Item;
use App\Models\ItemAlert;
use App\Services\OpeningHoursService;
use Illuminate\Support\Facades\Log;

/**
 * "Tell me when it's back" and "coming soon" (iruali import plan, feature 8).
 *
 * A dish with launch_at in the future is kept off sale (Item::booted) and shown
 * as "Coming soon"; launch() puts it on sale on the day and clears the date.
 * Customers waiting for a dish that is orderable again (switched back on, its
 * snooze over, or launched) are told once each by notify(), only while the
 * shop is open. `items:alerts` runs both every five minutes.
 */
class ItemAlerts
{
    public const TYPE_BACK = 'customer_back_in_stock';

    public const TYPE_LAUNCH = 'customer_item_launched';

    public function subscribe(Customer $customer, Item $item): ItemAlert
    {
        $kind = $item->isComingSoon() ? ItemAlert::LAUNCH : ItemAlert::BACK;

        return ItemAlert::query()->updateOrCreate(
            ['item_id' => $item->id, 'customer_id' => $customer->id],
            ['kind' => $kind, 'sent_at' => null],
        );
    }

    public function unsubscribe(Customer $customer, Item $item): void
    {
        ItemAlert::query()->where('item_id', $item->id)->where('customer_id', $customer->id)->delete();
    }

    /** Waiting customers for a dish, for the item editor. */
    public static function waiting(int $itemId): int
    {
        return ItemAlert::query()->where('item_id', $itemId)->whereNull('sent_at')->count();
    }

    /** Put on sale the dishes whose launch day has come. */
    public function launch(): int
    {
        $count = 0;
        Item::query()->whereNotNull('launch_at')->where('launch_at', '<=', now())->each(function (Item $item) use (&$count): void {
            $item->forceFill(['launch_at' => null, 'is_available' => true])->save();
            $count++;
        });

        return $count;
    }

    /** Tell the customers whose dish can be ordered now. */
    public function notify(): int
    {
        if (!app(OpeningHoursService::class)->isOpenNow()) {
            return 0;
        }
        $sent = 0;
        $itemIds = ItemAlert::query()->whereNull('sent_at')->distinct()->pluck('item_id');
        foreach (Item::query()->whereIn('id', $itemIds)->get() as $item) {
            if (!$item->isOrderableNow()) {
                continue;
            }
            ItemAlert::query()->with('customer')->where('item_id', $item->id)->whereNull('sent_at')->each(function (ItemAlert $alert) use ($item, &$sent): void {
                $type = $alert->kind === ItemAlert::LAUNCH ? self::TYPE_LAUNCH : self::TYPE_BACK;
                $customer = $alert->customer;
                if ($customer !== null && filled($customer->phone) && AlertSwitch::isOn($type)) {
                    $url = rtrim((string) config('app.url'), '/') . '/order/menu';
                    $message = $alert->kind === ItemAlert::LAUNCH
                        ? "Bake & Grill: {$item->name} is on sale now. Order: {$url}"
                        : "Bake & Grill: {$item->name} is back. Order: {$url}";
                    try {
                        app(SmsService::class)->send(new SmsMessage(
                            to: (string) $customer->phone,
                            message: $message,
                            type: $type,
                            customerId: $customer->id,
                            referenceType: 'item_alert',
                            referenceId: (string) $alert->id,
                            idempotencyKey: 'item-alert:' . $alert->id . ':' . now()->toDateString(),
                        ));
                        $sent++;
                    } catch (\Throwable $e) {
                        Log::warning('Item alert could not be sent', ['alert_id' => $alert->id, 'error' => $e->getMessage()]);

                        return;
                    }
                }
                $alert->forceFill(['sent_at' => now()])->save();
            });
        }

        return $sent;
    }
}
