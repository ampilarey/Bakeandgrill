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
