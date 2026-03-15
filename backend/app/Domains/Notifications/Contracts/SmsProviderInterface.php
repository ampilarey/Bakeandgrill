<?php

declare(strict_types=1);

namespace App\Domains\Notifications\Contracts;

/**
 * Transport contract for sending raw SMS messages.
 *
 * Implementations handle credentials, HTTP calls, demo mode, etc.
 * Returns a 3-tuple: [bool $success, mixed $gatewayResponse, ?string $errorMessage]
 */
interface SmsProviderInterface
{
    /**
     * Send a raw SMS to a normalised phone number.
     *
     * @param  string  $to      Normalised E.164 number (e.g. "+9607654321")
     * @param  string  $message Message body
     * @return array{0: bool, 1: mixed, 2: string|null}  [$success, $response, $error]
     */
    public function send(string $to, string $message): array;
}
