<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PromotionTarget extends Model
{
    public const ROLE_TRIGGER = 'trigger';

    public const ROLE_REWARD = 'reward';

    protected $fillable = [
        'promotion_id',
        'target_type',
        'target_id',
        'is_exclusion',
        'role',
        'metadata',
    ];

    protected $casts = [
        'is_exclusion' => 'boolean',
        'metadata' => 'array',
    ];

    public function promotion(): BelongsTo
    {
        return $this->belongsTo(Promotion::class);
    }

    /**
     * null/absent means reward — every legacy target row behaves as today.
     */
    public function isTrigger(): bool
    {
        return $this->role === self::ROLE_TRIGGER;
    }

    public function isReward(): bool
    {
        return !$this->isTrigger();
    }

    public function triggerMinQty(): int
    {
        $meta = is_array($this->metadata) ? $this->metadata : [];

        return max(1, (int) ($meta['min_qty'] ?? 1));
    }
}
