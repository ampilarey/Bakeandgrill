<?php

declare(strict_types=1);

namespace App\Domains\Notifications\Providers;

use App\Domains\Notifications\Contracts\SmsProviderInterface;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Dhiraagu (Maldivian carrier) SMS transport.
 *
 * Falls back to demo mode (log-only) when:
 *   - credentials are missing from config/services.php
 *   - the environment is local or testing
 *   - the number does not match the Maldivian +960XXXXXXX format
 */
class DhiraaguSmsProvider implements SmsProviderInterface
{
    public function send(string $to, string $message): array
    {
        $credentials = $this->credentials();

        if ($credentials && $this->isValidMaldivianNumber($to)) {
            return $this->sendViaDhiraagu($to, $message, $credentials);
        }

        return $this->demoSend($to, $message);
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    private function isValidMaldivianNumber(string $normalized): bool
    {
        return (bool) preg_match('/^\+960[0-9]{7}$/', $normalized);
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

        // PHPUnit never hits the carrier. Local dev defaults to demo unless
        // SMS_LIVE=true (staging boxes like test.bakeandgrill.mv set this).
        if (app()->environment('testing')) {
            return null;
        }

        if (app()->environment('local') && !($config['live'] ?? false)) {
            return null;
        }

        return [
            'api_url' => $apiUrl,
            'username' => $username,
            'password' => $password,
            'timeout' => (int) ($config['timeout'] ?? 30),
        ];
    }

    private function sendViaDhiraagu(string $phone, string $message, array $creds): array
    {
        $authorizationKey = base64_encode($creds['username'] . ':' . $creds['password']);

        // Dhiraagu Bulk SMS expects 10-digit destinations: 9607XXXXXXX (no '+').
        $destination = ltrim($phone, '+');

        try {
            $response = Http::timeout($creds['timeout'])
                ->withHeaders(['Content-Type' => 'application/json'])
                ->post($creds['api_url'], [
                    'destination' => [$destination],
                    'content' => $message,
                    'authorizationKey' => $authorizationKey,
                ]);

            $data = $response->json() ?? [];

            Log::info('SMS: Dhiraagu response', [
                'to' => $phone,
                'status' => $response->status(),
                'transaction_id' => $data['transactionId'] ?? null,
            ]);

            if ($response->successful() && $this->transactionAccepted($data)) {
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
        Log::info('SMS: Demo mode — not sent via carrier', ['to' => $phone, 'preview' => mb_substr($message, 0, 80)]);

        // success=false so sms_logs show status "demo", not "sent" (avoids false "delivered" in admin).
        return [false, 'demo', null];
    }

    /** Dhiraagu has returned both string "true" and boolean true. */
    private function transactionAccepted(array $data): bool
    {
        $status = $data['transactionStatus'] ?? $data['transaction_status'] ?? null;

        if ($status === true || $status === 'true' || $status === 'True' || $status === 1 || $status === '1') {
            return true;
        }

        // Some responses only expose a transactionId on success.
        if ($status === null && !empty($data['transactionId'])) {
            return true;
        }

        return false;
    }
}
