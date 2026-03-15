<?php

declare(strict_types=1);

namespace App\Domains\Notifications\Contracts;

/**
 * SMS provider contract.
 *
 * Implement this interface to add a new SMS gateway (e.g. Twilio, Ooredoo).
 * The active implementation is resolved via the service container, so swapping
 * providers requires only a binding change — no business logic needs to change.
 */
interface SmsProviderInterface
{
    /**
     * Send an SMS message and return the gateway response.
     *
     * @param  string $phone   Normalised phone number (e.g. +9607654321)
     * @param  string $message The message text
     * @return array{success: bool, response: mixed, error: string|null}
     */
    public function send(string $phone, string $message): array;

    /**
     * Return the provider name for logging purposes (e.g. 'dhiraagu', 'twilio').
     */
    public function name(): string;
}
