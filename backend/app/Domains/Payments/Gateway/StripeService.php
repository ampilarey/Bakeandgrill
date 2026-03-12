<?php

declare(strict_types=1);

namespace App\Domains\Payments\Gateway;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Stripe payment gateway service.
 *
 * Uses Stripe's API directly (without the PHP SDK) to keep dependencies minimal.
 * Amounts are in laari (integer). Stripe expects the smallest currency unit (cents/fils).
 * For MVR (Maldivian Rufiyaa), 1 MVR = 100 laari → pass laari directly to Stripe.
 */
class StripeService
{
    private const BASE_URL = 'https://api.stripe.com/v1';

    public function __construct()
    {
        if (!config('services.stripe.secret_key')) {
            throw new \RuntimeException('Stripe secret key not configured.');
        }
    }

    /**
     * Create a PaymentIntent and return client_secret for the frontend.
     *
     * @param  int    $amountLaari  Amount in smallest unit (laari for MVR)
     * @param  string $currency     ISO currency code, e.g. 'mvr', 'usd'
     * @param  string $orderId      Used as metadata for reconciliation
     * @return array{ payment_intent_id: string, client_secret: string }
     */
    public function createPaymentIntent(int $amountLaari, string $currency, string $orderId): array
    {
        $response = Http::withBasicAuth(config('services.stripe.secret_key'), '')
            ->asForm()
            ->post(self::BASE_URL . '/payment_intents', [
                'amount'      => $amountLaari,
                'currency'    => strtolower($currency),
                'metadata[order_id]' => $orderId,
                'automatic_payment_methods[enabled]' => 'true',
            ]);

        if ($response->failed()) {
            Log::error('Stripe createPaymentIntent failed', ['body' => $response->body()]);
            throw new \RuntimeException('Stripe payment creation failed: ' . ($response->json('error.message') ?? $response->body()));
        }

        return [
            'payment_intent_id' => $response->json('id'),
            'client_secret'     => $response->json('client_secret'),
        ];
    }

    /**
     * Retrieve a PaymentIntent from Stripe.
     */
    public function getPaymentIntent(string $paymentIntentId): array
    {
        $response = Http::withBasicAuth(config('services.stripe.secret_key'), '')
            ->get(self::BASE_URL . '/payment_intents/' . $paymentIntentId);

        if ($response->failed()) {
            throw new \RuntimeException('Stripe getPaymentIntent failed: ' . $response->body());
        }

        return $response->json();
    }

    /**
     * Verify a Stripe webhook signature and return the event payload.
     *
     * @throws \RuntimeException if signature is invalid
     */
    public function verifyWebhook(string $rawBody, string $sigHeader): array
    {
        $secret = config('services.stripe.webhook_secret');
        if (!$secret) {
            throw new \RuntimeException('Stripe webhook secret not configured.');
        }

        $parts = [];
        foreach (explode(',', $sigHeader) as $part) {
            [$k, $v] = explode('=', $part, 2);
            $parts[$k][] = $v;
        }

        $timestamp = $parts['t'][0] ?? null;
        $signatures = $parts['v1'] ?? [];

        if (!$timestamp || empty($signatures)) {
            throw new \RuntimeException('Invalid Stripe webhook signature header.');
        }

        // Reject timestamps older than 5 minutes
        if (abs(time() - (int) $timestamp) > 300) {
            throw new \RuntimeException('Stripe webhook timestamp too old.');
        }

        $expectedSig = hash_hmac('sha256', $timestamp . '.' . $rawBody, $secret);

        foreach ($signatures as $sig) {
            if (hash_equals($expectedSig, $sig)) {
                return json_decode($rawBody, true);
            }
        }

        throw new \RuntimeException('Stripe webhook signature mismatch.');
    }

    /**
     * Issue a full or partial refund on a PaymentIntent.
     */
    public function refund(string $paymentIntentId, ?int $amountLaari = null): array
    {
        $params = ['payment_intent' => $paymentIntentId];
        if ($amountLaari !== null) {
            $params['amount'] = $amountLaari;
        }

        $response = Http::withBasicAuth(config('services.stripe.secret_key'), '')
            ->asForm()
            ->post(self::BASE_URL . '/refunds', $params);

        if ($response->failed()) {
            throw new \RuntimeException('Stripe refund failed: ' . $response->body());
        }

        return $response->json();
    }
}
