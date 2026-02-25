<?php

declare(strict_types=1);

namespace App\Domains\Notifications\Services;

use App\Domains\Notifications\DTOs\SmsMessage;
use App\Models\SmsLog;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Core SMS sending service.
 *
 * - Sends via Dhiraagu API (Maldivian carrier).
 * - Logs EVERY send attempt to sms_logs (OTP, promo, campaign, transactional).
 * - Falls back to demo mode (logs only) when credentials missing or in local/testing env.
 * - Phone normalisation: accepts 7654321, 9607654321, +9607654321.
 *
 * Ported and enhanced from Akuru SMS Manager (battle-tested in production).
 */
class SmsService
{
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

        $log = SmsLog::create([
            'message' => $sms->message,
            'to' => $this->normalizePhone($sms->to),
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

        $normalized = $this->normalizePhone($sms->to);
        $credentials = $this->credentials();

        if ($credentials && $this->isValidMaldivianNumber($normalized)) {
            [$success, $response, $error] = $this->sendViaDhiraagu(
                $normalized,
                $sms->message,
                $credentials,
            );
        } else {
            // Demo / missing credentials
            [$success, $response, $error] = $this->demoSend($normalized, $sms->message);
        }

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

    private function sendViaDhiraagu(string $phone, string $message, array $creds): array
    {
        $authorizationKey = base64_encode($creds['username'] . ':' . $creds['password']);

        try {
            $response = Http::timeout($creds['timeout'])
                ->withHeaders(['Content-Type' => 'application/json'])
                ->post($creds['api_url'], [
                    'destination' => [$phone],
                    'content' => $message,
                    'authorizationKey' => $authorizationKey,
                ]);

            $data = $response->json() ?? [];

            Log::info('SMS: Dhiraagu response', [
                'to' => $phone,
                'status' => $response->status(),
                'transaction_id' => $data['transactionId'] ?? null,
            ]);

            if ($response->successful() && ($data['transactionStatus'] ?? '') === 'true') {
                return [true, $data, null];
            }

            $errorMsg = $data['errorMessage'] ?? $data['message'] ?? "HTTP {$response->status()}";

            return [false, $data, $errorMsg];
        } catch (\Throwable $e) {
            Log::error('SMS: Dhiraagu exception', ['to' => $phone, 'error' => $e->getMessage()]);

            return [false, [], $e->getMessage()];
        }
    }

    private function demoSend(string $phone, string $message): array
    {
        Log::info('SMS: Demo mode — not sent', ['to' => $phone, 'message' => $message]);

        return [true, 'demo', null];
    }

    private function credentials(): ?array
    {
        $config = config('services.dhiraagu');
        $username = $config['username'] ?? null;
        $password = $config['password'] ?? null;
        $apiUrl = $config['api_url'] ?? null;

        if (!$username || !$password || !$apiUrl) {
            return null;
        }

        // In local/testing, always use demo mode to avoid sending real SMS
        if (app()->environment(['local', 'testing'])) {
            return null;
        }

        return [
            'api_url' => $apiUrl,
            'username' => $username,
            'password' => $password,
            'timeout' => (int) ($config['timeout'] ?? 30),
        ];
    }

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
