<?php

declare(strict_types=1);

namespace App\Domains\Payments\Gateway;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * BML Connect payment gateway service.
 *
 * Based on the battle-tested Akuru Institute implementation.
 *
 * Key BML rules:
 *  - Amount MUST be in laari (integer, e.g. 1 MVR = 100 laari)
 *  - localId MUST be unique per merchant and <= 50 chars
 *  - Webhook signature verified via HMAC-SHA256 of raw body
 *  - Return URLs are NON-AUTHORITATIVE — never trust them for payment status
 *  - Always wait for webhook before marking paid
 *  - UAT base URL: https://api.uat.merchants.bankofmaldives.com.mv/public
 *  - Endpoint: /v2/transactions
 */
class BmlConnectService
{
    private string $baseUrl;
    private string $appId;
    private string $apiKey;

    public function __construct()
    {
        $this->baseUrl = rtrim(config('bml.base_url', 'https://api.merchants.bankofmaldives.com.mv/public'), '/');
        $this->appId   = (string) (config('bml.app_id') ?? '');
        $this->apiKey  = (string) (config('bml.api_key') ?? '');
    }

    /**
     * Create a payment session with BML.
     *
     * @param int    $amountLaar Amount in laari (e.g. 2500 = MVR 25.00)
     * @param string $localId    Unique merchant-side transaction ID (max 50 chars)
     * @return array{payment_url: string, transaction_id: string, local_id: string}
     *
     * @throws \RuntimeException on gateway error
     */
    public function createPayment(
        int $amountLaar,
        string $localId,
        ?string $currency = null,
        ?string $returnUrl = null,
    ): array {
        $currency  = $currency ?? config('bml.default_currency', 'MVR');
        $localId   = $this->normalizeLocalId($localId);
        $redirectUrl = $returnUrl ?? config('bml.return_url') ?? config('frontend.order_status_url');

        $payload = [
            'amount'      => $amountLaar,
            'currency'    => $currency,
            'localId'     => $localId,
            'redirectUrl' => $redirectUrl,
        ];

        // Optional: include webhook URL so BML can push status updates
        if ($webhookUrl = config('bml.webhook_url')) {
            $payload['webhook'] = $webhookUrl;
        }

        Log::info('BML: Creating payment session', [
            'local_id'    => $localId,
            'amount_laar' => $amountLaar,
            'currency'    => $currency,
            'url'         => $this->baseUrl . '/v2/transactions',
        ]);

        $response = Http::withHeaders([
            'Content-Type'  => 'application/json',
            'Accept'        => 'application/json',
            'Authorization' => $this->authorizationHeader(),
        ])
            ->timeout(30)
            ->retry(2, 500)
            ->post("{$this->baseUrl}/v2/transactions", $payload);

        $body = $response->json() ?? [];

        if (!$response->successful()) {
            Log::error('BML: Payment creation failed', [
                'local_id'     => $localId,
                'status'       => $response->status(),
                'body'         => $response->body(),
                'payload_sent' => $payload,
            ]);
            throw new \RuntimeException("BML payment creation failed ({$response->status()}): " . $response->body());
        }

        $paymentUrl    = $body['url'] ?? $body['shortUrl'] ?? $body['paymentUrl'] ?? $body['redirectUrl'] ?? null;
        $transactionId = $body['id'] ?? $body['transactionId'] ?? $body['transaction_id'] ?? '';

        if (!$paymentUrl) {
            Log::error('BML: No payment URL in response', ['local_id' => $localId, 'body' => $body]);
            throw new \RuntimeException('BML did not return a payment URL.');
        }

        Log::info('BML: Payment session created', [
            'local_id'       => $localId,
            'transaction_id' => $transactionId,
            'payment_url'    => $paymentUrl,
        ]);

        return [
            'payment_url'    => $paymentUrl,
            'transaction_id' => $transactionId,
            'local_id'       => $localId,
        ];
    }

    /**
     * Verify BML webhook signature (HMAC-SHA256 of raw body).
     */
    public function verifyWebhookSignature(string $rawBody, string $signature): bool
    {
        $secret = config('bml.webhook_secret');
        if (!$secret) {
            Log::warning('BML: Webhook secret not configured');
            return false;
        }

        $expected = hash_hmac('sha256', $rawBody, $secret);
        return hash_equals($expected, strtolower($signature));
    }

    /**
     * Get transaction status from BML.
     */
    public function getTransactionStatus(string $transactionId): array
    {
        $response = Http::withHeaders([
            'Accept'        => 'application/json',
            'Authorization' => $this->authorizationHeader(),
        ])
            ->timeout(15)
            ->get("{$this->baseUrl}/v2/transactions/{$transactionId}");

        if (!$response->successful()) {
            throw new \RuntimeException("BML status check failed: {$response->status()}");
        }

        return $response->json();
    }

    /**
     * Normalize localId: alphanumeric + hyphens, uppercase, max 50 chars.
     */
    public function normalizeLocalId(string $localId): string
    {
        $normalized = strtoupper(preg_replace('/[^a-zA-Z0-9\-]/', '', $localId));
        return substr($normalized, 0, 50);
    }

    /**
     * Build Authorization header.
     * If api_key is a JWT (starts with eyJ), use Bearer token.
     * Otherwise use Bearer base64(apiKey:appId).
     */
    private function authorizationHeader(): string
    {
        $key = trim($this->apiKey);
        if (str_starts_with($key, 'eyJ')) {
            return "Bearer {$key}";
        }
        return 'Bearer ' . base64_encode($key . ':' . $this->appId);
    }
}
