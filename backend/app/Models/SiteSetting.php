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
    protected $fillable = ['key', 'scope', 'locale', 'value', 'type', 'group', 'label', 'description', 'is_public'];

    protected $casts = [
        'is_public' => 'boolean',
    ];

    /**
     * Back-compat: always returns the shared/en value (or default).
     */
    public static function get(string $key, mixed $default = null): mixed
    {
        $value = self::getScoped($key, 'shared', 'en');

        return ($value !== null && $value !== '') ? $value : $default;
    }

    /**
     * Read a single scoped (+locale) row value (null if missing / empty).
     */
    public static function getScoped(string $key, string $scope = 'shared', string $locale = 'en'): mixed
    {
        $cacheKey = self::cacheKeyFor($key, $scope, $locale);

        $value = Cache::rememberForever($cacheKey, function () use ($key, $scope, $locale) {
            $query = static::query()->where('key', $key);
            if (self::hasScopeColumn()) {
                $query->where('scope', $scope);
            }
            if (self::hasLocaleColumn()) {
                $query->where('locale', $locale);
            }

            return $query->value('value');
        });

        return $value;
    }

    /**
     * Save a setting value for a scope (+locale).
     */
    public static function set(string $key, mixed $value, string $scope = 'shared', string $locale = 'en'): void
    {
        $attrs = ['key' => $key];
        if (self::hasScopeColumn()) {
            $attrs['scope'] = $scope;
        }
        if (self::hasLocaleColumn()) {
            $attrs['locale'] = $locale;
        }

        $row = static::firstOrNew($attrs);

        $row->value = is_array($value) || is_object($value)
            ? json_encode($value, JSON_UNESCAPED_UNICODE)
            : $value;

        if (self::hasScopeColumn() && !$row->exists) {
            $row->scope = $scope;
        }
        if (self::hasLocaleColumn() && !$row->exists) {
            $row->locale = $locale;
        }

        if (!$row->exists) {
            $row->type = $row->type ?? 'text';
            $row->group = $row->group ?? 'System';
            $row->label = $row->label ?? $key;
            $row->is_public = $row->is_public ?? false;
        }

        $row->save();

        Cache::forget(self::cacheKeyFor($key, $scope, $locale));
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
        if (self::hasLocaleColumn()) {
            $query->where('locale', 'en');
        }

        return $query->orderBy('id')->get();
    }

    /**
     * @return array<string, mixed>
     */
    public static function allPublic(): array
    {
        return Cache::rememberForever('site_settings.public', function () {
            if (class_exists(ContentResolver::class) && self::hasScopeColumn()) {
                return ContentResolver::for('order_app', 'en')->allPublic();
            }

            return static::where('is_public', true)->pluck('value', 'key')->toArray();
        });
    }

    public static function bust(): void
    {
        Cache::forget('site_settings.public');
        Cache::forget('site_settings.all');
        ContentResolver::bust();
    }

    public static function hasScopeColumn(): bool
    {
        static $has = null;
        if ($has === null) {
            $has = Schema::hasColumn((new static)->getTable(), 'scope');
        }

        return $has;
    }

    public static function hasLocaleColumn(): bool
    {
        static $has = null;
        if ($has === null) {
            $has = Schema::hasColumn((new static)->getTable(), 'locale');
        }

        return $has;
    }

    private static function cacheKeyFor(string $key, string $scope, string $locale): string
    {
        if ($locale === 'en' && $scope === 'shared') {
            return "site_setting.{$key}";
        }

        return "site_setting.{$key}.{$scope}.{$locale}";
    }
}
