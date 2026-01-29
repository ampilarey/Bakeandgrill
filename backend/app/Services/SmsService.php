<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class SmsService
{
    public function estimate(string $body): array
    {
        $encoding = $this->detectEncoding($body);
        $segments = $this->calculateSegments($body, $encoding);

        return [
            'encoding' => $encoding,
            'length' => mb_strlen($body),
            'segments' => $segments,
            'cost_mvr' => $segments * 0.25,
        ];
    }

    public function send(string $phone, string $message): bool
    {
        $dhiraagu = config('services.dhiraagu');
        $username = $dhiraagu['username'] ?? null;
        $password = $dhiraagu['password'] ?? null;
        $apiUrl = $dhiraagu['api_url'] ?? null;

        if ($apiUrl && $username && $password) {
            return $this->sendViaDhiraagu(
                $phone,
                $message,
                $apiUrl,
                $username,
                $password,
                (int) ($dhiraagu['timeout'] ?? 30)
            );
        }

        Log::info('SMS demo mode - credentials missing', [
            'phone' => $phone,
            'message' => $message,
        ]);

        return true;
    }

    private function sendViaDhiraagu(
        string $phone,
        string $message,
        string $apiUrl,
        string $username,
        string $password,
        int $timeout
    ): bool {
        $normalized = $this->normalizePhone($phone);
        $authorizationKey = base64_encode($username . ':' . $password);

        try {
            Log::info('Sending SMS via Dhiraagu API', [
                'to' => $normalized,
                'message_length' => strlen($message),
            ]);

            $response = Http::timeout($timeout)
                ->acceptJson()
                ->post($apiUrl, [
                    'destination' => [$normalized],
                    'content' => $message,
                    'authorizationKey' => $authorizationKey,
                ]);

            if ($response->successful()) {
                $data = $response->json();
                $success = isset($data['transactionStatus'])
                    ? $data['transactionStatus'] === 'true'
                    : true;

                if ($success) {
                    return true;
                }

                Log::warning('Dhiraagu SMS rejected', [
                    'phone' => $normalized,
                    'response' => $data,
                ]);

                return false;
            }

            Log::warning('Dhiraagu SMS failed', [
                'phone' => $normalized,
                'status' => $response->status(),
                'body' => $response->body(),
            ]);
        } catch (\Throwable $error) {
            Log::error('Dhiraagu SMS error', [
                'phone' => $normalized,
                'error' => $error->getMessage(),
            ]);
        }

        return false;
    }

    private function normalizePhone(string $phone): string
    {
        $digits = preg_replace('/[^0-9]/', '', $phone);
        if (str_starts_with($digits, '960')) {
            return $digits;
        }

        if (strlen($digits) === 7) {
            return '960' . $digits;
        }

        if (strlen($digits) === 8 && str_starts_with($digits, '7')) {
            return '960' . substr($digits, -7);
        }

        if (strlen($digits) > 7) {
            return '960' . substr($digits, -7);
        }

        return '960' . str_pad($digits, 7, '0', STR_PAD_LEFT);
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
