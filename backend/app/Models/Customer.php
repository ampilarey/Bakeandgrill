<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Auth\Authenticatable;
use Illuminate\Contracts\Auth\Authenticatable as AuthenticatableContract;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Laravel\Sanctum\HasApiTokens;

class Customer extends Model implements AuthenticatableContract
{
    use Authenticatable, HasApiTokens, SoftDeletes;
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
        'sms_opt_out',
        'sms_opt_out_at',
        'internal_notes',
        // Delivery address fields
        'delivery_address',
        'delivery_area',
        'delivery_building',
        'delivery_floor',
        'delivery_notes',
    ];

    protected $casts = [
        'loyalty_points' => 'integer',
        'is_active'      => 'boolean',
        'last_login_at'  => 'datetime',
        'last_order_at'  => 'datetime',
        'preferences'    => 'array',
        'sms_opt_out'    => 'boolean',
        'sms_opt_out_at' => 'datetime',
    ];

    public function orders(): HasMany
    {
        return $this->hasMany(Order::class);
    }

    public function receipts(): HasMany
    {
        return $this->hasMany(Receipt::class);
    }

    public function smsPromotions(): HasMany
    {
        return $this->hasMany(SmsPromotionRecipient::class);
    }

    public function loyaltyAccount(): \Illuminate\Database\Eloquent\Relations\HasOne
    {
        return $this->hasOne(LoyaltyAccount::class);
    }

    public function smsLogs(): HasMany
    {
        return $this->hasMany(SmsLog::class);
    }
}
