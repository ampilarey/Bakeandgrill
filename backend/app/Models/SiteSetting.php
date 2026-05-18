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
        // Cache the raw DB value only — never cache the caller's default,
        // so different callers can supply different fallbacks for the same key.
        $value = Cache::rememberForever("site_setting.{$key}", function () use ($key) {
            return static::where('key', $key)->value('value');
        });

        // Treat null or empty-string DB values as "not set" and fall back to default.
        return ($value !== null && $value !== '') ? $value : $default;
    }

    /**
     * Save a setting value.
     *
     * Critical behaviour: type / group / label / is_public are SEEDED metadata
     * that the admin UI relies on to render the right editor (JSON vs image vs
     * color picker), keep settings in the correct tab, and expose public-only
     * keys without auth. They must NOT be clobbered on update.
     *
     * Pre-fix `updateOrCreate` re-applied {type:'text', group:'System',
     * label:$key, is_public:false} to every existing row on every save —
     * meaning a single PUT /api/site-settings would silently downgrade every
     * hero/category JSON to plain text and flip every public key to private,
     * breaking the public website until the seeder was re-run.
     */
    public static function set(string $key, mixed $value): void
    {
        $row = static::firstOrNew(['key' => $key]);

        $row->value = is_array($value) || is_object($value)
            ? json_encode($value, JSON_UNESCAPED_UNICODE)
            : $value;

        // Only set metadata fields when the row is brand new — otherwise
        // we'd overwrite seeded type/group/label/is_public.
        if (!$row->exists) {
            $row->type = $row->type ?? 'text';
            $row->group = $row->group ?? 'System';
            $row->label = $row->label ?? $key;
            $row->is_public = $row->is_public ?? false;
        }

        $row->save();

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
