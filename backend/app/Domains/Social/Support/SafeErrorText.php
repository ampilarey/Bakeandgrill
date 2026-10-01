<?php

declare(strict_types=1);

namespace App\Domains\Social\Support;

/**
 * Error text with no secrets in it (Social Hub audit, 2026-10-01).
 *
 * When a call to Facebook fails at the network level the client's message
 * carries the full address that was called. For "Connect with Facebook"
 * that address holds the app secret and the login code; for publishing
 * and health checks it holds the Page's access token. That text was stored
 * on the delivery and shown in Social Hub to anyone with view rights, kept
 * in the channel's health note, and written to the log. Every error message
 * the hub stores or shows now goes through here first.
 */
final class SafeErrorText
{
    public static function strip(?string $text): string
    {
        $text = (string) $text;
        if ($text === '') {
            return '';
        }

        // A Graph API address carries the token after "?". Our own links
        // (a dry run's "would have posted" note names the menu link with
        // its tracking tag) are left alone.
        $text = (string) preg_replace('#(https?://graph\.facebook\.com/[^\s?"\']+)\?[^\s"\']*#i', '$1?[redacted]', $text);

        // A Telegram bot address carries the bot token in its path.
        $text = (string) preg_replace('#/bot\d+:[A-Za-z0-9_\-]+#', '/bot[redacted]', $text);

        // Belt and braces for a secret that appears outside an address.
        $text = (string) preg_replace('/\b(access_token|client_secret|fb_exchange_token|code|input_token)=[^\s&"\']+/i', '$1=[redacted]', $text);
        $text = (string) preg_replace('/\bEAA[A-Za-z0-9]{20,}/', '[redacted token]', $text);

        return $text;
    }
}
