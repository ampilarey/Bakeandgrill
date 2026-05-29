<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class LoyaltyTier extends Model
{
    protected $fillable = [
        'name',
        'slug',
        'min_lifetime_points',
        'earn_multiplier',
        'sort_order',
    ];

    protected $casts = [
        'min_lifetime_points' => 'integer',
        'earn_multiplier' => 'float',
        'sort_order' => 'integer',
    ];
}
