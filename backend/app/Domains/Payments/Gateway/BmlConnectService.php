<?php

declare(strict_types=1);

namespace App\Domains\Payments\Gateway;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * BML Connect payment gateway service.
 *
 * Ported from the Akuru Institute battle-tested implementation.
 *
 * Key BML rules:
 *  - Amount MUST be in laari (integer, e.g. 1 MVR = 100 laari)
 *  - localId MUST be unique per merchant and <= 50 chars
 *  - Webhook signature verified via HMAC-SHA256 of raw body
 *  - Return URLs are NON-AUTHORITATIVE — never trust them for payment status
 *  - Always wait for webhook before marking paid
 */
class BmlConnectService
{
    private string $baseUrl;

    private string $appId;

    private string $apiKey;

    private string $merchantId;

    public function __construct()
    {
        $this->baseUrl = rtrim(config('bml.base_url', 'https://api.merchants.bankofmaldives.com.mv'), '/');
        $this->appId = (string) (config('bml.app_id') ?? '');
        $this->apiKey = (string) (config('bml.api_key') ?? '');
        $this->merchantId = (string) (config('bml.merchant_id') ?? '');
    }

    /**
     * Create a payment session with BML.
     *
     * @param int $amountLaar Amount in laari (e.g. 2500 = MVR 25.00)
     * @param string $localId Unique merchant-side transaction ID (max 50 chars)
     * @param string $currency Currency code (default: MVR)
     * @return array{payment_url: string, transaction_id: string, local_id: string}
     *
     * @throws \RuntimeException on gateway error
     */
    public function createPayment(
        int $amountLaar,
        string $localId,
        string $currency = 'MVR',
        ?string $returnUrl = null,
    ): array {
        $payload = [
            'localId'     => $this->normalizeLocalId($localId),
            'merchantId'  => $this->merchantId,
            'amount'      => $amountLaar,
            'currency'    => $currency,
            'redirectUrl' => $returnUrl ?? config('bml.return_url'),
            // 'logo' omitted — BML rejects null; only send if you have a URL
        ];

        Log::info('BML: Creating payment session', [
            'local_id' => $payload['localId'],
            'amount_laar' => $amountLaar,
            'currency' => $currency,
        ]);

        $response = Http::withHeaders([
            'Content-Type' => 'application/json',
            'AppId' => $this->appId,
            'ApiKey' => $this->apiKey,
        ])
            ->timeout(30)
            ->post("{$this->baseUrl}/v1/transactions", $payload);

        if (!$response->successful()) {
            Log::error('BML: Payment creation failed', [
                'local_id'    => $payload['localId'],
                'status'      => $response->status(),
                'body'        => $response->body(),
                'payload_sent' => $payload,
            ]);
            $body = $response->body();
            throw new \RuntimeException("BML payment creation failed ({$response->status()}): {$body}");
        }

        $data = $response->json();

        Log::info('BML: Payment session created', [
            'local_id' => $payload['localId'],
            'transaction_id' => $data['transactionId'] ?? null,
        ]);

        return [
            'payment_url' => $data['url'] ?? "{$this->baseUrl}/pay/{$data['transactionId']}",
            'transaction_id' => $data['transactionId'] ?? '',
            'local_id' => $payload['localId'],
        ];
    }

    /**
     * Verify BML webhook signature.
     * Uses HMAC-SHA256 of raw request body against the webhook secret.
     * Uses hash_equals() to prevent timing attacks.
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
            'AppId' => $this->appId,
            'ApiKey' => $this->apiKey,
        ])
            ->timeout(15)
            ->get("{$this->baseUrl}/v1/transactions/{$transactionId}");

        if (!$response->successful()) {
            throw new \RuntimeException("BML status check failed: {$response->status()}");
        }

        return $response->json();
    }

    /**
     * Normalize localId to BML requirements:
     *  - Alphanumeric + hyphens only
     *  - Max 50 characters
     *  - Uppercase
     */
    public function normalizeLocalId(string $localId): string
    {
        $normalized = strtoupper(preg_replace('/[^a-zA-Z0-9\-]/', '', $localId));

        return substr($normalized, 0, 50);
    }
}
