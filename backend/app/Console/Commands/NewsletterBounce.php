<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Domains\Newsletter\Bounces;
use Illuminate\Console\Command;

/**
 * Reads one bounce or complaint email (cPanel pipes the sending mailbox here:
 * docs/MAIL_SETUP.md) and stops the newsletter to the addresses it names.
 * Always exits 0: a failing pipe makes the mail server bounce the bounce.
 */
class NewsletterBounce extends Command
{
    protected $signature = 'newsletter:bounce {--file= : Read the message from a file instead of standard input}';

    protected $description = 'Record a bounced or complained newsletter email (piped in from the mailbox)';

    public function handle(): int
    {
        try {
            $file = $this->option('file');
            $raw = is_string($file) && $file !== '' ? (string) @file_get_contents($file) : (string) stream_get_contents(STDIN);
            if ($raw !== '') {
                $this->line('Marked ' . Bounces::handle(mb_substr($raw, 0, 2_000_000)) . ' address(es).');
            }
        } catch (\Throwable $e) {
            report($e);
        }

        return self::SUCCESS;
    }
}
