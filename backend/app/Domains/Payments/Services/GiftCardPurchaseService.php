<?php

declare(strict_types=1);

namespace App\Domains\Payments\Services;

use App\Models\Customer;
use App\Models\GiftCardPurchase;
use App\Models\Order;
use App\Rules\MaldivesPhone;
use App\Support\BusinessDay;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

final class GiftCardPurchaseService
{
    public const MIN_AMOUNT = 50.0;

    public const MAX_AMOUNT = 5000.0;

    public function __construct(
        private readonly PaymentService $payments,
    ) {}

    /**
     * Create a payable gift-card order and start BML checkout.
     *
     * Recipient phone/email are required (who receives the code). The buyer never
     * sees the plaintext code — only the recipient via SMS/email/view link.
     *
     * @param  array{
     *   amount: float,
     *   recipient_phone?: string|null,
     *   recipient_email?: string|null,
     *   personal_note?: string|null,
     *   sender_name?: string|null,
     *   send_anonymously?: bool,
     * }  $data
     * @return array{order: Order, purchase: GiftCardPurchase, payment_url: string, payment_id: int}
     */
    public function start(Customer $customer, array $data): array
    {
        $amount = round((float) $data['amount'], 2);
        if ($amount < self::MIN_AMOUNT || $amount > self::MAX_AMOUNT) {
            throw new \InvalidArgumentException(
                'Amount must be between MVR ' . number_format(self::MIN_AMOUNT, 0) . ' and MVR ' . number_format(self::MAX_AMOUNT, 0) . '.',
            );
        }

        // Whole-MVR only — no fractional laari for gift-card face values.
        // Guards against 49.99 slipping past the MIN check on rounding.
        $amountLaarCheck = (int) round($amount * 100);
        if ($amountLaarCheck % 100 !== 0) {
            throw new \InvalidArgumentException('Gift card amount must be a whole number of MVR.');
        }

        $phone = isset($data['recipient_phone']) ? trim((string) $data['recipient_phone']) : '';
        $phone = $phone !== '' ? MaldivesPhone::normalize($phone) : null;

        $email = isset($data['recipient_email']) ? strtolower(trim((string) $data['recipient_email'])) : '';
        if ($email === '') {
            $email = null;
        } elseif (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            throw new \InvalidArgumentException('Invalid recipient email.');
        }

        if (!$phone && !$email) {
            throw new \InvalidArgumentException('Provide a recipient phone or email so we can deliver the code.');
        }

        $anonymous = filter_var($data['send_anonymously'] ?? false, FILTER_VALIDATE_BOOLEAN);
        $senderName = isset($data['sender_name']) ? trim((string) $data['sender_name']) : '';
        if (!$anonymous && $senderName === '') {
            throw new \InvalidArgumentException('Enter your name for the recipient, or choose send anonymously.');
        }
        if ($anonymous) {
            $senderName = '';
        }

        $amountLaar = (int) round($amount * 100);
        $note = isset($data['personal_note']) ? trim((string) $data['personal_note']) : '';

        return DB::transaction(function () use ($customer, $amount, $amountLaar, $phone, $email, $note, $senderName, $anonymous): array {
            $order = Order::create([
                'order_number' => $this->generateOrderNumber(),
                'tracking_token' => Str::random(32),
                'type' => 'gift_card',
                'status' => 'payment_pending',
                'payment_status' => 'unpaid',
                'customer_id' => $customer->id,
                'subtotal' => $amount,
                'subtotal_laar' => $amountLaar,
                'tax_amount' => 0,
                'tax_laar' => 0,
                'discount_amount' => 0,
                'total' => $amount,
                'total_laar' => $amountLaar,
                'delivery_fee' => 0,
                'delivery_fee_laar' => 0,
                'notes' => 'Gift card purchase',
            ]);

            $purchase = GiftCardPurchase::create([
                'order_id' => $order->id,
                'purchaser_customer_id' => $customer->id,
                'amount' => $amount,
                'recipient_phone' => $phone,
                'recipient_email' => $email,
                'personal_note' => $note !== '' ? $note : null,
                'sender_name' => $senderName !== '' ? $senderName : null,
                'send_anonymously' => $anonymous,
            ]);

            $result = $this->payments->initiateBmlPayment($order, $amountLaar);

            return [
                'order' => $order,
                'purchase' => $purchase,
                'payment_url' => $result['payment_url'],
                'payment_id' => (int) $result['payment_id'],
            ];
        });
    }

    private function generateOrderNumber(): string
    {
        $now = BusinessDay::now();
        $date = $now->toDateString();
        $dateFormatted = $now->format('Ymd');

        $sequence = DB::transaction(function () use ($date): int {
            $dailySeq = DB::table('daily_sequences')
                ->where('date', $date)
                ->lockForUpdate()
                ->first();

            if (!$dailySeq) {
                DB::table('daily_sequences')->insert([
                    'date' => $date,
                    'last_order_number' => 1,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);

                return 1;
            }

            $nextNumber = $dailySeq->last_order_number + 1;
            DB::table('daily_sequences')
                ->where('date', $date)
                ->update([
                    'last_order_number' => $nextNumber,
                    'updated_at' => now(),
                ]);

            return $nextNumber;
        });

        return 'GC-' . $dateFormatted . '-' . str_pad((string) $sequence, 4, '0', STR_PAD_LEFT);
    }
}
