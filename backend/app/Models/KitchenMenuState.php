<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * Singleton row (id=1): which menu groups are "on duty" for chef-specific menus.
 */
class KitchenMenuState extends Model
{
    protected $table = 'kitchen_menu_state';

    protected $fillable = ['active_menu_group_ids'];

    protected $casts = [
        'active_menu_group_ids' => 'array',
    ];

    public static function current(): self
    {
        return static::firstOrCreate(['id' => 1], ['active_menu_group_ids' => [1]]);
    }
}
