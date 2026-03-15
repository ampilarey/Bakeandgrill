<?php

declare(strict_types=1);

namespace App\Domains\Notifications\Providers;

use App\Domains\Notifications\Contracts\SmsProviderInterface;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Dhiraagu (Maldivian carrier) SMS gateway implementation.
 */
class DhiraaguSmsProvider implements SmsProviderInterface
{
    public function send(string $phone, string $message): array
    {
        $config = config('services.dhiraagu');
        $username = $config['username'] ?? null;
        $password = $config['password'] ?? null;
        $apiUrl = $config['api_url'] ?? null;
        $timeout = (int) ($config['timeout'] ?? 30);

        if (!$username || !$password || !$apiUrl || app()->environment(['local', 'testing'])) {
            return $this->demoSend($phone, $message);
        }

        $authorizationKey = base64_encode($username . ':' . $password);

        try {
            $response = Http::timeout($timeout)
                ->withHeaders(['Content-Type' => 'application/json'])
                ->post($apiUrl, [
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
                return ['success' => true, 'response' => $data, 'error' => null];
            }

            $errorMsg = $data['errorMessage'] ?? $data['message'] ?? "HTTP {$response->status()}";

            return ['success' => false, 'response' => $data, 'error' => $errorMsg];
        } catch (\Throwable $e) {
            Log::error('SMS: Dhiraagu exception', ['to' => $phone, 'error' => $e->getMessage()]);

            return ['success' => false, 'response' => [], 'error' => $e->getMessage()];
        }
    }

    public function name(): string
    {
        return 'dhiraagu';
    }

    private function demoSend(string $phone, string $message): array
    {
        Log::info('SMS: Demo mode — not sent', ['to' => $phone, 'message' => $message]);

        return ['success' => true, 'response' => 'demo', 'error' => null];
    }
}
