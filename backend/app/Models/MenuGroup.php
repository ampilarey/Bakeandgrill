<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class MenuGroup extends Model
{
    protected $fillable = ['name', 'slug', 'sort_order', 'is_active', 'goes_to_kitchen'];

    /** New groups go to the kitchen; that is what the column default says too. */
    protected $attributes = ['goes_to_kitchen' => true];

    protected $casts = [
        'is_active' => 'boolean',
        'sort_order' => 'integer',
        'goes_to_kitchen' => 'boolean',
    ];

    /**
     * Ids of the groups sold off the counter — the ones the kitchen does not
     * make. Deliberately the negative list, because it is the only side that
     * somebody has positively said "no" to.
     *
     * Asking "is this a kitchen group?" fails the wrong way: an item pointing
     * at a group that has been deleted, or at no group at all, answers no and
     * the ticket silently never reaches the kitchen. Asking "is this a known
     * counter group?" answers no for exactly the same rows, and no there means
     * cook it. Missing data sends work to the kitchen instead of hiding it.
     *
     * Queried every time, deliberately: a static memo went stale the moment a
     * manager toggled a group, and in a queue worker that could last hours.
     *
     * @return list<int>
     */
    public static function counterGroupIds(): array
    {
        return static::query()->where('goes_to_kitchen', false)->pluck('id')->all();
    }

    public function items(): HasMany
    {
        return $this->hasMany(Item::class, 'menu_group_id');
    }
}
