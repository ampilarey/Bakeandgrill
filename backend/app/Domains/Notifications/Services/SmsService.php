<?php

declare(strict_types=1);

namespace App\Domains\Notifications\Services;

use App\Domains\Notifications\Contracts\SmsProviderInterface;
use App\Domains\Notifications\DTOs\SmsMessage;
use App\Models\SmsLog;
use Illuminate\Support\Facades\Log;

/**
 * Core SMS sending service.
 *
 * - Delegates actual sending to an SmsProviderInterface implementation
 *   (Dhiraagu by default). Swap providers by rebinding the interface
 *   in the service container — no business logic changes required.
 * - Logs EVERY send attempt to sms_logs (OTP, promo, campaign, transactional).
 * - Phone normalisation: accepts 7654321, 9607654321, +9607654321.
 */
class SmsService
{
    public function __construct(
        private SmsProviderInterface $provider,
    ) {}

    public function send(SmsMessage $sms): SmsLog
    {
        $estimate = $this->estimate($sms->message);

        // Check for duplicate send (idempotency)
        if ($sms->idempotencyKey) {
            $existing = SmsLog::where('idempotency_key', $sms->idempotencyKey)->first();
            if ($existing) {
                Log::info('SMS: Duplicate send prevented', ['key' => $sms->idempotencyKey]);

                return $existing;
            }
        }

        $normalized = $this->normalizePhone($sms->to);

        $log = SmsLog::create([
            'message' => $sms->message,
            'to' => $normalized,
            'type' => $sms->type,
            'status' => 'queued',
            'encoding' => $estimate['encoding'],
            'segments' => $estimate['segments'],
            'cost_estimate_mvr' => $estimate['cost_mvr'],
            'provider' => $this->provider->name(),
            'customer_id' => $sms->customerId,
            'campaign_id' => $sms->campaignId,
            'reference_type' => $sms->referenceType,
            'reference_id' => $sms->referenceId,
            'idempotency_key' => $sms->idempotencyKey,
        ]);

        if ($this->isValidMaldivianNumber($normalized)) {
            $result = $this->provider->send($normalized, $sms->message);
        } else {
            $result = ['success' => false, 'response' => [], 'error' => 'Invalid phone number'];
        }

        $success = $result['success'];
        $response = $result['response'];
        $error = $result['error'];

        $log->update([
            'status' => $success ? 'sent' : ($response === 'demo' ? 'demo' : 'failed'),
            'gateway_response' => is_array($response) ? $response : ['raw' => $response],
            'error_message' => $error,
            'sent_at' => $success ? now() : null,
        ]);

        return $log;
    }

    /**
     * Estimate encoding, segments, and cost for a message.
     */
    public function estimate(string $message): array
    {
        $encoding = $this->detectEncoding($message);
        $segments = $this->calculateSegments($message, $encoding);

        return [
            'encoding' => $encoding,
            'length' => mb_strlen($message),
            'segments' => $segments,
            'cost_mvr' => round($segments * 0.25, 2),
        ];
    }

    /**
     * Estimate cost and recipient count for a set of phone numbers.
     */
    public function estimateBulk(string $message, int $recipientCount): array
    {
        $perMessage = $this->estimate($message);

        return [
            'per_message' => $perMessage,
            'recipient_count' => $recipientCount,
            'total_segments' => $perMessage['segments'] * $recipientCount,
            'total_cost_mvr' => round($perMessage['cost_mvr'] * $recipientCount, 2),
        ];
    }

    // ── Phone Normalisation ───────────────────────────────────────────────────

    public function normalizePhone(string $phone): string
    {
        $digits = preg_replace('/[^0-9]/', '', $phone);

        if (str_starts_with($digits, '960') && strlen($digits) === 10) {
            return '+' . $digits;
        }

        if (strlen($digits) === 7) {
            return '+960' . $digits;
        }

        if (strlen($digits) > 7) {
            return '+960' . substr($digits, -7);
        }

        return '+960' . str_pad($digits, 7, '0', STR_PAD_LEFT);
    }

    public function isValidMaldivianNumber(string $normalized): bool
    {
        return (bool) preg_match('/^\+960[0-9]{7}$/', $normalized);
    }

    // ── Private Helpers ───────────────────────────────────────────────────────

    private function detectEncoding(string $text): string
    {
        return mb_strlen($text) === strlen($text) ? 'gsm7' : 'ucs2';
    }

    private function calculateSegments(string $text, string $encoding): int
    {
        $length = mb_strlen($text);

        if ($encoding === 'gsm7') {
            return $length <= 160 ? 1 : (int) ceil($length / 153);
        }

        return $length <= 70 ? 1 : (int) ceil($length / 67);
    }
}
