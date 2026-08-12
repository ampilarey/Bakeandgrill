<?php

declare(strict_types=1);

namespace App\Domains\Content\Blocks;

use App\Models\Media;
use App\Support\ContentSanitizer;

/**
 * Shared logic for the free-form content blocks (text, image, video, …).
 *
 * Both renderers lean on this: Blade partials call it directly, the JSON API
 * calls it so the order app never has to know how media ids resolve.
 */
final class GenericBlockPresenter
{
    /** @var list<string> */
    public const TYPES = [
        'rich_text',
        'image',
        'image_text',
        'button_band',
        'divider',
        'video',
        'faq_list',
    ];

    // faq_list remains generic on both apps.

    /** Fields sanitised as rich text (an allow-list of markup survives). */
    private const RICH_FIELDS = ['body', 'text'];

    /** Fields flattened to plain text — markup here is always a mistake. */
    private const PLAIN_FIELDS = [
        'heading',
        'caption',
        'alt',
        'button1_label',
        'button2_label',
    ];

    private const URL_FIELDS = ['button1_url', 'button2_url'];

    public static function isGeneric(string $type): bool
    {
        return in_array($type, self::TYPES, true);
    }

    /**
     * True when the block would render an empty shell — nothing to show, so
     * the renderers skip it entirely rather than leaving a gap on the page.
     *
     * @param  array<string, mixed>  $settings
     */
    public static function isEmpty(string $type, array $settings): bool
    {
        $text = static fn (string $key): string => trim(strip_tags((string) ($settings[$key] ?? '')));

        return match ($type) {
            'rich_text' => $text('heading') === '' && $text('body') === '',
            // Treat missing/deleted media as empty so the home walker does not
            // emit an empty data-home-block wrapper.
            'image' => self::resolveImage(self::mediaId($settings)) === null,
            'video' => self::resolveVideo(self::mediaId($settings)) === null,
            'image_text' => self::resolveImage(self::mediaId($settings)) === null
                && $text('heading') === ''
                && $text('body') === '',
            'button_band' => $text('text') === ''
                && $text('button1_label') === ''
                && $text('button2_label') === '',
            // A divider is pure spacing: there is no content to be missing.
            'divider' => false,
            'faq_list' => self::faqItems($settings) === [],
            default => false,
        };
    }

    /**
     * @return array{url: string, webp: ?string, thumb: ?string, thumb_webp: ?string, alt: string, width: ?int, height: ?int}|null
     */
    public static function resolveImage(?int $mediaId): ?array
    {
        if ($mediaId === null) {
            return null;
        }

        $media = Media::query()->find($mediaId);
        if ($media === null || $media->media_type !== 'image') {
            return null;
        }

        $url = (string) $media->url;
        if ($url === '') {
            return null;
        }

        return [
            'url' => $url,
            'webp' => self::nullableString($media->image_webp_url),
            'thumb' => self::nullableString($media->thumb_url),
            'thumb_webp' => self::nullableString($media->thumb_webp_url),
            'alt' => (string) ($media->alt_text ?? ''),
            'width' => $media->width !== null ? (int) $media->width : null,
            'height' => $media->height !== null ? (int) $media->height : null,
        ];
    }

    /**
     * @return array{url: string, poster_url: ?string, alt: string}|null
     */
    public static function resolveVideo(?int $mediaId): ?array
    {
        if ($mediaId === null) {
            return null;
        }

        $media = Media::query()->find($mediaId);
        if ($media === null || $media->media_type !== 'video') {
            return null;
        }

        $url = (string) $media->url;
        if ($url === '') {
            return null;
        }

        return [
            'url' => $url,
            'poster_url' => self::nullableString($media->thumb_url),
            'alt' => (string) ($media->alt_text ?? $media->title ?? ''),
        ];
    }

    /**
     * Strip anything dangerous out of owner-entered settings.
     * Rich fields keep a small allow-list of markup; everything else is
     * flattened to plain text so it can only ever be escaped output.
     *
     * @param  array<string, mixed>  $settings
     * @return array<string, mixed>
     */
    public static function sanitizeSettings(string $type, array $settings): array
    {
        if (! self::isGeneric($type)) {
            return $settings;
        }

        foreach (self::RICH_FIELDS as $field) {
            if (array_key_exists($field, $settings)) {
                $settings[$field] = ContentSanitizer::clean(self::asString($settings[$field]));
            }
        }

        foreach (self::PLAIN_FIELDS as $field) {
            if (array_key_exists($field, $settings)) {
                $settings[$field] = self::plain($settings[$field]);
            }
        }

        foreach (self::URL_FIELDS as $field) {
            if (array_key_exists($field, $settings)) {
                $settings[$field] = self::safeUrl(self::asString($settings[$field]));
            }
        }

        if ($type === 'faq_list' && isset($settings['items']) && is_array($settings['items'])) {
            $settings['items'] = array_values(array_map(static function ($row): array {
                $row = is_array($row) ? $row : [];

                return [
                    'question' => self::plain($row['question'] ?? ''),
                    'answer' => ContentSanitizer::clean(self::asString($row['answer'] ?? '')),
                ];
            }, $settings['items']));
        }

        return $settings;
    }

    /**
     * Media resolved for JSON consumers (the order app cannot look up ids).
     *
     * @param  array<string, mixed>  $settings
     * @return array<string, mixed>|null
     */
    public static function resolveMedia(string $type, array $settings): ?array
    {
        return match ($type) {
            'image', 'image_text' => ['image' => self::resolveImage(self::mediaId($settings))],
            'video' => ['video' => self::resolveVideo(self::mediaId($settings))],
            default => null,
        };
    }

    /**
     * @param  array<string, mixed>  $settings
     * @return list<array{question: string, answer: string}>
     */
    public static function faqItems(array $settings): array
    {
        $items = $settings['items'] ?? [];
        if (! is_array($items)) {
            return [];
        }

        $clean = [];
        foreach ($items as $row) {
            if (! is_array($row)) {
                continue;
            }
            $question = self::plain($row['question'] ?? '');
            $answer = self::asString($row['answer'] ?? '');
            if ($question === '' && trim(strip_tags($answer)) === '') {
                continue;
            }
            $clean[] = ['question' => $question, 'answer' => $answer];
        }

        return $clean;
    }

    /** @param  array<string, mixed>  $settings */
    public static function mediaId(array $settings): ?int
    {
        $raw = $settings['media_id'] ?? null;
        if ($raw === null || $raw === '' || ! is_numeric($raw)) {
            return null;
        }

        $id = (int) $raw;

        return $id > 0 ? $id : null;
    }

    /** Only safe public URLs survive. */
    public static function safeUrl(string $url): string
    {
        return safe_public_url($url) ?? '';
    }

    private static function plain(mixed $value): string
    {
        return trim(strip_tags(self::asString($value)));
    }

    private static function asString(mixed $value): string
    {
        return is_scalar($value) ? (string) $value : '';
    }

    private static function nullableString(mixed $value): ?string
    {
        $str = self::asString($value);

        return $str === '' ? null : $str;
    }
}
