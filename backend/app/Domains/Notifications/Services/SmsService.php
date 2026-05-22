<?php

declare(strict_types=1);

namespace App\Domains\Notifications\Services;

use App\Domains\Notifications\Contracts\SmsProviderInterface;
use App\Domains\Notifications\DTOs\SmsMessage;
use App\Models\Customer;
use App\Models\SmsLog;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\Log;

/**
 * Core SMS sending service.
 *
 * - Delegates transport to SmsProviderInterface (default: DhiraaguSmsProvider).
 * - Logs EVERY send attempt to sms_logs (OTP, promo, campaign, transactional).
 * - Phone normalisation: accepts 7654321, 9607654321, +9607654321.
 */
class SmsService
{
    public function __construct(private readonly SmsProviderInterface $provider) {}

    /**
     * Message types that bypass the customer opt-out flag.
     *  - 'otp'           : auth flow, never suppressible
     *  - 'transactional' : receipts, order updates, payment confirmations
     * Everything else ('campaign', 'promotion', etc.) is marketing and
     * MUST be suppressed when the customer has opted out.
     */
    private const NON_SUPPRESSIBLE_TYPES = ['otp', 'transactional'];

    public function send(SmsMessage $sms): SmsLog
    {
        $estimate = $this->estimate($sms->message);
        $normalized = $this->normalizePhone($sms->to);

        // Marketing-class messages: honour the customer opt-out flag. We
        // log a `suppressed` row so the audit trail still shows the call
        // was made (and what was *not* sent), but skip the provider entirely.
        if (!in_array($sms->type, self::NON_SUPPRESSIBLE_TYPES, true)) {
            $optedOut = $this->isOptedOut($normalized, $sms->customerId);
            if ($optedOut) {
                return SmsLog::create([
                    'message' => $sms->message,
                    'to' => $normalized,
                    'type' => $sms->type,
                    'status' => 'suppressed',
                    'encoding' => $estimate['encoding'],
                    'segments' => $estimate['segments'],
                    'cost_estimate_mvr' => 0,
                    'provider' => 'dhiraagu',
                    'customer_id' => $sms->customerId,
                    'campaign_id' => $sms->campaignId,
                    'reference_type' => $sms->referenceType,
                    'reference_id' => $sms->referenceId,
                    'idempotency_key' => $sms->idempotencyKey,
                    'error_message' => 'Recipient opted out of marketing SMS.',
                ]);
            }
        }

        // Idempotency lookup now bounded to the last 24 hours. The same
        // key being reused months later (e.g. periodic "low stock" reminders
        // that intentionally share a key per item) should NOT collapse into
        // an old log row. 24h covers all retry/queue replay windows we
        // actually run.
        $existing = $sms->idempotencyKey
            ? SmsLog::where('idempotency_key', $sms->idempotencyKey)
                ->where('created_at', '>=', now()->subDay())
                ->orderByDesc('id')
                ->first()
            : null;

        // Only treat a carrier-confirmed send as final — allow retries after failed/demo/queued.
        if ($existing !== null && $existing->status === 'sent') {
            Log::info('SMS: Duplicate send prevented (already sent)', ['key' => $sms->idempotencyKey]);

            return $existing;
        }

        if ($existing !== null) {
            $log = $this->refreshSmsLogForRetry($existing, $sms, $normalized, $estimate);
        } else {
            try {
                $log = SmsLog::create([
                    'message' => $sms->message,
                    'to' => $normalized,
                    'type' => $sms->type,
                    'status' => 'queued',
                    'encoding' => $estimate['encoding'],
                    'segments' => $estimate['segments'],
                    'cost_estimate_mvr' => $estimate['cost_mvr'],
                    'provider' => 'dhiraagu',
                    'customer_id' => $sms->customerId,
                    'campaign_id' => $sms->campaignId,
                    'reference_type' => $sms->referenceType,
                    'reference_id' => $sms->referenceId,
                    'idempotency_key' => $sms->idempotencyKey,
                ]);
            } catch (QueryException $e) {
                // Unique idempotency_key is global, but the lookup above only
                // scans 24h. After orders:purge reuses numeric IDs, a stale row
                // from months ago can block inserts — recover by updating it.
                if (!$this->isDuplicateIdempotencyKey($e) || !$sms->idempotencyKey) {
                    throw $e;
                }

                $stale = SmsLog::where('idempotency_key', $sms->idempotencyKey)->first();
                if ($stale === null) {
                    throw $e;
                }

                if ($stale->status === 'sent'
                    && $stale->reference_type === $sms->referenceType
                    && $stale->reference_id === $sms->referenceId
                ) {
                    Log::info('SMS: Duplicate send prevented (legacy row already sent)', [
                        'key' => $sms->idempotencyKey,
                    ]);

                    return $stale;
                }

                $log = $this->refreshSmsLogForRetry($stale, $sms, $normalized, $estimate);
            }
        }

        [$success, $response, $error] = $this->provider->send($normalized, $sms->message);

        $status = $success ? 'sent' : ($response === 'demo' ? 'demo' : 'failed');

        $log->update([
            'status' => $status,
            'gateway_response' => is_array($response) ? $response : ['raw' => $response],
            'error_message' => $error,
            'sent_at' => $success ? now() : null,
        ]);

        return $log->fresh();
    }

    /** @param array{encoding: string, segments: int, cost_mvr: float} $estimate */
    private function refreshSmsLogForRetry(
        SmsLog $log,
        SmsMessage $sms,
        string $normalized,
        array $estimate,
    ): SmsLog {
        $log->update([
            'message' => $sms->message,
            'to' => $normalized,
            'type' => $sms->type,
            'status' => 'queued',
            'encoding' => $estimate['encoding'],
            'segments' => $estimate['segments'],
            'cost_estimate_mvr' => $estimate['cost_mvr'],
            'customer_id' => $sms->customerId,
            'campaign_id' => $sms->campaignId,
            'reference_type' => $sms->referenceType,
            'reference_id' => $sms->referenceId,
            'gateway_response' => null,
            'error_message' => null,
            'sent_at' => null,
        ]);

        return $log->fresh();
    }

    private function isDuplicateIdempotencyKey(QueryException $e): bool
    {
        $message = $e->getMessage();

        return str_contains($message, 'sms_logs_idempotency_key_unique')
            || (str_contains($message, 'Duplicate entry') && str_contains($message, 'idempotency_key'));
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
     * Used for campaign preview before sending.
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

    // ── Public helpers (used by callers for estimation/display) ──────────────

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

    /**
     * True when the recipient has opted out of marketing SMS. Prefers a
     * direct customer_id lookup (cheap, unambiguous); falls back to a
     * phone-number lookup so opt-out also works for guest-flow numbers
     * that haven't been linked to a Customer row yet.
     */
    private function isOptedOut(string $normalizedPhone, ?int $customerId): bool
    {
        if ($customerId !== null) {
            $customer = Customer::find($customerId);
            if ($customer && $customer->sms_opt_out) {
                return true;
            }
        }

        return Customer::where('phone', $normalizedPhone)
            ->where('sms_opt_out', true)
            ->exists();
    }

    // ── Private Helpers ───────────────────────────────────────────────────────

    /**
     * Returns 'gsm7' iff every character is representable in the GSM 03.38
     * 7-bit default alphabet (including its 14-char extension table).
     * Anything else — emoji, Thaana, CJK, accented Latin like ñ, ã — forces
     * UCS-2.
     *
     * Pre-fix this was `mb_strlen === strlen` which is wrong in both
     * directions: it flagged "Ñ" as Unicode (Ñ is gsm7) and accepted some
     * single-byte chars that aren't gsm7 at all.
     */
    private function detectEncoding(string $text): string
    {
        return $this->isAllGsm7($text) ? 'gsm7' : 'ucs2';
    }

    /**
     * Base GSM 03.38 alphabet (no extension). Loaded once per request
     * via a static method rather than a class constant — PHP 8 chokes
     * on `\x1B` escape sequences inside `const` ("Constant expression
     * contains invalid operations").
     */
    private static function gsm7Base(): string
    {
        static $s = null;
        if ($s === null) {
            $s = "@£\$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞ" . chr(0x1B) . "ÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
        }

        return $s;
    }

    /** GSM 03.38 extension table — each char costs 2 septets, not 1. */
    private static function gsm7Ext(): string
    {
        return '^{}\\[~]|€';
    }

    private function isAllGsm7(string $text): bool
    {
        $base = self::gsm7Base();
        $ext = self::gsm7Ext();
        $chars = preg_split('//u', $text, -1, PREG_SPLIT_NO_EMPTY) ?: [];
        foreach ($chars as $c) {
            if (mb_strpos($base, $c) === false
                && mb_strpos($ext, $c) === false) {
                return false;
            }
        }

        return true;
    }

    /**
     * Septet length for a GSM-7 message — each extension-table char counts
     * as 2 septets per the 3GPP TS 23.038 spec.
     */
    private function gsm7Septets(string $text): int
    {
        $ext = self::gsm7Ext();
        $chars = preg_split('//u', $text, -1, PREG_SPLIT_NO_EMPTY) ?: [];
        $count = 0;
        foreach ($chars as $c) {
            $count += mb_strpos($ext, $c) !== false ? 2 : 1;
        }

        return $count;
    }

    private function calculateSegments(string $text, string $encoding): int
    {
        if ($encoding === 'gsm7') {
            $septets = $this->gsm7Septets($text);

            return $septets <= 160 ? 1 : (int) ceil($septets / 153);
        }

        $length = mb_strlen($text);

        return $length <= 70 ? 1 : (int) ceil($length / 67);
    }
}
