<?php

declare(strict_types=1);

namespace App\Domains\Payments\Services;

use App\Domains\Notifications\DTOs\SmsMessage;
use App\Domains\Notifications\Services\CustomerSmsMessageBuilder;
use App\Domains\Notifications\Services\SmsService;
use App\Models\GiftCard;
use App\Models\SmsLog;
use App\Rules\MaldivesPhone;

/**
 * Delivers a gift card code by SMS. Full plaintext code is required — we never
 * store it on gift_cards, so SMS can only be sent at issue/resend time.
 */
final class GiftCardSmsDelivery
{
    public function __construct(
        private readonly SmsService $sms,
        private readonly CustomerSmsMessageBuilder $messages,
    ) {}

    /**
     * @return array{ok: bool, phone: string, sms_log_id: int|null, error: string|null}
     */
    public function send(
        GiftCard $card,
        string $plainCode,
        string $phone,
        ?string $personalNote = null,
        int|string|null $customerId = null,
        ?string $idempotencyKey = null,
        ?string $viewUrl = null,
        ?string $senderFromLine = null,
    ): array {
        // Eloquent may hand back int IDs as strings from PDO — coerce before SMS DTO.
        $customerId = $customerId !== null && $customerId !== ''
            ? (int) $customerId
            : null;

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

        $message = $this->buildMessage($card, $plainCode, $personalNote, $viewUrl, $senderFromLine);

        try {
            $log = $this->sms->send(new SmsMessage(
                to: $normalized,
                message: $message,
                type: 'giftcard_delivery',
                customerId: $customerId ?? ($card->issued_to_customer_id !== null ? (int) $card->issued_to_customer_id : null),
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

        // SmsService returns a log row even on carrier failure / demo — only
        // treat carrier-confirmed (or intentional demo) as delivered.
        $status = $log instanceof SmsLog ? (string) $log->status : '';
        $ok = in_array($status, ['sent', 'demo'], true);
        $error = $ok
            ? null
            : (($log instanceof SmsLog ? $log->error_message : null) ?: 'SMS send failed.');

        return [
            'ok' => $ok,
            'phone' => $normalized,
            'sms_log_id' => $log instanceof SmsLog ? $log->id : null,
            'error' => $error,
        ];
    }

    public function buildMessage(
        GiftCard $card,
        string $plainCode,
        ?string $personalNote = null,
        ?string $viewUrl = null,
        ?string $senderFromLine = null,
    ): string {
        $amount = number_format((float) $card->initial_balance, 2, '.', '');
        $from = trim((string) $senderFromLine);
        $url = is_string($viewUrl) ? trim($viewUrl) : '';
        $note = trim((string) $personalNote);
        $expires = $card->expires_at ? $card->expires_at->format('d M Y') : '';
        $code = strtoupper(trim($plainCode));

        $fallback = $this->legacyFallbackBody($amount, $from, $url, $code, $expires, $note);

        return $this->messages->build(
            'giftcard_delivery',
            [
                'sender' => $from,
                'amount' => $amount,
                'view_url' => $url,
                'code' => $code,
                'expires' => $expires,
                'note' => $note,
            ],
            $fallback,
        );
    }

    private function legacyFallbackBody(
        string $amount,
        string $from,
        string $url,
        string $code,
        string $expires,
        string $note,
    ): string {
        $lines = [
            'Bake & Grill Gift Card',
        ];

        if ($from !== '') {
            $lines[] = $from;
        }

        $lines[] = 'MVR ' . $amount;

        if ($url !== '') {
            $lines[] = 'View your card:';
            $lines[] = $url;
        }

        $lines[] = 'Code: ' . $code;

        if ($expires !== '') {
            $lines[] = 'Expires: ' . $expires;
        }

        if ($note !== '') {
            $lines[] = $note;
        }

        return implode("\n", $lines);
    }
}
