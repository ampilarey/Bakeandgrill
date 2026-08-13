<?php

declare(strict_types=1);

namespace App\Domains\Content;

use App\Models\SiteSetting;
use App\Support\ResilientCache;

/**
 * Resolves content per app (+locale):
 * app+locale → app+en → registry default.
 *
 * Shared is not in this chain. Operational callers (invoices, signage, SMS, …)
 * still read SiteSetting::get() → shared; website and order_app do not fall
 * back to shared.
 *
 * Empty-value rule (all keys, including json-type):
 * - `null` or `''` means absent → fall through to the next step in the chain.
 * - Any other stored string is present and wins — including JSON empty arrays
 *   (`"[]"`). An app-scoped empty array is a deliberate “show nothing here”
 *   value, not a missing value. With no shared step in the chain, the old
 *   “[] masks shared items” trap no longer applies to website / order_app.
 */
final class ContentResolver
{
    public function __construct(
        private readonly string $app,
        private readonly string $locale = 'en',
    ) {
        if (!in_array($app, ContentRegistry::APPS, true)) {
            throw new \InvalidArgumentException("Unknown content app [{$app}].");
        }
        if (!in_array($locale, ContentRegistry::LOCALES, true)) {
            throw new \InvalidArgumentException("Unknown content locale [{$locale}].");
        }
    }

    public static function for(string $app, string $locale = 'en'): self
    {
        return new self($app, $locale);
    }

    public function app(): string
    {
        return $this->app;
    }

    public function locale(): string
    {
        return $this->locale;
    }

    public function get(string $key, mixed $default = null): mixed
    {
        if (!ContentRegistry::has($key)) {
            $shared = SiteSetting::getScoped($key, 'shared', $this->locale);
            if ($shared !== null && $shared !== '') {
                return $shared;
            }
            if ($this->locale !== 'en') {
                $sharedEn = SiteSetting::getScoped($key, 'shared', 'en');
                if ($sharedEn !== null && $sharedEn !== '') {
                    return $sharedEn;
                }
            }

            return $default;
        }

        if (!ContentRegistry::targetsApp($key, $this->app)) {
            return $default ?? ContentRegistry::default($key);
        }

        foreach ($this->lookupChain($key) as [$scope, $locale]) {
            $val = SiteSetting::getScoped($key, $scope, $locale);
            // Present = not null and not ''. "[]" and other JSON empties win.
            if ($this->isPresentScopedValue($val)) {
                return $val;
            }
        }

        $registryDefault = ContentRegistry::default($key);
        if ($registryDefault !== null) {
            return $registryDefault;
        }

        return $default;
    }

    /**
     * Whether a scoped row should stop the lookup chain.
     *
     * Only null / empty string fall through. Empty JSON arrays ("[]") are
     * intentional overrides for json-type keys and must not fall through.
     */
    private function isPresentScopedValue(mixed $val): bool
    {
        return $val !== null && $val !== '';
    }

    /**
     * @return list<array{0: string, 1: string}>
     */
    private function lookupChain(string $key = ''): array
    {
        $chain = [
            [$this->app, $this->locale],
        ];
        if ($this->locale !== 'en') {
            $chain[] = [$this->app, 'en'];
        }

        return $chain;
    }

    public function json(string $key, mixed $default = null): mixed
    {
        $raw = $this->get($key, $default);
        if (is_array($raw) || is_object($raw)) {
            return $raw;
        }
        if (!is_string($raw) || $raw === '') {
            return $default;
        }
        $decoded = json_decode($raw, true);

        return json_last_error() === JSON_ERROR_NONE ? $decoded : $default;
    }

    /**
     * @return array<string, mixed>
     */
    public function allPublic(): array
    {
        return ResilientCache::rememberForever($this->cacheKey(), function (): array {
            $out = [];
            foreach (ContentRegistry::blocks() as $key => $block) {
                if (empty($block['public'])) {
                    continue;
                }
                if (!ContentRegistry::targetsApp((string) $key, $this->app)) {
                    continue;
                }
                $value = $this->get((string) $key, $block['default'] ?? '');
                $out[(string) $key] = is_bool($value) ? ($value ? 'true' : 'false') : (string) $value;
            }

            return $out;
        });
    }

    /**
     * @return array<string, mixed>
     */
    public function all(): array
    {
        $out = [];
        foreach (ContentRegistry::blocks() as $key => $block) {
            if (!ContentRegistry::targetsApp((string) $key, $this->app)) {
                continue;
            }
            $out[(string) $key] = $this->get((string) $key);
        }

        return $out;
    }

    public static function bust(): void
    {
        foreach (ContentRegistry::APPS as $app) {
            foreach (ContentRegistry::LOCALES as $locale) {
                ResilientCache::forget("content.resolved.{$app}.{$locale}");
                // Legacy cache key from before locales
                ResilientCache::forget("content.resolved.{$app}");
            }
        }
    }

    private function cacheKey(): string
    {
        return "content.resolved.{$this->app}.{$this->locale}";
    }
}
