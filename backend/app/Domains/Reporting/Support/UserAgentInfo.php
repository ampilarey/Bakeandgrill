<?php

declare(strict_types=1);

namespace App\Domains\Reporting\Support;

/**
 * Device, browser and system from a user agent, for the visitor report.
 * Only these three words are kept; the user agent itself is not stored.
 * In-app browsers (Facebook, Instagram, Viber…) are named as such, since
 * they say where the visitor tapped the link.
 */
final class UserAgentInfo
{
    /** @return array{device: string, browser: string, os: string} */
    public static function parse(string $ua): array
    {
        return ['device' => self::device($ua), 'browser' => self::browser($ua), 'os' => self::os($ua)];
    }

    public static function device(string $ua): string
    {
        if (preg_match('/iPad|Tablet|PlayBook|Silk|Kindle/i', $ua) || (stripos($ua, 'Android') !== false && stripos($ua, 'Mobile') === false)) {
            return 'tablet';
        }
        if (preg_match('/Mobi|iPhone|iPod|Android|Windows Phone/i', $ua)) {
            return 'mobile';
        }

        return 'desktop';
    }

    public static function browser(string $ua): string
    {
        $rules = [
            '/FBAN|FBAV|FB_IAB/' => 'Facebook app',
            '/Instagram/' => 'Instagram app',
            '/Viber/i' => 'Viber app',
            '/WhatsApp/i' => 'WhatsApp',
            '/TikTok|musical_ly|BytedanceWebview/i' => 'TikTok app',
            '/Snapchat/i' => 'Snapchat app',
            '/Telegram/i' => 'Telegram app',
            '/Line\//' => 'LINE app',
            '/SamsungBrowser/' => 'Samsung Internet',
            '/Edg(e|A|iOS)?\//' => 'Edge',
            '/OPR\/|Opera/' => 'Opera',
            '/YaBrowser/' => 'Yandex',
            '/UCBrowser/' => 'UC Browser',
            '/Firefox|FxiOS/' => 'Firefox',
            '/CriOS|Chrome|Chromium/' => 'Chrome',
            '/Safari/' => 'Safari',
        ];
        foreach ($rules as $pattern => $name) {
            if (preg_match($pattern, $ua)) {
                return $name;
            }
        }

        return 'Other';
    }

    public static function os(string $ua): string
    {
        return match (true) {
            (bool) preg_match('/iPhone|iPad|iPod/', $ua) => 'iOS',
            stripos($ua, 'Android') !== false => 'Android',
            stripos($ua, 'Windows') !== false => 'Windows',
            stripos($ua, 'CrOS') !== false => 'ChromeOS',
            (bool) preg_match('/Macintosh|Mac OS X/', $ua) => 'macOS',
            stripos($ua, 'Linux') !== false => 'Linux',
            default => 'Other',
        };
    }

    /** Crawlers, previews, monitors and scripts: not people. */
    public static function looksLikeBot(string $ua): bool
    {
        if (trim($ua) === '') {
            return true;
        }

        // A link preview fetcher such as "WhatsApp/2.23 A" carries no browser name at all.
        if (preg_match('/^(WhatsApp|Viber|TelegramBot|Slack|Discord)/i', $ua)) {
            return true;
        }

        return (bool) preg_match('/bot|crawl|spider|slurp|preview|curl|wget|python|go-http|java\/|okhttp|axios|node-fetch|headless|lighthouse|pingdom|uptime|monitor|facebookexternalhit|embedly|bitlybot|scrapy|httpclient|phantomjs|selenium|puppeteer|playwright/i', $ua);
    }
}
