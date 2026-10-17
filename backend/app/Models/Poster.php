<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class Poster extends Model
{
    /** Where a printed poster can stand. A list, not free text (docs/POSTER_PLAN.md § 5.2). */
    public const PLACES = ['Window', 'Door', 'Counter', 'Tables', 'Kitchen', 'Outside'];

    public const STATES = ['draft', 'ready', 'up', 'down'];

    protected $fillable = [
        'name', 'template_key', 'layout', 'mood', 'language', 'landscape',
        'sizes', 'slots', 'bindings', 'state', 'take_down_on', 'place',
        'pinned', 'version', 'created_by',
    ];

    protected $casts = [
        'landscape' => 'boolean',
        'sizes' => 'array',
        'slots' => 'array',
        'bindings' => 'array',
        'pinned' => 'boolean',
        'take_down_on' => 'date',
        'version' => 'integer',
    ];

    public function exports(): HasMany
    {
        return $this->hasMany(PosterExport::class);
    }

    public function latestReady(): HasOne
    {
        return $this->hasOne(PosterExport::class)->ofMany(
            ['id' => 'max'],
            fn ($query) => $query->where('status', 'ready'),
        );
    }

    public function latestOrder(): HasOne
    {
        return $this->hasOne(PosterOrder::class)->latestOfMany();
    }

    public function orders(): HasMany
    {
        return $this->hasMany(PosterOrder::class);
    }

    public function author(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function scans(): HasMany
    {
        return $this->hasMany(PosterScan::class);
    }

    public function code(): string
    {
        return self::codeFor((int) $this->id);
    }

    public static function codeFor(int $id): string
    {
        return 'P' . str_pad((string) $id, 4, '0', STR_PAD_LEFT);
    }

    public static function idFromCode(string $code): ?int
    {
        if (!preg_match('/^P(\d{4,8})$/', strtoupper(trim($code)), $match)) {
            return null;
        }
        $id = (int) $match[1];

        return $id > 0 ? $id : null;
    }

    /** Past its take-down date and not marked down. */
    public function shouldBeDown(): bool
    {
        return $this->take_down_on !== null
            && $this->take_down_on->toDateString() < now()->toDateString()
            && $this->state !== 'down';
    }
}
