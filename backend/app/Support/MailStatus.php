<?php

declare(strict_types=1);

namespace App\Support;

/**
 * Whether this install can actually deliver e-mail (owner, 2026-10-06: "mail
 * setup"). The framework's default mailer is "log", which writes every e-mail
 * to a file and sends nothing: customers who sign in by e-mail never get their
 * code, and order confirmations, gift cards and catering quotes vanish without
 * an error. Shared by `php artisan mail:test` and the deploy check.
 */
final class MailStatus
{
    /** Mailers that never leave the server. */
    public const NOT_SENDING = ['log', 'array'];

    /**
     * @return array{mailer: string, sends: bool, host: ?string, port: ?string, scheme: ?string, username_set: bool, password_set: bool, from_address: string, from_name: string, problems: list<string>}
     */
    public static function inspect(): array
    {
        $mailer = (string) config('mail.default', 'log');
        $smtp = (array) config('mail.mailers.smtp', []);
        $from = (string) config('mail.from.address', '');
        $problems = [];

        if (in_array($mailer, self::NOT_SENDING, true)) {
            $problems[] = "MAIL_MAILER is \"{$mailer}\": e-mails are not sent at all. Set MAIL_MAILER=smtp.";
        }

        if ($mailer === 'smtp' && blank($smtp['url'] ?? null)) {
            $host = (string) ($smtp['host'] ?? '');
            if ($host === '' || in_array($host, ['127.0.0.1', 'localhost', 'your-smtp-host', 'mailpit'], true)) {
                $problems[] = 'MAIL_HOST is not set to a real mail server (for cPanel: mail.<your domain>).';
            }
            if (blank($smtp['username'] ?? null) || blank($smtp['password'] ?? null)) {
                $problems[] = 'MAIL_USERNAME or MAIL_PASSWORD is empty.';
            }
        }

        if ($from === '' || str_ends_with($from, '@example.com')) {
            $problems[] = 'MAIL_FROM_ADDRESS is not set to a real address on your domain.';
        }

        return [
            'mailer' => $mailer,
            'sends' => ! in_array($mailer, self::NOT_SENDING, true),
            'host' => isset($smtp['host']) ? (string) $smtp['host'] : null,
            'port' => isset($smtp['port']) ? (string) $smtp['port'] : null,
            'scheme' => isset($smtp['scheme']) ? (string) $smtp['scheme'] : null,
            'username_set' => filled($smtp['username'] ?? null),
            'password_set' => filled($smtp['password'] ?? null),
            'from_address' => $from,
            'from_name' => (string) config('mail.from.name', ''),
            'problems' => $problems,
        ];
    }
}
