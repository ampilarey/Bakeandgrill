<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One customer sharing their wallet with another (a family wallet, phase 4,
 * owner 2026-10-21). See App\Domains\Deposits\Support\WalletMembers.
 */
class WalletMember extends Model
{
    protected $fillable = ['owner_customer_id', 'member_customer_id'];

    public function owner(): BelongsTo
    {
        return $this->belongsTo(Customer::class, 'owner_customer_id');
    }

    public function member(): BelongsTo
    {
        return $this->belongsTo(Customer::class, 'member_customer_id');
    }
}
