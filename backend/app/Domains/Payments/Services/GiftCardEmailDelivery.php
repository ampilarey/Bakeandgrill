<?php

declare(strict_types=1);

namespace App\Domains\Payments\Services;

use App\Mail\GiftCardMail;
use App\Models\GiftCard;
use Illuminate\Support\Facades\Mail;

/**
 * Delivers a gift card code by email. Full plaintext code is required — we never
 * store it, so email can only be sent at issue time (or when staff still has the code).
 */
final class GiftCardEmailDelivery
{
    /**
     * @return array{ok: bool, email: string, error: string|null}
     */
    public function send(
        GiftCard $card,
        string $plainCode,
        string $email,
        ?string $personalNote = null,
        ?string $senderFromLine = null,
        ?string $viewUrl = null,
    ): array {
        $normalized = strtolower(trim($email));
        if ($normalized === '' || ! filter_var($normalized, FILTER_VALIDATE_EMAIL)) {
            return [
                'ok' => false,
                'email' => $email,
                'error' => 'Invalid email address.',
            ];
        }

        $redeemUrl = rtrim((string) config('app.url'), '/') . '/order';

        try {
            Mail::to($normalized)->send(new GiftCardMail(
                $card,
                strtoupper(trim($plainCode)),
                $redeemUrl,
                $personalNote !== null ? trim($personalNote) ?: null : null,
                $senderFromLine !== null ? trim($senderFromLine) ?: null : null,
                $viewUrl !== null ? trim($viewUrl) ?: null : null,
            ));
        } catch (\Throwable $e) {
            return [
                'ok' => false,
                'email' => $normalized,
                'error' => $e->getMessage() ?: 'Email send failed.',
            ];
        }

        return [
            'ok' => true,
            'email' => $normalized,
            'error' => null,
        ];
    }
}
