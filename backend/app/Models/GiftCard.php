<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class GiftCard extends Model
{
    protected $fillable = ['code', 'initial_balance', 'current_balance', 'issued_to_customer_id', 'purchased_by_customer_id', 'status', 'expires_at'];
    protected $casts    = ['initial_balance' => 'decimal:2', 'current_balance' => 'decimal:2', 'expires_at' => 'date'];

    public function issuedTo(): BelongsTo     { return $this->belongsTo(Customer::class, 'issued_to_customer_id'); }
    public function purchasedBy(): BelongsTo  { return $this->belongsTo(Customer::class, 'purchased_by_customer_id'); }
    public function transactions(): HasMany   { return $this->hasMany(GiftCardTransaction::class); }
}
