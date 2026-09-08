<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Supplier extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'name',
        'contact_name',
        'phone',
        'email',
        'tin',
        'address',
        'payment_terms',
        // Where to send their money. An account number alone does not pay
        // anybody here: two banks issue them, and the name on the account is
        // often the shopkeeper's rather than the shop's (owner, 2026-09-08).
        'bank_name',
        'bank_account_name',
        'bank_account_number',
        // Stock audit 2026-09-03 (S6): days from order to delivery, per vendor.
        'lead_days',
        'notes',
        'is_active',
    ];

    public function purchases(): HasMany
    {
        return $this->hasMany(Purchase::class);
    }
}
