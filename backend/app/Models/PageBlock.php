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

    /** @deprecated Shared mode is retired — every customer-facing block is own. */
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

    /**
     * Legacy relation retained for rollback safety only. Runtime never uses it
     * for customer-facing rendering after materialization.
     */
    public function sharedContent(): BelongsTo
    {
        return $this->belongsTo(PageBlockSharedContent::class, 'shared_content_id');
    }

    /**
     * @return array<string, mixed>
     */
    public function resolvedSettings(): array
    {
        return is_array($this->settings) ? $this->settings : [];
    }

    public function isSharedMode(): bool
    {
        return false;
    }
}
