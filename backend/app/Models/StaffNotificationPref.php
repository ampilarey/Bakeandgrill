<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class StaffNotificationPref extends Model
{
    protected $fillable = [
        'user_id',
        'notifications_enabled',
        'order_types',
        'menu_group_ids',
        'category_ids',
        'is_fallback',
        'fallback_priority',
    ];

    protected function casts(): array
    {
        return [
            'notifications_enabled' => 'boolean',
            'order_types' => 'array',
            'menu_group_ids' => 'array',
            'category_ids' => 'array',
            'is_fallback' => 'boolean',
            'fallback_priority' => 'integer',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /**
     * Returns true if this staff member should receive notifications for the given order type.
     * A null order_types array means "receive all".
     */
    public function acceptsOrderType(string $orderType): bool
    {
        if (! $this->notifications_enabled) {
            return false;
        }

        if ($this->order_types === null || empty($this->order_types)) {
            return true;
        }

        return in_array($orderType, $this->order_types, true);
    }

    /**
     * Returns true if this staff member should receive notifications for the given menu group IDs.
     * A null/empty menu_group_ids means "receive all stations".
     */
    public function acceptsMenuGroups(array $menuGroupIds): bool
    {
        if ($this->menu_group_ids === null || empty($this->menu_group_ids)) {
            return true;
        }

        return ! empty(array_intersect($this->menu_group_ids, $menuGroupIds));
    }
}
