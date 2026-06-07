<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class CustomerDepositAccount extends Model
{
    protected $fillable = [
        'customer_id',
        'balance_laar',
        'status',
        'created_by',
        'updated_by',
        'notes',
    ];

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function updatedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'updated_by');
    }

    public function ledgerEntries(): HasMany
    {
        return $this->hasMany(CustomerDepositLedger::class, 'customer_id', 'customer_id');
    }
}
