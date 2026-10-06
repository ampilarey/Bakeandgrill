<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Support\MailStatus;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Mail;

/**
 * php artisan mail:test you@example.com
 *
 * Shows how mail is configured and sends one test e-mail, reporting the mail
 * server's own error when it fails (owner, 2026-10-06: "mail setup"). Nothing
 * secret is printed: only whether the username and password are set.
 */
class MailTest extends Command
{
    protected $signature = 'mail:test {to : Address to send the test e-mail to}';

    protected $description = 'Show the mail settings and send one test e-mail';

    public function handle(): int
    {
        $to = trim((string) $this->argument('to'));
        if (filter_var($to, FILTER_VALIDATE_EMAIL) === false) {
            $this->components->error("\"{$to}\" is not an e-mail address.");

            return self::FAILURE;
        }

        $s = MailStatus::inspect();
        $this->components->twoColumnDetail('Mailer', $s['mailer']);
        if ($s['mailer'] === 'smtp') {
            $this->components->twoColumnDetail('Server', trim(($s['host'] ?? '?') . ':' . ($s['port'] ?? '?') . ' ' . ($s['scheme'] ? "({$s['scheme']})" : '')));
            $this->components->twoColumnDetail('Username', $s['username_set'] ? 'set' : 'MISSING');
            $this->components->twoColumnDetail('Password', $s['password_set'] ? 'set' : 'MISSING');
        }
        $this->components->twoColumnDetail('From', trim($s['from_name'] . ' <' . $s['from_address'] . '>'));

        foreach ($s['problems'] as $p) {
            $this->components->warn($p);
        }

        if (! $s['sends']) {
            $this->components->error('Nothing was sent: this mailer keeps e-mails on the server. Fix the settings above, then run: php artisan config:cache');

            return self::FAILURE;
        }

        try {
            Mail::raw(
                "This is a test e-mail from {$s['from_name']}.\n\nIf you can read this, the website can send e-mail: order confirmations, sign-in codes, gift cards and catering quotes will reach customers.\n\nSent " . now()->format('j M Y, g:i A') . '.',
                function ($message) use ($to, $s): void {
                    $message->to($to)->subject("Test e-mail from {$s['from_name']}");
                },
            );
        } catch (\Throwable $e) {
            $this->components->error('The mail server refused it: ' . $e->getMessage());
            $this->line('  Common causes: wrong password, port 465 needs MAIL_SCHEME=smtps, port 587 needs MAIL_SCHEME=smtp, or the From address is not a mailbox on this domain.');

            return self::FAILURE;
        }

        $this->components->info("Sent to {$to}. Check the inbox and the spam folder.");

        return self::SUCCESS;
    }
}
