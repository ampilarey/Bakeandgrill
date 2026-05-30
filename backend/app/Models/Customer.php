<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Auth\Authenticatable;
use Illuminate\Contracts\Auth\Authenticatable as AuthenticatableContract;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Laravel\Sanctum\HasApiTokens;

class Customer extends Model implements AuthenticatableContract
{
    use Authenticatable, HasApiTokens, HasFactory, SoftDeletes;

    protected $fillable = [
        'name',
        'phone',
        'email',
        'tin',
        'is_gst_registered',
        'billing_address',
        'date_of_birth',
        // 'password' is intentionally excluded from $fillable to prevent mass-assignment.
        // Set it explicitly: $customer->password = $plain; $customer->save();
        // The 'hashed' cast (below) handles bcrypt automatically.
        'is_profile_complete',
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
        'credit_enabled',
        'credit_approved_by',
        'credit_approved_at',
        'credit_limit_laar',
        'credit_balance_laar',
        'credit_status',
        'credit_notes',
        'credit_payment_terms_days',
        'credit_reminder_sms',
    ];

    /**
     * Hide staff-only / sensitive fields from any `toArray()` / `toJson()`
     * serialization. Customer-facing endpoints should be receiving DTOs
     * anyway, but this is a belt-and-braces defense — accidentally
     * returning a Customer model from a customer-scoped controller should
     * never leak `internal_notes` (staff-written) or `sms_opt_out_at`
     * (audit metadata).
     */
    protected $hidden = [
        'password',
        'internal_notes',
        'sms_opt_out_at',
        'credit_notes',
    ];

    protected $casts = [
        'password' => 'hashed',
        'is_profile_complete' => 'boolean',
        'loyalty_points' => 'integer',
        'is_active' => 'boolean',
        'last_login_at' => 'datetime',
        'last_order_at' => 'datetime',
        'date_of_birth' => 'date',
        'preferences' => 'array',
        'sms_opt_out' => 'boolean',
        'sms_opt_out_at' => 'datetime',
        'is_gst_registered' => 'boolean',
        'credit_enabled' => 'boolean',
        'credit_approved_at' => 'datetime',
        'credit_limit_laar' => 'integer',
        'credit_balance_laar' => 'integer',
        'credit_payment_terms_days' => 'integer',
        'credit_reminder_sms' => 'boolean',
    ];

    protected $attributes = [
        'credit_enabled' => false,
        'credit_limit_laar' => 0,
        'credit_balance_laar' => 0,
        'credit_status' => 'blocked',
        'credit_payment_terms_days' => 30,
        'credit_reminder_sms' => true,
    ];

    public function orders(): HasMany
    {
        return $this->hasMany(Order::class);
    }

    public function paidOrders(): HasMany
    {
        return $this->hasMany(Order::class)->whereNotNull('paid_at')
            ->whereNotIn('status', ['cancelled', 'refunded', 'partially_refunded']);
    }

    public function tags(): BelongsToMany
    {
        return $this->belongsToMany(CustomerTag::class, 'customer_tag_assignments')
            ->withTimestamps()
            ->withPivot(['assigned_by']);
    }

    public function followUpNotes(): HasMany
    {
        return $this->hasMany(CustomerFollowUpNote::class);
    }

    public function reviews(): HasMany
    {
        return $this->hasMany(Review::class);
    }

    public function referralCodes(): HasMany
    {
        return $this->hasMany(ReferralCode::class);
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

    public function creditApprovedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'credit_approved_by');
    }

    public function creditLedger(): HasMany
    {
        return $this->hasMany(CustomerCreditLedger::class);
    }

    public function addresses(): HasMany
    {
        return $this->hasMany(CustomerAddress::class);
    }

    public function smsLogs(): HasMany
    {
        return $this->hasMany(SmsLog::class);
    }
}
