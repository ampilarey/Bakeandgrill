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
