<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ReferralCode extends Model
{
    protected $fillable = ['customer_id', 'code', 'uses_count', 'max_uses', 'referrer_reward_mvr', 'referee_discount_mvr', 'is_active'];
    protected $casts    = ['is_active' => 'boolean', 'referrer_reward_mvr' => 'decimal:2', 'referee_discount_mvr' => 'decimal:2'];

    public function customer(): BelongsTo { return $this->belongsTo(Customer::class); }
    public function referrals(): HasMany  { return $this->hasMany(Referral::class); }
}
