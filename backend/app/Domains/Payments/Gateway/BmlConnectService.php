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
 *  - localId MUST be alphanumeric only (no hyphens), max 50 chars
 *  - paymentPortalExperience is required by BML Connect v2
 *  - Webhook signature verified via HMAC-SHA256 of raw body
 *  - Return URLs are NON-AUTHORITATIVE — never trust them for payment status
 *  - UAT base URL: https://api.uat.merchants.bankofmaldives.com.mv/public
 *  - Endpoint: /v2/transactions
 *
 * Auth modes (BML_AUTH_MODE env):
 *   raw          → Authorization: {API_KEY}           (BML UAT)
 *   bearer_jwt   → Authorization: Bearer {API_KEY}
 *   bearer_basic → Authorization: Bearer base64(API_KEY:APP_ID)
 *   auto         → eyJ prefix = bearer_jwt, else bearer_basic
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
     * @param string $localId    Unique merchant-side transaction ID (alphanumeric, max 50 chars)
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
        $currency    = $currency ?? config('bml.default_currency', 'MVR');
        $localId     = $this->normalizeLocalId($localId);
        $redirectUrl = $returnUrl ?? config('bml.return_url') ?? config('frontend.order_status_url');

        $payload = [
            'amount'      => $amountLaar,
            'currency'    => $currency,
            'localId'     => $localId,
            'redirectUrl' => $redirectUrl,
        ];

        // Include appId in payload — required by some BML Connect environments
        if ($this->appId) {
            $payload['appId'] = $this->appId;
        }

        $url = "{$this->baseUrl}/v2/transactions";

        Log::info('BML: Creating payment session', [
            'local_id'    => $localId,
            'amount_laar' => $amountLaar,
            'currency'    => $currency,
            'url'         => $url,
            'auth_mode'   => config('bml.auth_mode', 'auto'),
        ]);

        $response = Http::withHeaders([
            'Content-Type'  => 'application/json',
            'Accept'        => 'application/json',
            'Authorization' => $this->authorizationHeader(),
        ])
            ->timeout(30)
            ->retry(2, 500, null, false)
            ->post($url, $payload);

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
     * Normalize localId: alphanumeric only (no hyphens per BML spec), max 50 chars.
     */
    public function normalizeLocalId(string $localId): string
    {
        return substr(preg_replace('/[^A-Za-z0-9]/', '', $localId), 0, 50);
    }

    /**
     * Build Authorization header value based on BML_AUTH_MODE:
     *   raw          → {API_KEY}                        (BML UAT uses this)
     *   bearer_jwt   → Bearer {API_KEY}
     *   bearer_basic → Bearer base64(API_KEY:APP_ID)
     *   auto         → eyJ... = Bearer JWT, else bearer_basic
     */
    private function authorizationHeader(): string
    {
        $mode = config('bml.auth_mode', 'auto');
        $key  = trim($this->apiKey);

        return match ($mode) {
            'raw'          => $key,
            'bearer_jwt'   => "Bearer {$key}",
            'bearer_basic' => 'Bearer ' . base64_encode($key . ':' . $this->appId),
            default        => str_starts_with($key, 'eyJ')
                                ? "Bearer {$key}"
                                : 'Bearer ' . base64_encode($key . ':' . $this->appId),
        };
    }
}
