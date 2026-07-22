<?php

declare(strict_types=1);

namespace App\Models;

use App\Domains\Content\ContentResolver;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Schema;

class SiteSetting extends Model
{
    protected $fillable = ['key', 'scope', 'value', 'type', 'group', 'label', 'description', 'is_public'];

    protected $casts = [
        'is_public' => 'boolean',
    ];

    /**
     * Back-compat: always returns the shared-scope value (or default).
     */
    public static function get(string $key, mixed $default = null): mixed
    {
        $value = self::getScoped($key, 'shared');

        return ($value !== null && $value !== '') ? $value : $default;
    }

    /**
     * Read a single scoped row value (null if missing / empty).
     */
    public static function getScoped(string $key, string $scope = 'shared'): mixed
    {
        $cacheKey = self::cacheKeyFor($key, $scope);

        $value = Cache::rememberForever($cacheKey, function () use ($key, $scope) {
            $query = static::query()->where('key', $key);
            if (self::hasScopeColumn()) {
                $query->where('scope', $scope);
            }

            return $query->value('value');
        });

        return $value;
    }

    /**
     * Save a setting value for a scope (default shared — back-compat).
     */
    public static function set(string $key, mixed $value, string $scope = 'shared'): void
    {
        $attrs = ['key' => $key];
        if (self::hasScopeColumn()) {
            $attrs['scope'] = $scope;
        }

        $row = static::firstOrNew($attrs);

        $row->value = is_array($value) || is_object($value)
            ? json_encode($value, JSON_UNESCAPED_UNICODE)
            : $value;

        if (self::hasScopeColumn() && !$row->exists) {
            $row->scope = $scope;
        }

        // Only set metadata fields when the row is brand new — otherwise
        // we'd overwrite seeded type/group/label/is_public.
        if (!$row->exists) {
            $row->type = $row->type ?? 'text';
            $row->group = $row->group ?? 'System';
            $row->label = $row->label ?? $key;
            $row->is_public = $row->is_public ?? false;
        }

        $row->save();

        Cache::forget(self::cacheKeyFor($key, $scope));
        // Legacy shared cache key
        Cache::forget("site_setting.{$key}");
        Cache::forget('site_settings.public');
        Cache::forget('site_settings.all');
        ContentResolver::bust();
    }

    public static function getGroup(string $group): Collection
    {
        $query = static::where('group', $group);
        if (self::hasScopeColumn()) {
            $query->where('scope', 'shared');
        }

        return $query->orderBy('id')->get();
    }

    /**
     * Public map for the order app (resolved: override → shared → default).
     * Keeps /site-settings/public working for the deployed bundle.
     *
     * @return array<string, mixed>
     */
    public static function allPublic(): array
    {
        return Cache::rememberForever('site_settings.public', function () {
            if (class_exists(ContentResolver::class) && self::hasScopeColumn()) {
                return ContentResolver::for('order_app')->allPublic();
            }

            return static::where('is_public', true)->pluck('value', 'key')->toArray();
        });
    }

    public static function bust(): void
    {
        Cache::forget('site_settings.public');
        Cache::forget('site_settings.all');
        foreach (['website', 'order_app'] as $app) {
            Cache::forget("content.resolved.{$app}");
        }
    }

    public static function hasScopeColumn(): bool
    {
        static $has = null;
        if ($has === null) {
            $has = Schema::hasColumn((new static)->getTable(), 'scope');
        }

        return $has;
    }

    private static function cacheKeyFor(string $key, string $scope): string
    {
        return $scope === 'shared'
            ? "site_setting.{$key}"
            : "site_setting.{$key}.{$scope}";
    }
}
