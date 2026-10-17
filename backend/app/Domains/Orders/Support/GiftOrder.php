<?php

declare(strict_types=1);

namespace App\Domains\Orders\Support;

use App\Domains\Notifications\DTOs\SmsMessage;
use App\Domains\Notifications\Services\SmsService;
use App\Domains\Notifications\Support\AlertSwitch;
use App\Models\Order;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

/**
 * Gift orders (iruali import plan, feature 10). A delivery or pickup bought
 * for someone else: the receiver's name and phone and a short message. A
 * delivery goes to the receiver (they are the drop-off contact; the buyer is
 * the second one). The kitchen slip says GIFT with the message and no prices;
 * the buyer's receipt keeps its prices and goes to the buyer only. The
 * receiver may get one text when it is on the way (row customer_gift_on_the_way,
 * off by default). Never for eat-in or a table QR order.
 */
final class GiftOrder
{
    public const TYPE_ON_THE_WAY = 'customer_gift_on_the_way';

    public const TYPES = ['online_pickup', 'delivery'];

    /** @return array<string, mixed> */
    public static function rules(): array
    {
        return [
            'is_gift' => ['sometimes', 'boolean'],
            'gift_to_name' => ['required_if_accepted:is_gift', 'nullable', 'string', 'max:100'],
            'gift_to_phone' => ['required_if_accepted:is_gift', 'nullable', 'string', 'max:30', 'regex:/^(\+?960)?[379]\d{6}$/'],
            'gift_message' => ['nullable', 'string', 'max:200'],
        ];
    }

    /**
     * Keep the gift on a new order. A delivery's drop-off contact becomes the receiver.
     *
     * @param array<string, mixed> $input
     */
    public static function apply(Order $order, array $input): void
    {
        if (!filter_var($input['is_gift'] ?? false, FILTER_VALIDATE_BOOLEAN) || !in_array($order->type, self::TYPES, true) || $order->restaurant_table_id !== null) {
            return;
        }
        $name = trim(strip_tags((string) ($input['gift_to_name'] ?? '')));
        $phone = trim((string) ($input['gift_to_phone'] ?? ''));
        if ($name === '' || $phone === '') {
            return;
        }
        $fields = [
            'is_gift' => true,
            'gift_to_name' => mb_substr($name, 0, 100),
            'gift_to_phone' => $phone,
            'gift_message' => ($m = trim(strip_tags((string) ($input['gift_message'] ?? '')))) !== '' ? mb_substr($m, 0, 200) : null,
        ];
        if ($order->type === 'delivery') {
            $fields['delivery_contact_name'] = $fields['gift_to_name'];
            $fields['delivery_contact_phone'] = $phone;
        }
        // Straight to the row: the status guard on Order::save is not for this.
        Order::query()->whereKey($order->id)->update($fields);
        $order->forceFill($fields)->syncOriginal();
    }

    /** The receiver's one text when the gift is on the way. */
    public static function tellReceiver(Order $order): void
    {
        if (!$order->is_gift || blank($order->gift_to_phone) || $order->gift_sms_sent_at !== null || !AlertSwitch::isOn(self::TYPE_ON_THE_WAY)) {
            return;
        }
        $from = trim((string) ($order->customer?->name ?? ''));
        $message = $from !== ''
            ? 'A gift from ' . Str::limit($from, 40, '') . ' is on the way from Bake & Grill.'
            : 'A gift is on the way to you from Bake & Grill.';
        try {
            app(SmsService::class)->send(new SmsMessage(
                to: (string) $order->gift_to_phone,
                message: $message,
                type: self::TYPE_ON_THE_WAY,
                referenceType: 'order',
                referenceId: (string) $order->id,
                idempotencyKey: 'gift-on-the-way:' . $order->id,
            ));
            Order::query()->whereKey($order->id)->update(['gift_sms_sent_at' => now()]);
        } catch (\Throwable $e) {
            Log::warning('Gift on-the-way text failed', ['order_id' => $order->id, 'error' => $e->getMessage()]);
        }
    }

    /** What the kitchen slip prints, or null. @return array{to: string, message: ?string}|null */
    public static function forSlip(Order $order): ?array
    {
        return $order->is_gift ? ['to' => (string) $order->gift_to_name, 'message' => $order->gift_message] : null;
    }
}
