<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Laravel\Sanctum\HasApiTokens;

class Customer extends Model
{
    use HasApiTokens, SoftDeletes;
    protected $fillable = [
        'name',
        'phone',
        'email',
        'loyalty_points',
        'tier',
        'preferences',
        'preferred_language',
        'is_active',
        'last_login_at',
        'last_order_at',
    ];

    protected $casts = [
        'last_login_at' => 'datetime',
        'last_order_at' => 'datetime',
        'preferences' => 'array',
    ];

    public function orders(): HasMany
    {
        return $this->hasMany(Order::class);
    }

    public function receipts(): HasMany
    {
        return $this->hasMany(Receipt::class);
    }
}
