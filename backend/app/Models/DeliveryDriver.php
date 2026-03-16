<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Auth\Authenticatable;
use Illuminate\Contracts\Auth\Authenticatable as AuthenticatableContract;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Laravel\Sanctum\HasApiTokens;

class DeliveryDriver extends Model implements AuthenticatableContract
{
    use Authenticatable, HasApiTokens;

    protected $fillable = [
        'name',
        'phone',
        'is_active',
        'pin',
        'vehicle_type',
        'last_login_at',
    ];

    protected $casts = [
        'is_active'     => 'boolean',
        'last_login_at' => 'datetime',
    ];

    /** Never expose the hashed PIN in API responses. */
    protected $hidden = ['pin'];

    public function orders(): HasMany
    {
        return $this->hasMany(Order::class, 'delivery_driver_id');
    }

    public function locations(): HasMany
    {
        return $this->hasMany(DriverLocation::class, 'delivery_driver_id');
    }

    public function latestLocation(): HasOne
    {
        return $this->hasOne(DriverLocation::class, 'delivery_driver_id')
            ->latestOfMany('recorded_at');
    }
}
