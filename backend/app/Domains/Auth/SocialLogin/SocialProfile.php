<?php

declare(strict_types=1);

namespace App\Domains\Auth\SocialLogin;

/**
 * Who signed in at a provider: its stable id for the person (subject), the email it gave and
 * whether it vouches that the person owns that email, and their name when it shared one.
 */
final class SocialProfile
{
    public function __construct(
        public readonly string $provider,
        public readonly string $subject,
        public readonly ?string $email,
        public readonly bool $emailVerified,
        public readonly ?string $name,
    ) {}

    /** @return array{provider: string, subject: string, email: ?string, email_verified: bool, name: ?string} */
    public function toArray(): array
    {
        return ['provider' => $this->provider, 'subject' => $this->subject, 'email' => $this->email, 'email_verified' => $this->emailVerified, 'name' => $this->name];
    }

    /** @param array<string, mixed> $data */
    public static function fromArray(array $data): ?self
    {
        if (!is_string($data['provider'] ?? null) || !is_string($data['subject'] ?? null) || $data['subject'] === '') {
            return null;
        }

        return new self($data['provider'], $data['subject'], is_string($data['email'] ?? null) ? $data['email'] : null, (bool) ($data['email_verified'] ?? false), is_string($data['name'] ?? null) ? $data['name'] : null);
    }
}
