<?php

declare(strict_types=1);

namespace App\Domains\Payments\Services;

use App\Domains\Notifications\DTOs\SmsMessage;
use App\Domains\Notifications\Services\SmsService;
use App\Models\GiftCard;
use App\Models\SmsLog;
use App\Rules\MaldivesPhone;

/**
 * Delivers a gift card code by SMS. Full plaintext code is required — we never
 * store it, so SMS can only be sent at issue time (or when staff still has the code).
 */
final class GiftCardSmsDelivery
{
    public function __construct(
        private readonly SmsService $sms,
    ) {}

    /**
     * @return array{ok: bool, phone: string, sms_log_id: int|null, error: string|null}
     */
    public function send(
        GiftCard $card,
        string $plainCode,
        string $phone,
        ?string $personalNote = null,
        ?int $customerId = null,
        ?string $idempotencyKey = null,
    ): array {
        try {
            $normalized = MaldivesPhone::normalize($phone);
        } catch (\InvalidArgumentException) {
            return [
                'ok' => false,
                'phone' => $phone,
                'sms_log_id' => null,
                'error' => 'Invalid Maldivian phone number.',
            ];
        }

        $message = $this->buildMessage($card, $plainCode, $personalNote);

        try {
            $log = $this->sms->send(new SmsMessage(
                to: $normalized,
                message: $message,
                // transactional — must deliver even if marketing opt-out is on
                type: 'transactional',
                customerId: $customerId ?? $card->issued_to_customer_id,
                referenceType: 'gift_card',
                referenceId: (string) $card->id,
                idempotencyKey: $idempotencyKey
                    ?? ('gift_card:' . $card->id . ':' . $normalized . ':' . now()->format('YmdHi')),
            ));
        } catch (\Throwable $e) {
            return [
                'ok' => false,
                'phone' => $normalized,
                'sms_log_id' => null,
                'error' => $e->getMessage() ?: 'SMS send failed.',
            ];
        }

        return [
            'ok' => true,
            'phone' => $normalized,
            'sms_log_id' => $log instanceof SmsLog ? $log->id : null,
            'error' => null,
        ];
    }

    public function buildMessage(GiftCard $card, string $plainCode, ?string $personalNote = null): string
    {
        $amount = number_format((float) $card->initial_balance, 2, '.', '');
        $lines = [
            'Bake & Grill Gift Card',
            'Code: ' . strtoupper(trim($plainCode)),
            'Value: MVR ' . $amount,
        ];

        if ($card->expires_at) {
            $lines[] = 'Expires: ' . $card->expires_at->format('d M Y');
        }

        $orderUrl = rtrim((string) config('app.url'), '/') . '/order';
        $lines[] = 'Redeem online or in-store: ' . $orderUrl;

        $note = trim((string) $personalNote);
        if ($note !== '') {
            $lines[] = $note;
        }

        return implode("\n", $lines);
    }
}
