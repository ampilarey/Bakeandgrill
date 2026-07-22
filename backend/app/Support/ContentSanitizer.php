<?php

declare(strict_types=1);

namespace App\Support;

/**
 * Allow-list HTML sanitiser for rich content blocks.
 */
final class ContentSanitizer
{
    /** @var list<string> */
    private const ALLOWED_TAGS = ['br', 'em', 'strong', 'a', 'p', 'ul', 'ol', 'li'];

    public static function clean(?string $html): string
    {
        if ($html === null || $html === '') {
            return '';
        }

        // Strip scripts / event handlers before tag allow-list.
        $html = preg_replace('#<script\b[^>]*>.*?</script>#is', '', $html) ?? '';
        $html = preg_replace('#<style\b[^>]*>.*?</style>#is', '', $html) ?? '';
        $html = preg_replace('/\son\w+\s*=\s*(["\']).*?\1/iu', '', $html) ?? '';
        $html = preg_replace('/\son\w+\s*=\s*[^\s>]+/iu', '', $html) ?? '';
        $html = preg_replace('/javascript\s*:/iu', '', $html) ?? '';

        $allowed = '<' . implode('><', self::ALLOWED_TAGS) . '>';
        $clean = strip_tags($html, $allowed);

        // Restrict <a> to http(s)/mailto/relative and drop other attributes.
        $clean = preg_replace_callback(
            '#<a\s+([^>]*?)>#iu',
            static function (array $m): string {
                $attrs = $m[1];
                $href = '';
                if (preg_match('/href\s*=\s*(["\'])(.*?)\1/iu', $attrs, $hm)) {
                    $href = trim($hm[2]);
                } elseif (preg_match('/href\s*=\s*([^\s>]+)/iu', $attrs, $hm)) {
                    $href = trim($hm[1]);
                }
                if ($href === '' || preg_match('~^(https?:|mailto:|/|#)~i', $href) !== 1) {
                    return '<a>';
                }

                return '<a href="' . htmlspecialchars($href, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') . '">';
            },
            $clean,
        ) ?? $clean;

        return $clean;
    }
}
