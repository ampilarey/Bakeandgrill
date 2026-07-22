<?php

declare(strict_types=1);

namespace App\Domains\Content;

use App\Models\SiteSetting;
use Illuminate\Support\Facades\Cache;

/**
 * Resolves content per app (+locale):
 * app+locale → shared+locale → app+en → shared+en → registry default.
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

        foreach ($this->lookupChain() as [$scope, $locale]) {
            $val = SiteSetting::getScoped($key, $scope, $locale);
            if ($val !== null && $val !== '') {
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
     * @return list<array{0: string, 1: string}>
     */
    private function lookupChain(): array
    {
        $chain = [
            [$this->app, $this->locale],
            ['shared', $this->locale],
        ];
        if ($this->locale !== 'en') {
            $chain[] = [$this->app, 'en'];
            $chain[] = ['shared', 'en'];
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
        return Cache::rememberForever($this->cacheKey(), function (): array {
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
                Cache::forget("content.resolved.{$app}.{$locale}");
                // Legacy cache key from before locales
                Cache::forget("content.resolved.{$app}");
            }
        }
    }

    private function cacheKey(): string
    {
        return "content.resolved.{$this->app}.{$this->locale}";
    }
}
