<?php

declare(strict_types=1);

namespace App\Domains\Newsletter;

use App\Models\NewsletterSubscriber;
use Illuminate\Support\Facades\Log;

/**
 * Newsletter addresses that bounce stop getting it.
 *
 * Mail goes out through the cPanel mailbox over SMTP, so there is no provider
 * webhook: a bounce comes back as an email to the sending address, and cPanel
 * pipes that mailbox into `newsletter:bounce` (docs/MAIL_SETUP.md), which hands the
 * raw message to parse(). A refusal while sending (SmtpRefusal) is recorded the
 * same way. A hard bounce stops the address at once, a soft one (mailbox full,
 * try later) after SOFT_LIMIT, and a spam complaint unsubscribes it. Only an
 * address already on the list is ever touched, so a stray message can mark nobody
 * else. Signing up again and confirming clears it (Newsletter::confirm).
 */
final class Bounces
{
    public const SOFT_LIMIT = 3;

    /**
     * What a bounce or complaint message says happened, per recipient.
     *
     * @return list<array{email: string, kind: 'hard'|'soft'|'complaint', reason: string}>
     */
    public static function parse(string $raw): array
    {
        $raw = str_replace("\r\n", "\n", $raw);
        $out = [];

        // A spam complaint (ARF, RFC 5965).
        if (preg_match('/^Feedback-Type:\s*abuse/mi', $raw)) {
            foreach (['Original-Rcpt-To', 'Removal-Recipient'] as $header) {
                if (preg_match('/^' . $header . ':\s*(?:rfc822;\s*)?<?([^\s>]+@[^\s>]+)>?/mi', $raw, $m)) {
                    return [['email' => mb_strtolower($m[1]), 'kind' => 'complaint', 'reason' => 'Marked as spam']];
                }
            }

            return [];
        }

        // A delivery status notification (RFC 3464): one block per recipient.
        $blocks = preg_split('/\n(?=Final-Recipient:)/i', $raw) ?: [];
        foreach ($blocks as $block) {
            if (!preg_match('/^Final-Recipient:\s*(?:rfc822;\s*)?<?([^\s>]+@[^\s>]+)>?/mi', $block, $to)) {
                continue;
            }
            $action = preg_match('/^Action:\s*(\w+)/mi', $block, $a) ? strtolower($a[1]) : '';
            if ($action !== 'failed') {
                continue; // "delayed" is not a bounce yet, "delivered" / "relayed" are fine
            }
            $status = preg_match('/^Status:\s*([245])\.(\d{1,3})\.(\d{1,3})/mi', $block, $st) ? "{$st[1]}.{$st[2]}.{$st[3]}" : '5.0.0';
            $diag = preg_match('/^Diagnostic-Code:\s*(?:smtp;\s*)?(.+)$/mi', $block, $d) ? trim($d[1]) : '';
            $out[] = [
                'email' => mb_strtolower($to[1]),
                'kind' => self::kindOf($status),
                'reason' => mb_substr(trim($status . ' ' . $diag), 0, 255),
            ];
        }

        return $out;
    }

    /** Mailbox full (5.2.2) and anything temporary (4.x.x) are soft; the rest of 5.x.x is hard. */
    public static function kindOf(string $status): string
    {
        return str_starts_with($status, '5.') && $status !== '5.2.2' ? 'hard' : 'soft';
    }

    /** Record one bounce or complaint. Returns whether an address on the list was found. */
    public static function record(string $email, string $kind, string $reason): bool
    {
        $sub = NewsletterSubscriber::query()->where('email', mb_strtolower(trim($email)))->first();
        if ($sub === null) {
            return false;
        }
        if ($kind === 'complaint') {
            app(Newsletter::class)->unsubscribe($sub);
            $sub->forceFill(['bounce_reason' => mb_substr($reason, 0, 255)])->save();
        } else {
            $count = $sub->bounce_count + 1;
            $stop = $kind === 'hard' || $count >= self::SOFT_LIMIT;
            $sub->forceFill([
                'bounce_count' => $count,
                'bounce_reason' => mb_substr($reason, 0, 255),
                'bounced_at' => $stop ? ($sub->bounced_at ?? now()) : $sub->bounced_at,
            ])->save();
        }
        Log::info('newsletter.bounce', ['subscriber_id' => $sub->id, 'kind' => $kind]);

        return true;
    }

    /** Parse a whole message and record what it says. Returns how many list addresses it marked. */
    public static function handle(string $raw): int
    {
        $marked = 0;
        foreach (self::parse($raw) as $row) {
            $marked += self::record($row['email'], $row['kind'], $row['reason']) ? 1 : 0;
        }

        return $marked;
    }

    /**
     * A refusal while sending: the server said no for good (5xx) or for now (4xx).
     * Returns the kind recorded, or null when the error was not a refusal of the address.
     */
    public static function fromSendError(string $email, \Throwable $e): ?string
    {
        $message = $e->getMessage();
        if (!preg_match('/\b([45])(\d\d)\b(?:[ -]+([245]\.\d{1,3}\.\d{1,3}))?/', $message, $m)) {
            return null;
        }
        // Only refusals about the recipient (55x, 450/452 mailbox): not auth or connection trouble.
        $code = (int) ($m[1] . $m[2]);
        if (!in_array($code, [450, 452, 550, 551, 552, 553], true)) {
            return null;
        }
        $kind = isset($m[3]) && $m[3] !== '' ? self::kindOf($m[3]) : ($m[1] === '5' && $code !== 552 ? 'hard' : 'soft');
        self::record($email, $kind, mb_substr($code . ' ' . $message, 0, 255));

        return $kind;
    }
}
