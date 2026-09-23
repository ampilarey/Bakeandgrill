<?php

declare(strict_types=1);

namespace App\Domains\Social\Drivers;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Http;

/**
 * Shared Meta Graph API plumbing for the Facebook and Instagram drivers:
 * base URL, error classification, and the send-with-unknown-on-timeout rule
 * (a timeout after the request went out may have published — never assume
 * failure).
 */
trait MetaGraphSupport
{
    private function graphBase(): string
    {
        return 'https://graph.facebook.com/' . config('social.graph_version', 'v21.0');
    }

    /**
     * @param array<string, mixed> $params
     */
    private function graphPost(string $path, array $params): Response
    {
        try {
            return Http::asForm()->timeout(20)->post($this->graphBase() . $path, $params);
        } catch (ConnectionException $e) {
            // The request may have reached Meta before the connection died.
            throw SocialPublishException::unknown('Meta request timed out: ' . $e->getMessage());
        }
    }

    /**
     * @param array<string, mixed> $params
     */
    private function graphGet(string $path, array $params): Response
    {
        try {
            return Http::timeout(20)->get($this->graphBase() . $path, $params);
        } catch (ConnectionException $e) {
            throw SocialPublishException::transient('Meta request timed out: ' . $e->getMessage());
        }
    }

    /**
     * Ask Meta about the stored token: still valid, and when it expires.
     * Page tokens minted from a long-lived user token report `expires_at`
     * 0, which means "never" — that becomes a null expiry, not 1970.
     * `$labelField` is the account node's display field (name, username).
     */
    private function metaHealth(string $token, string $accountPath, string $labelField): ChannelHealth
    {
        try {
            $debug = Http::timeout(15)->get($this->graphBase() . '/debug_token', [
                'input_token' => $token,
                'access_token' => $token,
            ]);
        } catch (ConnectionException $e) {
            return ChannelHealth::error('Could not reach Meta: ' . $e->getMessage());
        }

        if (!$debug->successful() || !is_array($debug->json('data'))) {
            return ChannelHealth::error($this->graphErrorMessage($debug));
        }
        $data = $debug->json('data');
        if (empty($data['is_valid'])) {
            return ChannelHealth::error('Meta says the access token is no longer valid' . (!empty($data['error']['message']) ? ': ' . $data['error']['message'] : '.'));
        }

        $expiresAt = (int) ($data['expires_at'] ?? 0);
        $expires = $expiresAt > 0 ? \Carbon\Carbon::createFromTimestamp($expiresAt) : null;

        try {
            $account = Http::timeout(15)->get($this->graphBase() . $accountPath, [
                'fields' => $labelField,
                'access_token' => $token,
            ]);
        } catch (ConnectionException $e) {
            return ChannelHealth::error('Could not reach Meta: ' . $e->getMessage());
        }
        if (!$account->successful()) {
            return ChannelHealth::error('Token is valid but cannot reach the account: ' . $this->graphErrorMessage($account));
        }
        $label = trim((string) ($account->json($labelField) ?? ''));

        return ChannelHealth::ok(
            $expires === null ? 'Connected; the token does not expire.' : 'Connected; the token expires ' . $expires->toDayDateTimeString() . '.',
            $expires,
            $label !== '' ? $label : null,
        );
    }

    private function graphErrorMessage(Response $response): string
    {
        $error = $response->json('error') ?? [];

        return (string) ($error['message'] ?? ('HTTP ' . $response->status()));
    }

    /**
     * One GET that never throws: null on any failure. Used for insights,
     * which are nice-to-have and must not mark a delivery as anything.
     *
     * @param array<string, mixed> $params
     * @return array<string, mixed>|null
     */
    private function graphGetQuiet(string $path, array $params): ?array
    {
        try {
            $response = Http::timeout(15)->get($this->graphBase() . $path, $params);
        } catch (ConnectionException) {
            return null;
        }

        return $response->successful() && is_array($response->json()) ? $response->json() : null;
    }

    /** Throw a classified exception for a non-2xx Graph response. */
    private function throwGraphError(Response $response): never
    {
        $error = $response->json('error') ?? [];
        $code = (int) ($error['code'] ?? 0);
        $message = (string) ($error['message'] ?? ('HTTP ' . $response->status()));

        // OAuth errors (190) and permission errors (200-299 range) = auth.
        if ($code === 190 || ($code >= 200 && $code < 300) || $response->status() === 401) {
            throw SocialPublishException::auth($message);
        }
        if ($code === 4 || $code === 17 || $code === 32 || $response->status() === 429) {
            throw SocialPublishException::rateLimit($message);
        }
        if ($response->status() >= 500) {
            throw SocialPublishException::transient($message);
        }

        throw SocialPublishException::validation($message);
    }
}
