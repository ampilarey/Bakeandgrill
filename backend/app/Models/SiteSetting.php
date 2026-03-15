<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Cache;

class SiteSetting extends Model
{
    protected $fillable = ['key', 'value', 'type', 'group', 'label', 'description', 'is_public'];

    protected $casts = [
        'is_public' => 'boolean',
    ];

    public static function get(string $key, mixed $default = null): mixed
    {
        return Cache::rememberForever("site_setting.{$key}", function () use ($key, $default) {
            $setting = static::where('key', $key)->first();
            return $setting ? $setting->value : $default;
        });
    }

    public static function set(string $key, mixed $value): void
    {
        static::where('key', $key)->update(['value' => $value]);
        Cache::forget("site_setting.{$key}");
        Cache::forget('site_settings.public');
        Cache::forget('site_settings.all');
    }

    public static function getGroup(string $group): Collection
    {
        return static::where('group', $group)->orderBy('id')->get();
    }

    public static function allPublic(): array
    {
        return Cache::rememberForever('site_settings.public', function () {
            return static::where('is_public', true)->pluck('value', 'key')->toArray();
        });
    }

    public static function bust(): void
    {
        Cache::forget('site_settings.public');
        Cache::forget('site_settings.all');
    }
}
