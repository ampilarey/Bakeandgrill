<?php

declare(strict_types=1);

namespace App\Domains\Content;

use App\Models\SiteSetting;
use Illuminate\Support\Facades\Cache;

/**
 * Resolves content per app: app override → shared → registry default.
 */
final class ContentResolver
{
    public function __construct(
        private readonly string $app,
    ) {
        if (!in_array($app, ContentRegistry::APPS, true)) {
            throw new \InvalidArgumentException("Unknown content app [{$app}].");
        }
    }

    public static function for(string $app): self
    {
        return new self($app);
    }

    public function app(): string
    {
        return $this->app;
    }

    public function get(string $key, mixed $default = null): mixed
    {
        if (!ContentRegistry::has($key)) {
            // Unknown key — fall back to shared SiteSetting then caller default.
            $shared = SiteSetting::getScoped($key, 'shared');

            return ($shared !== null && $shared !== '') ? $shared : $default;
        }

        if (!ContentRegistry::targetsApp($key, $this->app)) {
            return $default ?? ContentRegistry::default($key);
        }

        $override = SiteSetting::getScoped($key, $this->app);
        if ($override !== null && $override !== '') {
            return $override;
        }

        $shared = SiteSetting::getScoped($key, 'shared');
        if ($shared !== null && $shared !== '') {
            return $shared;
        }

        $registryDefault = ContentRegistry::default($key);
        if ($registryDefault !== null) {
            return $registryDefault;
        }

        return $default;
    }

    public function json(string $key, mixed $default = null): mixed
    {
        $raw = $this->get($key, $default);
        if (is_array($raw) || is_object($raw)) {
            return $raw;
        }
        if (! is_string($raw) || $raw === '') {
            return $default;
        }
        $decoded = json_decode($raw, true);

        return json_last_error() === JSON_ERROR_NONE ? $decoded : $default;
    }

    /**
     * Resolved public map for this app (registry-ordered).
     *
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
                if (! ContentRegistry::targetsApp((string) $key, $this->app)) {
                    continue;
                }
                $value = $this->get((string) $key, $block['default'] ?? '');
                $out[(string) $key] = is_bool($value) ? ($value ? 'true' : 'false') : (string) $value;
            }

            return $out;
        });
    }

    /**
     * Full resolved map (including non-public) for admin / Blade.
     *
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
            Cache::forget("content.resolved.{$app}");
        }
    }

    private function cacheKey(): string
    {
        return "content.resolved.{$this->app}";
    }
}
