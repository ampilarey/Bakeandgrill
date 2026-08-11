<?php

declare(strict_types=1);

namespace App\Domains\Content;

use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\ValidationException;

final class ContentValidationService
{
    /** @var list<string> */
    private const PUBLIC_URL_KEYS = [
        'announcement_url',
        'business_maps_url',
        'business_website',
        'business_whatsapp',
        'business_viber',
        'maps_embed_url',
        'social_instagram',
        'social_facebook',
        'social_tiktok',
    ];

    /**
     * JSON fields that can become public href/src values.
     *
     * @var array<string, list<string>>
     */
    private const JSON_PUBLIC_URL_FIELDS = [
        'footer_links' => ['url'],
        'hero_slides' => ['cta_url', 'cta2_url', 'image', 'image_master', 'video', 'video_poster'],
        'homepage_categories' => ['link', 'image_url'],
    ];

    public function normalizeForWrite(string $key, string $scope, mixed $value): string
    {
        $this->assertScopeAllowed($key, $scope);

        $value = $this->stringify($value);
        $this->validateRegistryRule($key, $value);

        if ($key === 'primary_color') {
            return $this->normalizePrimaryColor($value);
        }

        if ($key === 'hero_slides') {
            return $this->normalizeHeroSlides($value);
        }

        if ($this->isPublicUrlKey($key)) {
            $this->validatePublicUrlValue($value, ContentRegistry::label($key));
        }

        return $this->validateJsonUrlFields($key, $value);
    }

    public function assertScopeAllowed(string $key, string $scope): void
    {
        if (! ContentRegistry::has($key)) {
            $this->fail('key', 'Unknown content key.');
        }

        if (! in_array($scope, ContentRegistry::SCOPES, true)) {
            $this->fail('scope', 'Invalid content scope.');
        }

        // Shared is the seed/default layer for every registry key (ContentResolver
        // falls through to shared). App scopes are the overrides and must target
        // an app the key is registered for. Brand-synced keys may be written to
        // any scope because ContentWriter mirrors them across website/order/shared.
        if ($scope === 'shared' || ContentRegistry::isSyncedAcrossApps($key)) {
            return;
        }

        if (! ContentRegistry::targetsApp($key, $scope)) {
            $this->fail('scope', ContentRegistry::label($key).' is not available for '.$scope.'.');
        }
    }

    public static function safePublicUrl(?string $url): ?string
    {
        $url = trim(preg_replace('/[\x00-\x1F\x7F]/u', '', (string) $url) ?? '');
        if ($url === '') {
            return null;
        }

        if (str_starts_with($url, '//')) {
            return null;
        }

        if (str_starts_with($url, '/')) {
            return $url;
        }

        if (preg_match('~^https?://[^\s]+$~i', $url) === 1) {
            return $url;
        }

        // Chat / contact deep links used by Contact + footer CMS fields.
        if (preg_match('~^(mailto|tel|viber|sms):[^\s]+$~i', $url) === 1) {
            return $url;
        }

        return null;
    }

    private function stringify(mixed $value): string
    {
        if (is_array($value) || is_object($value)) {
            return json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) ?: '';
        }

        return $value === null ? '' : (string) $value;
    }

    private function validateRegistryRule(string $key, string $value): void
    {
        $validator = Validator::make(['value' => $value], ['value' => ContentRegistry::validateRule($key)]);
        if (! $validator->fails()) {
            return;
        }

        foreach ($validator->errors()->all() as $message) {
            $this->fail('value', $message);
        }
    }

    private function normalizePrimaryColor(string $value): string
    {
        $value = trim($value);
        if ($value === '') {
            return '';
        }

        if (preg_match('/^#([0-9a-fA-F]{3})$/', $value, $m) === 1) {
            return '#'.strtoupper($m[1][0].$m[1][0].$m[1][1].$m[1][1].$m[1][2].$m[1][2]);
        }

        if (preg_match('/^#[0-9a-fA-F]{6}$/', $value) === 1) {
            return strtoupper($value);
        }

        $this->fail('value', 'Primary Color must be a hex colour in #RGB or #RRGGBB format.');
    }

    private function normalizeHeroSlides(string $value): string
    {
        $value = trim($value);
        if ($value === '') {
            return '';
        }

        $slides = json_decode($value, true);
        if (! is_array($slides) || ! array_is_list($slides)) {
            $this->fail('value', 'Hero Slides must be a JSON list of slide objects.');
        }

        foreach ($slides as $index => $slide) {
            if (! is_array($slide)) {
                $this->fail('value', 'Hero Slides item '.($index + 1).' must be an object.');
            }

            if (array_key_exists('showing', $slide) && ! is_bool($slide['showing'])) {
                $this->fail('value', 'Hero Slides item '.($index + 1).' showing must be true or false.');
            }

            foreach (self::JSON_PUBLIC_URL_FIELDS['hero_slides'] as $field) {
                if (! array_key_exists($field, $slide)) {
                    continue;
                }

                $raw = $this->stringify($slide[$field]);
                if (trim($raw) === '') {
                    continue;
                }
                $safe = self::safePublicUrl($raw);
                if ($safe === null) {
                    $this->fail('value', 'Hero Slides item '.($index + 1)." {$field} must be a safe public URL.");
                }
                $slides[$index][$field] = $safe;
            }
        }

        return json_encode($slides, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) ?: $value;
    }

    private function validateJsonUrlFields(string $key, string $value): string
    {
        if (! array_key_exists($key, self::JSON_PUBLIC_URL_FIELDS) || trim($value) === '') {
            return $value;
        }

        $decoded = json_decode($value, true);
        if (! is_array($decoded)) {
            return $value;
        }

        $changed = false;
        foreach ($decoded as $index => $row) {
            if (! is_array($row)) {
                continue;
            }
            foreach (self::JSON_PUBLIC_URL_FIELDS[$key] as $field) {
                if (! array_key_exists($field, $row)) {
                    continue;
                }
                $raw = $this->stringify($row[$field]);
                if (trim($raw) === '') {
                    continue;
                }
                $safe = self::safePublicUrl($raw);
                if ($safe === null) {
                    $this->fail('value', ContentRegistry::label($key).' item '.((int) $index + 1)." {$field} must be a safe public URL.");
                }
                if ($safe !== $raw) {
                    $decoded[$index][$field] = $safe;
                    $changed = true;
                }
            }
        }

        return $changed
            ? (json_encode($decoded, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) ?: $value)
            : $value;
    }

    private function isPublicUrlKey(string $key): bool
    {
        return in_array($key, self::PUBLIC_URL_KEYS, true)
            || str_ends_with($key, '_url');
    }

    private function validatePublicUrlValue(string $value, string $label): void
    {
        if (trim($value) === '') {
            return;
        }

        if (self::safePublicUrl($value) === null) {
            $this->fail('value', "{$label} must be a safe public URL.");
        }
    }

    private function fail(string $field, string $message): never
    {
        throw ValidationException::withMessages([$field => [$message]]);
    }
}
