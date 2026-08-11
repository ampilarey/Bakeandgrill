<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PageBlock extends Model
{
    public const APP_WEBSITE = 'website';

    public const APP_ORDER = 'order_app';

    public const PAGE_HOME = 'home';

    public const MODE_SHARED = 'shared';

    public const MODE_OWN = 'own';

    protected $fillable = [
        'app',
        'page',
        'block_type',
        'position',
        'is_enabled',
        'content_mode',
        'shared_content_id',
        'settings',
    ];

    protected $casts = [
        'position' => 'integer',
        'is_enabled' => 'boolean',
        'shared_content_id' => 'integer',
        'settings' => 'array',
    ];

    public function sharedContent(): BelongsTo
    {
        return $this->belongsTo(PageBlockSharedContent::class, 'shared_content_id');
    }

    /**
     * @return array<string, mixed>
     */
    public function resolvedSettings(): array
    {
        if ($this->shared_content_id !== null) {
            $shared = $this->relationLoaded('sharedContent')
                ? $this->sharedContent
                : $this->sharedContent()->first();

            if ($shared instanceof PageBlockSharedContent && is_array($shared->settings)) {
                return $shared->settings;
            }
        }

        return is_array($this->settings) ? $this->settings : [];
    }

    public function isSharedMode(): bool
    {
        return $this->content_mode === self::MODE_SHARED;
    }
}
