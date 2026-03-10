<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Referral extends Model
{
    protected $fillable = ['referral_code_id', 'referee_customer_id', 'order_id', 'reward_paid'];
    protected $casts    = ['reward_paid' => 'boolean'];

    public function code(): BelongsTo     { return $this->belongsTo(ReferralCode::class, 'referral_code_id'); }
    public function referee(): BelongsTo  { return $this->belongsTo(Customer::class, 'referee_customer_id'); }
    public function order(): BelongsTo    { return $this->belongsTo(Order::class); }
}
