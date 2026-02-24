<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class RestaurantTable extends Model
{
    protected $fillable = [
        'name',
        'capacity',
        'status',
        'location',
        'notes',
        'is_active',
    ];
}
